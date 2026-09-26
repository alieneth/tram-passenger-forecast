// Единственная точка доступа к данным. Экраны не знают, откуда данные — из API или из моков.
import { IS_MOCK_MODE } from './config';
import { getFile, getJson, type DownloadedFile } from './http';
import type {
  ActualsResponse,
  FactorsResponse,
  ForecastResponse,
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
