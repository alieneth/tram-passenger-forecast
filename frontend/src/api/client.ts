// Единственная точка доступа к данным. Экраны не знают, откуда данные — из API или из моков.
import { IS_MOCK_MODE } from './config';
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
  RouteGeometry,
  RouteList,
  operations,
} from './types';

// Моки грузятся отдельным чанком и только в мок-режиме — в сборку с реальным API они не попадают
const loadMock = () => import('../mocks/handlers');

// Параметры запросов — прямо из контракта, без ручного дублирования
export type RoutesQuery = NonNullable<operations['getRoutes']['parameters']['query']>;
export type GeometryQuery = NonNullable<operations['getRouteGeometry']['parameters']['query']>;
export type ForecastQuery = operations['getForecast']['parameters']['query'];
export type ActualsQuery = operations['getActuals']['parameters']['query'];
export type FactorsQuery = operations['getFactors']['parameters']['query'];
export type ExportQuery = operations['exportForecast']['parameters']['query'];
export type DecisionsQuery = NonNullable<operations['getDecisions']['parameters']['query']>;

export type { DownloadedFile };

export function getRoutes(query: RoutesQuery = {}, signal?: AbortSignal): Promise<RouteList> {
  return IS_MOCK_MODE
    ? loadMock().then((mock) => mock.getRoutes(query))
    : getJson('/routes', query, signal);
}

export function getRouteGeometry(
  route: number,
  query: GeometryQuery = {},
  signal?: AbortSignal,
): Promise<RouteGeometry> {
  return IS_MOCK_MODE
    ? loadMock().then((mock) => mock.getRouteGeometry(route, query))
    : getJson(`/routes/${route}/geometry`, query, signal);
}

export function getForecast(query: ForecastQuery, signal?: AbortSignal): Promise<ForecastResponse> {
  return IS_MOCK_MODE
    ? loadMock().then((mock) => mock.getForecast(query))
    : getJson('/forecast', query, signal);
}

export function getActuals(query: ActualsQuery, signal?: AbortSignal): Promise<ActualsResponse> {
  return IS_MOCK_MODE
    ? loadMock().then((mock) => mock.getActuals(query))
    : getJson('/actuals', query, signal);
}

export function getFactors(query: FactorsQuery, signal?: AbortSignal): Promise<FactorsResponse> {
  return IS_MOCK_MODE
    ? loadMock().then((mock) => mock.getFactors(query))
    : getJson('/factors', query, signal);
}

export function exportForecast(query: ExportQuery, signal?: AbortSignal): Promise<DownloadedFile> {
  const extension = query.format === 'xlsx' ? 'xlsx' : 'csv';
  const fallbackFilename = `forecast_${query.date_from}_${query.date_to}.${extension}`;
  return IS_MOCK_MODE
    ? loadMock().then((mock) => mock.exportForecast(query, fallbackFilename))
    : getFile('/export', query, fallbackFilename, signal);
}

// 503 «БД недоступна» приходит с телом Health — показываем его как состояние, а не как ошибку
const HEALTH_DOWN_STATUS = 503;

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return IS_MOCK_MODE
    ? loadMock().then((mock) => mock.getHealth())
    : getJson('/health', {}, signal, [HEALTH_DOWN_STATUS]);
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
  return IS_MOCK_MODE
    ? loadMock().then((mock) => mock.getDecisions(query))
    : getJson('/decisions', query, signal);
}

// Принять / отклонить / отметить исполнение. Причина обязательна для rejected и not_executed
export function updateDecisionStatus(
  decisionId: number,
  update: DecisionStatusUpdate,
): Promise<DecisionStatusResult> {
  return IS_MOCK_MODE
    ? loadMock().then((mock) => mock.updateDecisionStatus(decisionId, update))
    : sendJson('PATCH', `/decisions/${decisionId}`, update);
}
