// Мок-«сервер»: те же ответы и те же ошибки (код + текст), что описаны в контракте и каталоге ошибок.
// Используется только из src/api/client.ts, когда VITE_API_URL не задан.
import type {
  ActualsQuery,
  DecisionsQuery,
  ModelQualityQuery,
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
  Decision,
  DecisionList,
  DecisionStatusCode,
  DecisionStatusResult,
  DecisionStatusUpdate,
  FactorsResponse,
  ForecastItem,
  Health,
  ModelQuality,
  ForecastResponse,
  RouteGeometry,
  RouteList,
} from '../api/types';
import { datesBetween } from './data/calendar';
import { STATUS_NAMES, decisionDate, decisionsFor } from './data/decisions';
import { factorsFor } from './data/factors';
import {
  ACTUALS_FROM,
  FORECAST_FROM,
  FORECAST_TO,
  allActualItems,
  allForecastItems,
} from './data/forecast';
import { geometryMock } from './data/geometry';
import { qualityMock } from './data/quality';
import { routesMock } from './data/routes';
import { commonFailure, currentScenario } from './scenario';

// Задержка, чтобы в мок-режиме были видны состояния загрузки
const MOCK_LATENCY_MS = 250;
// Ограничения периода — как в контракте
const MAX_FORECAST_DAYS = 62;
const MAX_ACTUALS_DAYS = 92;
const MODEL_VERSION = 'lgbm-v3';
const GENERATED_AT = '2025-10-31T23:15:00';
const CSV_SEPARATOR = ';';

// Общий сбой сценария (?mock=offline, ?mock=server-error) — здесь, чтобы сработал у всех методов
function respond<T>(data: T): Promise<T> {
  const failure = commonFailure();
  return new Promise((resolve, reject) =>
    setTimeout(() => (failure ? reject(failure) : resolve(structuredClone(data))), MOCK_LATENCY_MS),
  );
}

const notReady = () => fail(503, 'FORECAST_NOT_READY', 'Прогноз ещё не рассчитан. Повторите позже');

function fail(
  status: number,
  code: ApiError['code'],
  message: string,
  details?: ApiError['details'],
): Promise<never> {
  const failure = commonFailure() ?? new ApiError(code, message, status, details);
  return new Promise((_, reject) => setTimeout(() => reject(failure), MOCK_LATENCY_MS));
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
  if (currentScenario() === 'empty') return respond({ items: [], total: 0 });
  const items =
    query.is_new === undefined
      ? routesMock.items
      : routesMock.items.filter((item) => item.is_new === query.is_new);
  return respond({ items, total: items.length });
}

