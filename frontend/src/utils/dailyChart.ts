import type { ActualItem, FactorsResponse, ForecastItem } from '../api';
import { datesInRange } from './dates';

export interface DailyPoint {
  date: string;
  actual: number | null;
  forecast: number | null;
  corridor: [number, number] | null;
  item: ForecastItem | null;
  factors: FactorsResponse | undefined;
}

// Одна ось дат: факт до конца октября, прогноз с ноября; где данных нет — null (разрыв линии)
export function buildDailyPoints(
  from: string,
  to: string,
  actuals: ActualItem[],
  forecast: ForecastItem[],
  calendar: Map<string, FactorsResponse>,
): DailyPoint[] {
  const actualByDate = new Map(actuals.map((item) => [item.date, item.boardings]));
  const forecastByDate = new Map(forecast.map((item) => [item.date, item]));
  return datesInRange(from, to).map((date) => {
    const item = forecastByDate.get(date) ?? null;
    return {
      date,
      actual: actualByDate.get(date) ?? null,
      forecast: item?.prediction ?? null,
      corridor: item ? [item.lower, item.upper] : null,
      item,
      factors: calendar.get(date),
    };
  });
}

// Подписи оси: 1-е и 15-е число каждого месяца
export function dailyTicks(points: DailyPoint[]): string[] {
  return points
    .map((point) => point.date)
    .filter((date) => date.endsWith('-01') || date.endsWith('-15'));
}
