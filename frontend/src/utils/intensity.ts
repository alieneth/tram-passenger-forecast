import type { ForecastItem } from '../api';
import { LOAD_WARNING_SHARE, PASSENGERS_PER_TRAM_NORM } from '../config/constants';

// Цвет означает только интенсивность: зелёный → жёлтый → красный (общее правило 4)
const GREEN: RGB = [34, 197, 94];
const YELLOW: RGB = [250, 204, 21];
const RED: RGB = [239, 68, 68];

type RGB = [number, number, number];

function mix(from: RGB, to: RGB, t: number): RGB {
  const channel = (a: number, b: number) => Math.round(a + (b - a) * t);
  return [channel(from[0], to[0]), channel(from[1], to[1]), channel(from[2], to[2])];
}

function rgb([r, g, b]: RGB): string {
  return `rgb(${r} ${g} ${b})`;
}

// ratio — доля от максимума, 0…1 (тепловые таблицы «пассажиров в час»)
export function intensityColor(ratio: number): string {
  const t = Math.min(1, Math.max(0, ratio));
  return rgb(t < 0.5 ? mix(GREEN, YELLOW, t * 2) : mix(YELLOW, RED, (t - 0.5) * 2));
}

// Загрузка маршрута для карты: один цвет на маршрут целиком.
// «high» — тот же критерий, что у карточки «Маршрутов с пиковой нагрузкой» (isOverNorm)
export type LoadLevel = 'low' | 'medium' | 'high' | 'none';

export const LOAD_COLORS: Record<LoadLevel, string> = {
  low: rgb(GREEN),
  medium: rgb(YELLOW),
  high: rgb(RED),
  none: 'rgb(100 116 139)',
};

export const LOAD_LABELS: Record<LoadLevel, string> = {
  low: `до ${Math.round(PASSENGERS_PER_TRAM_NORM * LOAD_WARNING_SHARE)}`,
  medium: `${Math.round(PASSENGERS_PER_TRAM_NORM * LOAD_WARNING_SHARE)}–${PASSENGERS_PER_TRAM_NORM}`,
  high: `выше ${PASSENGERS_PER_TRAM_NORM}`,
  none: 'трамваи не ходят',
};

export function loadLevel(item: ForecastItem | undefined): LoadLevel {
  const load = item?.passengers_per_tram;
  if (load === null || load === undefined) return 'none';
  if (load > PASSENGERS_PER_TRAM_NORM) return 'high';
  if (load >= PASSENGERS_PER_TRAM_NORM * LOAD_WARNING_SHARE) return 'medium';
  return 'low';
}