export function getRouteGeometry(route: number, query: GeometryQuery): Promise<RouteGeometry> {
  const notFound = ensureRoutesExist([route]);
  if (notFound) return notFound;
  const geometry = currentScenario() === 'no-geometry' ? undefined : geometryMock[route];
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
  if (currentScenario() === 'not-ready') return notReady();

  const horizon = query.horizon ?? 'day';
  const hourFrom = query.hour_from ?? 0;
  const hourTo = query.hour_to ?? 23;
  const hourly = allForecastItems().filter(
    (item) =>
      inPeriod(item, query.route, query.date_from, dateTo) &&
      (horizon === 'month' || ((item.hour ?? 0) >= hourFrom && (item.hour ?? 0) <= hourTo)),
  );
  const items = horizon === 'day' ? hourly : toDaily(hourly);
  if (items.length === 0 || currentScenario() === 'empty') {
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
  if (hourly.length === 0 || currentScenario() === 'empty') {
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

// Изменённые статусы решений живут в памяти вкладки — как будто их сохранил бэкенд
const statusChanges = new Map<number, DecisionStatusResult>();
// Мок-диспетчер, от имени которого меняются статусы
const MOCK_USER = 'dispatcher';

function withStatus(decision: Decision): Decision {
  const change = statusChanges.get(decision.decision_id);
  return change
    ? { ...decision, status_code: change.status_code, status_name: change.status_name }
    : decision;
}

export function getDecisions(query: DecisionsQuery): Promise<DecisionList> {
  const dates = query.date ? [query.date] : datesBetween(FORECAST_FROM, FORECAST_TO);
  const items = dates
    .flatMap(decisionsFor)
    .map(withStatus)
    .filter(
      (item) =>
        (query.route === undefined || item.route === query.route) &&
        (!query.status?.length || query.status.includes(item.status_code)),
    );
  return respond({ items, total: items.length });
}

// Переходы — как в контракте: awaiting, updated → accepted, rejected; accepted → executed, not_executed
const ALLOWED_TRANSITIONS: Partial<Record<DecisionStatusCode, DecisionStatusCode[]>> = {
  awaiting: ['accepted', 'rejected'],
  updated: ['accepted', 'rejected'],
  accepted: ['executed', 'not_executed'],
};
const REASON_REQUIRED: DecisionStatusCode[] = ['rejected', 'not_executed'];
// Время в моке — «сейчас» на дату решения, а не реальные часы: иначе все решения 2025 года просрочены
const MOCK_CHANGED_TIME = 'T09:00:00';

function findDecision(decisionId: number): Decision | undefined {
  const found = decisionsFor(decisionDate(decisionId)).find(
    (item) => item.decision_id === decisionId,
  );
  return found && withStatus(found);
}

function setStatus(decision: Decision, status: DecisionStatusCode, reason: string | null) {
  const result: DecisionStatusResult = {
    decision_id: decision.decision_id,
    status_code: status,
    status_name: STATUS_NAMES[status],
    changed_at: `${decision.date}${MOCK_CHANGED_TIME}`,
    changed_by: MOCK_USER,
    reason,
  };
  statusChanges.set(decision.decision_id, result);
  return result;
}

export function updateDecisionStatus(
  decisionId: number,
  update: DecisionStatusUpdate,
): Promise<DecisionStatusResult> {
  const decision = findDecision(decisionId);
  if (!decision) return fail(404, 'DECISION_NOT_FOUND', `Решение ${decisionId} не найдено`);
  const reason = update.reason?.trim() || null;
  if (REASON_REQUIRED.includes(update.status_code) && !reason) {
    return validationError('reason', 'Укажите причину');
  }
  if (!ALLOWED_TRANSITIONS[decision.status_code]?.includes(update.status_code)) {
    return fail(
      409,
      'INVALID_STATUS_TRANSITION',
      `Нельзя перевести решение из статуса ${decision.status_code} в ${update.status_code}`,
    );
  }
  const result = setStatus(decision, update.status_code, reason);
  // Принят один вариант — остальные варианты этого решения закрываются
  if (update.status_code === 'accepted') {
    const rootId = decision.parent_decision_id ?? decision.decision_id;
    decisionsFor(decision.date)
      .map(withStatus)
      .filter(
        (item) =>
          item.decision_id !== decision.decision_id &&
          (item.decision_id === rootId || item.parent_decision_id === rootId) &&
          // Закрываем только ещё открытые варианты — отклонённый остаётся в истории отклонённым
          ['awaiting', 'updated'].includes(item.status_code),
      )
      .forEach((item) => setStatus(item, 'closed', null));
  }
  return respond(result);
}

export function getModelQuality(query: ModelQualityQuery): Promise<ModelQuality> {
  if (currentScenario() === 'not-ready') return notReady();
  const quality = qualityMock[query.horizon];
  if (query.model_version && query.model_version !== quality.model_version) {
    return fail(404, 'MODEL_VERSION_NOT_FOUND', `Версия модели ${query.model_version} не найдена`);
  }
  return respond(quality);
}

export function getHealth(): Promise<Health> {
  if (currentScenario() === 'not-ready') {
    return respond({
      status: 'DEGRADED',
      db: 'UP',
      active_model_version: null,
      forecast_generated_at: null,
    });
  }
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
