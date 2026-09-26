// Мок-«сервер»: те же ответы и те же ошибки (код + текст), что описаны в контракте и каталоге ошибок.
// Используется только из src/api/client.ts, когда VITE_API_URL не задан.
import type {
  ActualsQuery,
  DownloadedFile,
  ExportQuery,
  FactorsQuery,
  ForecastQuery,
  GeometryQuery,
  RoutesQuery,
} from '../api/client';
import { ApiError } from '../api/errors';
import type {
  ActualItem,
  ActualsResponse,
  FactorsResponse,
  ForecastItem,
  Health,
  ForecastResponse,
  RouteGeometry,
  RouteList,
} from '../api/types';
import { datesBetween } from './data/calendar';
import { factorsFor } from './data/factors';
import { ACTUALS_FROM, FORECAST_TO, allActualItems, allForecastItems } from './data/forecast';
import { geometryMock } from './data/geometry';
import { routesMock } from './data/routes';

// Задержка, чтобы в мок-режиме были видны состояния загрузки
const MOCK_LATENCY_MS = 250;
// Ограничения периода — как в контракте
const MAX_FORECAST_DAYS = 62;
const MAX_ACTUALS_DAYS = 92;
const MODEL_VERSION = 'lgbm-v3';
const GENERATED_AT = '2025-10-31T23:15:00';
const CSV_SEPARATOR = ';';

function respond<T>(data: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(structuredClone(data)), MOCK_LATENCY_MS),
  );
}

function fail(
  status: number,
  code: ApiError['code'],
  message: string,
  details?: ApiError['details'],
): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new ApiError(code, message, status, details)), MOCK_LATENCY_MS),
  );
}

function validationError(field: string, message: string): Promise<never> {
  return fail(400, 'VALIDATION_ERROR', 'Некорректные параметры запроса', [{ field, message }]);
}

function ensureRoutesExist(routes: number[] | undefined): Promise<never> | null {
  const missing = routes?.find((route) => !routesMock.items.some((item) => item.route === route));
  return missing === undefined
    ? null
    : fail(404, 'ROUTE_NOT_FOUND', `Маршрут ${missing} не найден`);
}

function periodError(from: string, to: string, maxDays: number): Promise<never> | null {
  if (to < from) return validationError('date_to', 'Конец периода раньше начала');
  if (datesBetween(from, to).length > maxDays) {
    return validationError('date_to', `Период не больше ${maxDays} дней`);
  }
  return null;
}

export function getRoutes(query: RoutesQuery): Promise<RouteList> {
  const items =
    query.is_new === undefined
      ? routesMock.items
      : routesMock.items.filter((item) => item.is_new === query.is_new);
  return respond({ items, total: items.length });
}

export function getRouteGeometry(route: number, query: GeometryQuery): Promise<RouteGeometry> {
  const notFound = ensureRoutesExist([route]);
  if (notFound) return notFound;
  const geometry = geometryMock[route];
  if (!geometry) {
    return fail(404, 'GEOMETRY_NOT_FOUND', `Для маршрута ${route} нет координат остановок`);
  }
  const directions =
    query.direction_id === undefined
      ? geometry.directions
      : geometry.directions.filter((direction) => direction.direction_id === query.direction_id);
  return respond({ ...geometry, directions });
}

function inPeriod(
  item: { route: number; date: string },
  routes: number[] | undefined,
  from: string,
  to: string,
) {
  return (!routes || routes.includes(item.route)) && item.date >= from && item.date <= to;
}

// «Месяц» — суммы по дням; коридор складываем как есть (для мока достаточно)
function toDaily(items: ForecastItem[]): ForecastItem[] {
  const byKey = new Map<string, ForecastItem>();
  for (const item of items) {
    const key = `${item.route}|${item.date}`;
    const day = byKey.get(key);
    byKey.set(
      key,
      day
        ? {
            ...day,
            prediction: day.prediction + item.prediction,
            lower: day.lower + item.lower,
            upper: day.upper + item.upper,
          }
        : { ...item, hour: null, trams_on_line: null, passengers_per_tram: null },
    );
  }
  return [...byKey.values()];
}

