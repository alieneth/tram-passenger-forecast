import { DISPLAY_HOURS } from './constants';

export interface HourInterval {
  id: string;
  label: string;
  hours: readonly number[];
}

const between = (from: number, to: number) =>
  DISPLAY_HOURS.filter((hour) => hour !== 0 && hour >= from && hour <= to);

// Интервалы для экрана «Маршрут»; «00» относится к вечеру
export const HOUR_INTERVALS: readonly HourInterval[] = [
  { id: 'all', label: '05:00 – 00:00', hours: DISPLAY_HOURS },
  { id: 'morning', label: 'Утро 05:00 – 11:00', hours: between(5, 11) },
  { id: 'midday', label: 'День 11:00 – 16:00', hours: between(11, 16) },
  { id: 'evening', label: 'Вечер 16:00 – 00:00', hours: [...between(16, 23), 0] },
];
