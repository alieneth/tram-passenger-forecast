// Даты — строки ISO по московскому времени. Date используем только как календарь (UTC),
// чтобы часовой пояс браузера не сдвигал день.

const WEEKDAY_NAMES = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
];

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function parseIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

// day_of_week в контракте: 1 — понедельник … 7 — воскресенье
export function weekdayName(dayOfWeek: number): string {
  return WEEKDAY_NAMES[dayOfWeek % 7] ?? '';
}

export function monthTitle(date: string): string {
  const parsed = parseIsoDate(date);
  return `${MONTH_NAMES[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
}

export function monthRange(date: string): { date_from: string; date_to: string } {
  const parsed = parseIsoDate(date);
  const first = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  const last = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
  return { date_from: toIsoDate(first), date_to: toIsoDate(last) };
}

export function clampDate(date: string, min: string, max: string): string {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}