export function getForecast(query: ForecastQuery): Promise<ForecastResponse> {
  const dateTo = query.date_to ?? query.date_from;
  const invalid = periodError(query.date_from, dateTo, MAX_FORECAST_DAYS);
  if (invalid) return invalid;
  const notFound = ensureRoutesExist(query.route);
  if (notFound) return notFound;

  const horizon = query.horizon ?? 'day';
  const hourFrom = query.hour_from ?? 0;
  const hourTo = query.hour_to ?? 23;
  const hourly = allForecastItems().filter(
    (item) =>
      inPeriod(item, query.route, query.date_from, dateTo) &&
      (horizon === 'month' || ((item.hour ?? 0) >= hourFrom && (item.hour ?? 0) <= hourTo)),
  );
  const items = horizon === 'day' ? hourly : toDaily(hourly);
  if (items.length === 0) {
    return fail(404, 'FORECAST_NOT_FOUND', 'Нет прогноза за выбранный период');
  }
  return respond({ model_version: MODEL_VERSION, horizon, items, generated_at: GENERATED_AT });
}

function toDailyActuals(items: ActualItem[]): ActualItem[] {
  const byKey = new Map<string, ActualItem>();
  for (const item of items) {
    const key = `${item.route}|${item.date}`;
    const day = byKey.get(key);
    byKey.set(
      key,
      day
        ? { ...day, boardings: day.boardings + item.boardings }
        : { ...item, hour: null, trams_on_line: null },
    );
  }
  return [...byKey.values()];
}

export function getActuals(query: ActualsQuery): Promise<ActualsResponse> {
  const invalid = periodError(query.date_from, query.date_to, MAX_ACTUALS_DAYS);
  if (invalid) return invalid;
  const notFound = ensureRoutesExist(query.route);
  if (notFound) return notFound;

  const granularity = query.granularity ?? 'hour';
  const hourly = allActualItems().filter((item) =>
    inPeriod(item, query.route, query.date_from, query.date_to),
  );
  if (hourly.length === 0) {
    return fail(404, 'ACTUALS_NOT_FOUND', 'Нет фактических данных за выбранный период');
  }
  const items = granularity === 'hour' ? hourly : toDailyActuals(hourly);
  return respond({ granularity, items });
}

export function getFactors(query: FactorsQuery): Promise<FactorsResponse> {
  if (query.date < ACTUALS_FROM || query.date > FORECAST_TO) {
    return fail(404, 'DATE_NOT_IN_CALENDAR', `Нет данных календаря на ${query.date}`);
  }
  const notFound = query.route === undefined ? null : ensureRoutesExist([query.route]);
  if (notFound) return notFound;
  const factors = factorsFor(query.date);
  if (query.route === undefined) {
    // Без route контракт не отдаёт вклад факторов
    return respond({ ...factors, contributions: undefined });
  }
  const route = query.route;
  const events = factors.events.filter((event) => event.routes.includes(route));
  return respond({ ...factors, events });
}

export function getHealth(): Promise<Health> {
  return respond({
    status: 'UP',
    db: 'UP',
    active_model_version: MODEL_VERSION,
    forecast_generated_at: GENERATED_AT,
  });
}

// Мок отдаёт CSV и для xlsx: собрать настоящий xlsx без бэкенда незачем
export async function exportForecast(
  query: ExportQuery,
  filename: string,
): Promise<DownloadedFile> {
  const isSubmission = query.format === 'submission';
  if (isSubmission && query.horizon === 'month') {
    return validationError('horizon', 'Для формата submission допустим только horizon=day');
  }
  const forecast = await getForecast(query);
  const header = isSubmission
    ? ['route', 'date', 'hour', 'prediction']
    : ['route', 'date', 'hour', 'prediction', 'lower', 'upper'];
  const rows = forecast.items.map((item) =>
    (isSubmission
      ? [item.route, item.date, item.hour, item.prediction]
      : [item.route, item.date, item.hour ?? '', item.prediction, item.lower, item.upper]
    ).join(CSV_SEPARATOR),
  );
  const csv = [header.join(CSV_SEPARATOR), ...rows].join('\n') + '\n';
  return {
    blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    filename: filename.replace(/\.xlsx$/, '.csv'),
  };
}
