import type { ForecastItem } from '../api';
import { PASSENGERS_PER_TRAM_NORM } from '../config/constants';
import type { ComparePoint } from '../hooks/useWeekAgo';
import { formatHour } from './format';

export interface ChartPoint {
  hour: number;
  label: string;
  item: ForecastItem;
  prediction: number;
  corridor: [number, number];
  compare: number | null;
  // Порог в пассажирах в час: норма на трамвай × трамваев на линии в этот час
  threshold: number | null;
  // Полоса «выше нормы»: от порога до прогноза, если прогноз выше; иначе нулевой высоты.
  // Без разрывов — иначе одиночный час над нормой не нарисуется
  overNorm: [number, number] | null;
}

export function buildChartPoints(
  items: ForecastItem[],
  hours: readonly number[],
  compare: ComparePoint[] | undefined,
): ChartPoint[] {
  return hours.flatMap((hour) => {
    const item = items.find((forecast) => forecast.hour === hour);
    if (!item) return [];
    const threshold =
      item.trams_on_line !== null && item.trams_on_line !== undefined
        ? item.trams_on_line * PASSENGERS_PER_TRAM_NORM
        : null;
    return [
      {
        hour,
        label: formatHour(hour),
        item,
        prediction: item.prediction,
        corridor: [item.lower, item.upper],
        compare: compare?.find((point) => point.hour === hour)?.value ?? null,
        threshold,
        overNorm: threshold === null ? null : [threshold, Math.max(threshold, item.prediction)],
      },
    ];
  });
}

export function peakPoint(points: ChartPoint[]): ChartPoint | undefined {
  return points.reduce<ChartPoint | undefined>(
    (peak, point) => (!peak || point.prediction > peak.prediction ? point : peak),
    undefined,
  );
}
