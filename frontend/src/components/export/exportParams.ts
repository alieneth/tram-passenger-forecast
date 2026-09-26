import type { ExportQuery, ForecastQuery, Horizon } from '../../api';
import { addDays, datesInRange } from '../../utils/dates';

export type FileFormat = Extract<ExportQuery['format'], 'csv' | 'xlsx'>;

// Параметры формы выгрузки. routes = null — все маршруты (параметр route не передаём)
export interface ExportParams {
  horizon: Horizon;
  routes: number[] | null;
  date_from: string;
  date_to: string;
  format: FileFormat;
}

export const PREVIEW_ROWS = 5;
const HOURS_PER_DAY = 24;

export function toExportQuery(params: ExportParams): ExportQuery {
  return {
    format: params.format,
    horizon: params.horizon,
    route: params.routes ?? undefined,
    date_from: params.date_from,
    date_to: params.date_to,
  };
}

// Превью — первые строки файла: файл отсортирован по route, date, hour,
// поэтому достаточно первого маршрута и начала периода, а не всего объёма
export function toPreviewQuery(params: ExportParams, firstRoute: number): ForecastQuery {
  const base = { route: [firstRoute], horizon: params.horizon, date_from: params.date_from };
  if (params.horizon === 'day') {
    return { ...base, date_to: params.date_from, hour_from: 0, hour_to: PREVIEW_ROWS - 1 };
  }
  const lastPreviewDay = addDays(params.date_from, PREVIEW_ROWS - 1);
  return { ...base, date_to: lastPreviewDay < params.date_to ? lastPreviewDay : params.date_to };
}

// Строк в файле: маршрутов × дней × (24 часа для «Дня» или 1 для «Месяца»)
export function expectedRows(params: ExportParams, totalRoutes: number): number {
  if (params.date_to < params.date_from) return 0;
  const days = datesInRange(params.date_from, params.date_to).length;
  const routes = params.routes?.length ?? totalRoutes;
  return routes * days * (params.horizon === 'day' ? HOURS_PER_DAY : 1);
}
