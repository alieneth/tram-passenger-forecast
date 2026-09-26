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

export function addDays(date: string, days: number): string {
  const parsed = parseIsoDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return toIsoDate(parsed);
}

export function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

// «пт» для 2025-11-14 — только для подписи строк; тип дня (выходной, праздник) берём из API
export function weekdayShort(date: string): string {
  return WEEKDAY_SHORT[parseIsoDate(date).getUTCDay()] ?? '';
}

export function dayOfMonth(date: string): string {
  return date.slice(8, 10);
}

const MONTH_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];
const MONTH_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

// «1 сен» — подписи оси графика по дням
export function formatDayMonthShort(date: string): string {
  const parsed = parseIsoDate(date);
  return `${parsed.getUTCDate()} ${MONTH_SHORT[parsed.getUTCMonth()]}`;
}

// «4 ноября»
export function formatDayMonth(date: string): string {
  const parsed = parseIsoDate(date);
  return `${parsed.getUTCDate()} ${MONTH_GENITIVE[parsed.getUTCMonth()]}`;
}

// Номер дня недели с понедельника: 0 — пн … 6 — вс (для сетки календаря)
export function weekdayIndexFromMonday(date: string): number {
  return (parseIsoDate(date).getUTCDay() + 6) % 7;
}
