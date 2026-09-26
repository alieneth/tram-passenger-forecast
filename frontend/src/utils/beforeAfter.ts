import type { Decision, ForecastItem } from '../api';
import { formatHour } from './format';

// Сколько часов показывать до и после интервала решения
const CONTEXT_HOURS = 4;
const FIRST_SERVICE_HOUR = 5;
const LAST_SERVICE_HOUR = 23;

export interface LoadPoint {
  hour: number;
  label: string;
  before: number | null;
  after: number | null;
  inInterval: boolean;
}

// Пассажиров на трамвай до и после решения по часам. Поток считаем неизменным (бизнес-правило):
// меняется только число трамваев в интервале решения — у маршрута +trams_delta, у донора −trams_delta.
// «После» есть только в интервале: вне его ничего не меняется, и пара одинаковых столбиков — шум
export function loadPoints(
  items: ForecastItem[],
  decision: Decision,
  role: 'route' | 'donor',
): LoadPoint[] {
  const from = Math.max(FIRST_SERVICE_HOUR, decision.hour_from - CONTEXT_HOURS);
  const to = Math.min(LAST_SERVICE_HOUR, decision.hour_to + CONTEXT_HOURS);
  const delta = role === 'route' ? decision.trams_delta : -decision.trams_delta;
  const points: LoadPoint[] = [];
  for (let hour = from; hour <= to; hour += 1) {
    const item = items.find((forecast) => forecast.hour === hour);
    const trams = item?.trams_on_line ?? null;
    const inInterval = hour >= decision.hour_from && hour <= decision.hour_to;
    const before = item?.passengers_per_tram ?? null;
    const tramsAfter = trams === null || !inInterval ? null : trams + delta;
    points.push({
      hour,
      label: formatHour(hour),
      before,
      after:
        item && tramsAfter !== null && tramsAfter > 0
          ? Math.round((item.prediction / tramsAfter) * 10) / 10
          : null,
      inInterval,
    });
  }
  return points;
}

export function maxLoad(points: LoadPoint[], key: 'before' | 'after'): number | null {
  const values = points.flatMap((point) => (point[key] === null ? [] : [point[key]]));
  return values.length ? Math.max(...values) : null;
}
