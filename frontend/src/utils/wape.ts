import type { ActualItem, ForecastItem } from '../api';

const wapeFormat = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export interface WapeRoute {
  route: number;
  score: number | null;
  actualTotal: number;
}

export interface WapeResult {
  // По часам — ровно так считают организаторы по сабмиту
  hourly: number | null;
  // По суммам за день — точность для горизонтов «Неделя» и «Месяц»
  daily: number | null;
  byRoute: WapeRoute[];
  // Сколько часов сравнили: там, где есть и факт, и прогноз
  pairs: number;
}

interface Totals {
  error: number;
  actual: number;
}

// WAPE-score = max(0, 1 − Σ|факт − прогноз| / Σ факт) — метрика организаторов (CLAUDE.md 13.1)
export function wapeScore({ error, actual }: Totals): number | null {
  if (actual <= 0) return null;
  return Math.max(0, 1 - error / actual);
}

function add(
  map: Map<string | number, Totals>,
  key: string | number,
  error: number,
  actual: number,
) {
  const totals = map.get(key) ?? { error: 0, actual: 0 };
  totals.error += error;
  totals.actual += actual;
  map.set(key, totals);
}

// Сравниваем только часы, где есть и факт, и прогноз: пропуск в данных — не ошибка модели
export function computeWape(
  actuals: ActualItem[],
  forecast: ForecastItem[],
  excluded: (route: number) => boolean,
): WapeResult {
  const key = (route: number, date: string, hour: number | null | undefined) =>
    `${route}|${date}|${hour ?? 0}`;
  const predictions = new Map(
    forecast.map((item) => [key(item.route, item.date, item.hour), item.prediction]),
  );
  const total: Totals = { error: 0, actual: 0 };
  const byRoute = new Map<string | number, Totals>();
  const byDay = new Map<string | number, { actual: number; prediction: number }>();
  let pairs = 0;

  for (const item of actuals) {
    if (excluded(item.route)) continue;
    const prediction = predictions.get(key(item.route, item.date, item.hour));
    if (prediction === undefined) continue;
    const error = Math.abs(item.boardings - prediction);
    pairs += 1;
    total.error += error;
    total.actual += item.boardings;
    add(byRoute, item.route, error, item.boardings);
    const dayKey = `${item.route}|${item.date}`;
    const day = byDay.get(dayKey) ?? { actual: 0, prediction: 0 };
    day.actual += item.boardings;
    day.prediction += prediction;
    byDay.set(dayKey, day);
  }

  const daily = [...byDay.values()].reduce(
    (sum, day) => ({
      error: sum.error + Math.abs(day.actual - day.prediction),
      actual: sum.actual + day.actual,
    }),
    { error: 0, actual: 0 },
  );

  return {
    hourly: wapeScore(total),
    daily: wapeScore(daily),
    byRoute: [...byRoute.entries()]
      .map(([route, totals]) => ({
        route: Number(route),
        score: wapeScore(totals),
        actualTotal: totals.actual,
      }))
      .sort((a, b) => a.route - b.route),
    pairs,
  };
}

// 0,8912 → «0,891»: три знака — как в рейтинге организаторов
export function formatWape(score: number | null): string {
  return score === null ? '—' : wapeFormat.format(score);
}
