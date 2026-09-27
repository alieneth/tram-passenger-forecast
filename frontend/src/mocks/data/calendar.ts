import type { FactorsResponse } from '../../api/types';

// Календарь для моков: сентябрь–декабрь 2025. Особые дни — по производственному календарю 2025
// (переносы: с 1 ноября на 3 ноября, с 5 января на 31 декабря). Сверить с таблицей DATA-5.

type DayType = FactorsResponse['day_type'];

interface SpecialDay {
  day_type: DayType;
  holiday_name?: string;
  special_day_name?: string;
}

const SPECIAL_DAYS: Record<string, SpecialDay> = {
  '2025-11-01': { day_type: 'shortened', special_day_name: 'Рабочая суббота (перенос)' },
  '2025-11-03': { day_type: 'weekend', special_day_name: 'Перенесённый выходной' },
  '2025-11-04': { day_type: 'holiday', holiday_name: 'День народного единства' },
  '2025-12-31': { day_type: 'weekend', special_day_name: 'Перенесённый выходной' },
};

export function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

// 1 — понедельник … 7 — воскресенье, как в контракте
export function dayOfWeek(date: string): number {
  return ((parseDate(date).getUTCDay() + 6) % 7) + 1;
}

export function calendarDay(date: string): SpecialDay {
  const special = SPECIAL_DAYS[date];
  if (special) return special;
  return { day_type: dayOfWeek(date) >= 6 ? 'weekend' : 'working' };
}

export function isDayOff(date: string): boolean {
  const { day_type } = calendarDay(date);
  return day_type === 'weekend' || day_type === 'holiday';
}

export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let day = parseDate(from); day <= parseDate(to); day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}
