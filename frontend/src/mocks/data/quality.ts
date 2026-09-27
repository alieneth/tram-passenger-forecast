import type { ModelQuality } from '../../api/types';

type RouteQuality = ModelQuality['by_route'][number];

// Качество модели на сентябре–октябре. Общая строка и маршрут 1 — ровно из примера контракта,
// остальные — условные числа того же порядка. Маршрут 5 исключён организаторами — строки нет
const DAY_BY_ROUTE: [route: number, model: number, baseline: number][] = [
  [1, 42, 78],
  [7, 37, 70],
  [11, 41, 76],
  [12, 45, 83],
  [17, 36, 67],
  [25, 29, 55],
  [26, 39, 72],
  [28, 31, 58],
  [50, 33, 61],
];
// На месяце ошибка по дням крупнее — сравнивается сумма за день
const MONTH_SCALE = 9.5;

function improvement(model: number, baseline: number): number {
  return Math.round(((baseline - model) / baseline) * 100);
}

function byRoute(scale: number): RouteQuality[] {
  return DAY_BY_ROUTE.map(([route, model, baseline]) => ({
    route,
    model_mae: model * scale,
    baseline_mae: baseline * scale,
    improvement_pct: improvement(model, baseline),
    method: 'model',
  }));
}

export const qualityMock: Record<ModelQuality['horizon'], ModelQuality> = {
  day: {
    model_version: 'lgbm-v3',
    horizon: 'day',
    eval_date_from: '2025-09-01',
    eval_date_to: '2025-10-31',
    overall: { model_mae: 38.0, baseline_mae: 71.0, improvement_pct: 46 },
    by_route: byRoute(1),
  },
  month: {
    model_version: 'lgbm-v3',
    horizon: 'month',
    eval_date_from: '2025-09-01',
    eval_date_to: '2025-10-31',
    overall: {
      model_mae: 38.0 * MONTH_SCALE,
      baseline_mae: 71.0 * MONTH_SCALE,
      improvement_pct: 46,
    },
    by_route: byRoute(MONTH_SCALE),
  },
};
