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
  ActualsResponse,
  FactorsResponse,
  ForecastItem,
  ForecastResponse,
  RouteGeometry,
  RouteList,
} from '../api/types';
import { factorsMock } from './data/factors';
import { forecastDayMock } from './data/forecastDay';
import { geometryMock } from './data/geometry';
import { routesMock } from './data/routes';

// Задержка, чтобы в мок-режиме были видны состояния загрузки
const MOCK_LATENCY_MS = 250;
const CSV_SEPARATOR = ';';

function respond<T>(data: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(structuredClone(data)), MOCK_LATENCY_MS),
  );
}

function fail(status: number, code: ApiError['code'], message: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new ApiError(code, message, status)), MOCK_LATENCY_MS),
  );
}

function ensureRoutesExist(routes: number[] | undefined): Promise<never> | null {
  const missing = routes?.find((route) => !routesMock.items.some((item) => item.route === route));
  return missing === undefined
    ? null
    : fail(404, 'ROUTE_NOT_FOUND', `Маршрут ${missing} не найден`);
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

function selectForecastItems(query: ForecastQuery): ForecastItem[] {
  const dateTo = query.date_to ?? query.date_from;
  const hourFrom = query.hour_from ?? 0;
  const hourTo = query.hour_to ?? 23;
  return forecastDayMock.items.filter(
    (item) =>
      (!query.route || query.route.includes(item.route)) &&
      item.date >= query.date_from &&
      item.date <= dateTo &&
      item.hour !== null &&
      item.hour !== undefined &&
      item.hour >= hourFrom &&
      item.hour <= hourTo,
  );
}

export function getForecast(query: ForecastQuery): Promise<ForecastResponse> {
  const notFound = ensureRoutesExist(query.route);
  if (notFound) return notFound;
  // В моках есть только горизонт «День» на одну дату — всё остальное честно «нет прогноза»
  const items = (query.horizon ?? 'day') === 'day' ? selectForecastItems(query) : [];
  if (items.length === 0) {
    return fail(404, 'FORECAST_NOT_FOUND', 'Нет прогноза за выбранный период');
  }
  return respond({ ...forecastDayMock, horizon: 'day', items });
}

export function getActuals(query: ActualsQuery): Promise<ActualsResponse> {
  const notFound = ensureRoutesExist(query.route);
  if (notFound) return notFound;
  return fail(404, 'ACTUALS_NOT_FOUND', 'Нет фактических данных за выбранный период');
}

export function getFactors(query: FactorsQuery): Promise<FactorsResponse> {
  const factors = factorsMock[query.date];
  if (!factors) {
    return fail(404, 'DATE_NOT_IN_CALENDAR', `Нет данных календаря на ${query.date}`);
  }
  if (query.route === undefined) {
    // Без route контракт не отдаёт вклад факторов
    return respond({ ...factors, contributions: undefined });
  }
  const events = factors.events.filter((event) => event.routes.includes(query.route as number));
  return respond({ ...factors, events });
}

// Мок отдаёт CSV и для xlsx: собрать настоящий xlsx без бэкенда незачем
export async function exportForecast(
  query: ExportQuery,
  filename: string,
): Promise<DownloadedFile> {
  const forecast = await getForecast(query);
  const isSubmission = query.format === 'submission';
  const header = isSubmission
    ? ['route', 'date', 'hour', 'prediction']
    : ['route', 'date', 'hour', 'prediction', 'lower', 'upper'];
  const rows = forecast.items.map((item) =>
    (isSubmission
      ? [item.route, item.date, item.hour, item.prediction]
      : [item.route, item.date, item.hour, item.prediction, item.lower, item.upper]
    ).join(CSV_SEPARATOR),
  );
  const csv = [header.join(CSV_SEPARATOR), ...rows].join('\n') + '\n';
  return {
    blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    filename: filename.replace(/\.xlsx$/, '.csv'),
  };
}
