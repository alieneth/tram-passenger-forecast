import type { ForecastItem } from '../api';
import { PASSENGERS_PER_TRAM_NORM } from '../config/constants';

// Расчёты для экранов строятся только из ответа GET /forecast — без своих полей и переименований

export function totalPrediction(items: ForecastItem[]): number {
  return items.reduce((sum, item) => sum + item.prediction, 0);
}

export function peakHour(items: ForecastItem[]): { hour: number; prediction: number } | null {
  const byHour = new Map<number, number>();
  for (const item of items) {
    if (item.hour === null || item.hour === undefined) continue;
    byHour.set(item.hour, (byHour.get(item.hour) ?? 0) + item.prediction);
  }
  let peak: { hour: number; prediction: number } | null = null;
  for (const [hour, prediction] of byHour) {
    if (!peak || prediction > peak.prediction) peak = { hour, prediction };
  }
  return peak;
}

export function isOverNorm(item: ForecastItem): boolean {
  return (item.passengers_per_tram ?? 0) > PASSENGERS_PER_TRAM_NORM;
}

// Маршрут «в пике», если хотя бы в один час пассажиров на трамвай больше нормы
export function routesOverNorm(items: ForecastItem[]): Set<number> {
  return new Set(items.filter(isOverNorm).map((item) => item.route));
}

export function itemsByRouteAndHour(items: ForecastItem[]): Map<number, Map<number, ForecastItem>> {
  const result = new Map<number, Map<number, ForecastItem>>();
  for (const item of items) {
    if (item.hour === null || item.hour === undefined) continue;
    const byHour = result.get(item.route) ?? new Map<number, ForecastItem>();
    byHour.set(item.hour, item);
    result.set(item.route, byHour);
  }
  return result;
}

// Час с наибольшей загрузкой на трамвай — по нему маршрут красится на Обзоре,
// поэтому красных маршрутов на карте столько же, сколько в карточке «пиковой нагрузки»
export function peakLoadItem(items: ForecastItem[]): ForecastItem | undefined {
  return items.reduce<ForecastItem | undefined>(
    (peak, item) =>
      (item.passengers_per_tram ?? -1) > (peak?.passengers_per_tram ?? -1) ? item : peak,
    undefined,
  );
}

export function itemsByRoute(items: ForecastItem[]): Map<number, ForecastItem[]> {
  const result = new Map<number, ForecastItem[]>();
  for (const item of items) {
    result.set(item.route, [...(result.get(item.route) ?? []), item]);
  }
  return result;
}

// Непрерывный интервал часов выше нормы вокруг самого загруженного часа (null — норма не превышена)
export function overloadInterval(
  items: ForecastItem[],
): { hour_from: number; hour_to: number } | null {
  const over = new Set(items.filter(isOverNorm).map((item) => item.hour));
  const peak = peakLoadItem(items.filter(isOverNorm));
  if (!peak || peak.hour === null || peak.hour === undefined) return null;
  let from = peak.hour;
  let to = peak.hour;
  while (over.has(from - 1)) from -= 1;
  while (over.has(to + 1)) to += 1;
  return { hour_from: from, hour_to: to };
}
