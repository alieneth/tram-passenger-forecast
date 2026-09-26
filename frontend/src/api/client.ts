// Единственная точка доступа к данным. Экраны не знают, откуда данные — из API или из моков.
import { IS_MOCK_MODE, MOCK_FALLBACK } from './config';
import { markMocked, shouldFallback } from './fallback';
import {
  buildQuery,
  getFile,
  getJson,
  sendJson,
  type DownloadedFile,
  type QueryParams,
} from './http';
import type {
  ActualsResponse,
  DecisionList,
  DecisionStatusResult,
  DecisionStatusUpdate,
  FactorsResponse,
  ForecastResponse,
  Health,
  ModelQuality,
  RouteGeometry,
  RouteList,
  operations,
} from './types';

// Моки грузятся отдельным чанком — только в мок-режиме или когда реальный метод пришлось подменить
const loadMock = () => import('../mocks/handlers');
type MockHandlers = Awaited<ReturnType<typeof loadMock>>;

// Параметры запросов — прямо из контракта, без ручного дублирования
export type RoutesQuery = NonNullable<operations['getRoutes']['parameters']['query']>;
export type GeometryQuery = NonNullable<operations['getRouteGeometry']['parameters']['query']>;
export type ForecastQuery = operations['getForecast']['parameters']['query'];
export type ActualsQuery = operations['getActuals']['parameters']['query'];
export type FactorsQuery = operations['getFactors']['parameters']['query'];
export type ExportQuery = operations['exportForecast']['parameters']['query'];
export type DecisionsQuery = NonNullable<operations['getDecisions']['parameters']['query']>;
export type ModelQualityQuery = operations['getModelQuality']['parameters']['query'];

export type { DownloadedFile };

// Моки, реальный API или реальный API с подменой — выбор в одном месте
async function call<T>(
  method: string,
  real: () => Promise<T>,
  mock: (handlers: MockHandlers) => Promise<T>,
  // Успешный ответ, который в гибридном режиме тоже значит «ещё не готово» (пустой справочник)
  notReadyYet: (result: T) => boolean = () => false,
): Promise<T> {
  if (IS_MOCK_MODE) return mock(await loadMock());
  try {
    const result = await real();
    if (MOCK_FALLBACK && notReadyYet(result)) {
      markMocked(method, true);
      return mock(await loadMock());
    }
    if (MOCK_FALLBACK) markMocked(method, false);
    return result;
  } catch (error) {
    if (!MOCK_FALLBACK || !shouldFallback(error)) throw error;
    markMocked(method, true);
    return mock(await loadMock());
  }
}

// Маршрутов в проекте всегда 10 — пустой справочник значит, что бэкенд его ещё не загрузил
export function getRoutes(query: RoutesQuery = {}, signal?: AbortSignal): Promise<RouteList> {
  return call(
    'routes',
    () => getJson<RouteList>('/routes', query, signal),
    (mock) => mock.getRoutes(query),
    (routes) => routes.total === 0 && query.is_new === undefined,
  );
}

export function getRouteGeometry(
  route: number,
  query: GeometryQuery = {},
  signal?: AbortSignal,
): Promise<RouteGeometry> {
  return call(
    'geometry',
    () => getJson(`/routes/${route}/geometry`, query, signal),
    (mock) => mock.getRouteGeometry(route, query),
  );
}

export function getForecast(query: ForecastQuery, signal?: AbortSignal): Promise<ForecastResponse> {
  return call(
    'forecast',
    () => getJson('/forecast', query, signal),
    (mock) => mock.getForecast(query),
  );
}

export function getActuals(query: ActualsQuery, signal?: AbortSignal): Promise<ActualsResponse> {
  return call(
    'actuals',
    () => getJson('/actuals', query, signal),
    (mock) => mock.getActuals(query),
  );
}

export function getFactors(query: FactorsQuery, signal?: AbortSignal): Promise<FactorsResponse> {
  return call(
    'factors',
    () => getJson('/factors', query, signal),
    (mock) => mock.getFactors(query),
  );
}

export function exportForecast(query: ExportQuery, signal?: AbortSignal): Promise<DownloadedFile> {
  const extension = query.format === 'xlsx' ? 'xlsx' : 'csv';
  const fallbackFilename = `forecast_${query.date_from}_${query.date_to}.${extension}`;
  return call(
    'export',
    () => getFile('/export', query, fallbackFilename, signal),
    (mock) => mock.exportForecast(query, fallbackFilename),
  );
}

// 503 «БД недоступна» приходит с телом Health — показываем его как состояние, а не как ошибку
const HEALTH_DOWN_STATUS = 503;

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return call(
    'health',
    () => getJson('/health', {}, signal, [HEALTH_DOWN_STATUS]),
    (mock) => mock.getHealth(),
  );
}

// Относительный адрес запроса — для примера на экране «Экспорт и API»
export function describeRequest(path: string, params: QueryParams): string {
  const query = buildQuery(params);
  return `${path}${query ? `?${query}` : ''}`;
}

// Методы решений требуют Bearer-токен роли «Диспетчер». Откуда фронт берёт токен, в контракте
// пока не описано — без него API ответит 401, и экран покажет «Требуется авторизация»
export function getDecisions(
  query: DecisionsQuery = {},
  signal?: AbortSignal,
): Promise<DecisionList> {
  return call(
    'decisions',
    () => getJson('/decisions', query, signal),
    (mock) => mock.getDecisions(query),
  );
}

// Принять / отклонить / отметить исполнение. Причина обязательна для rejected и not_executed
export function updateDecisionStatus(
  decisionId: number,
  update: DecisionStatusUpdate,
): Promise<DecisionStatusResult> {
  return call(
    'decisions',
    () => sendJson('PATCH', `/decisions/${decisionId}`, update),
    (mock) => mock.updateDecisionStatus(decisionId, update),
  );
}

// MAE нашей и базовой модели на сентябре–октябре
export function getModelQuality(
  query: ModelQualityQuery,
  signal?: AbortSignal,
): Promise<ModelQuality> {
  return call(
    'model/quality',
    () => getJson('/model/quality', query, signal),
    (mock) => mock.getModelQuality(query),
  );
}
