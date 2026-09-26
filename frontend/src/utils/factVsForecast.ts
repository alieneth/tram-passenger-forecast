import type { ActualItem, ForecastItem } from '../api';
import { datesInRange, formatDate } from './dates';

export interface FactPoint {
  key: string;
  date: string;
  hour: number;
  actual: number | null;
  forecast: number | null;
}

// Непрерывная ось «дата + час» за период; пропуски — null (разрыв линии, а не ноль)
export function buildFactPoints(
  from: string,
  to: string,
  actuals: ActualItem[],
  forecast: ForecastItem[],
): FactPoint[] {
  const key = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}`;
  const actualMap = new Map(
    actuals.map((item) => [key(item.date, item.hour ?? 0), item.boardings]),
  );
  const forecastMap = new Map(
    forecast.map((item) => [key(item.date, item.hour ?? 0), item.prediction]),
  );
  return datesInRange(from, to).flatMap((date) =>
    Array.from({ length: 24 }, (_, hour) => ({
      key: key(date, hour),
      date,
      hour,
      actual: actualMap.get(key(date, hour)) ?? null,
      forecast: forecastMap.get(key(date, hour)) ?? null,
    })),
  );
}

// MAE по часам, где есть и факт, и прогноз — та же метрика, что в model_quality
export function meanAbsoluteError(points: FactPoint[]): number | null {
  const errors = points.flatMap((point) =>
    point.actual !== null && point.forecast !== null
      ? [Math.abs(point.actual - point.forecast)]
      : [],
  );
  if (errors.length === 0) return null;
  return errors.reduce((total, error) => total + error, 0) / errors.length;
}

// Подпись оси: полночь каждого дня — «01.10»
export function dayTicks(points: FactPoint[]): string[] {
  return points.filter((point) => point.hour === 0).map((point) => point.key);
}

export function tickLabel(key: string): string {
  return formatDate(key.slice(0, 10)).slice(0, 5);
}
