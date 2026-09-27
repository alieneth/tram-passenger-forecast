import type { Horizon } from '../api';
import { FORECAST_DATE_MAX, FORECAST_DATE_MIN } from '../config/constants';
import { monthRange, weekRange } from './dates';

// Горизонт на экране: день — по часам, неделя и месяц — по дням (Q&A 26.09).
// В контракте горизонтов два: неделя — это horizon=month (по дням) за семь дней
export type ViewHorizon = 'day' | 'week' | 'month';

export function apiHorizon(view: ViewHorizon): Horizon {
  return view === 'day' ? 'day' : 'month';
}

export function periodFor(view: ViewHorizon, date: string): { date_from: string; date_to: string } {
  if (view === 'day') return { date_from: date, date_to: date };
  if (view === 'week') return weekRange(date, FORECAST_DATE_MIN, FORECAST_DATE_MAX);
  return monthRange(date);
}
