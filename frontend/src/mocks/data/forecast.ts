// Генератор мок-прогноза и мок-факта. Детерминированный: одни и те же даты — одни и те же числа.
// Цифры условные, но с правдоподобным ритмом: два пика в будни, ровнее в выходные,
// спад в предновогоднюю неделю. Маршрут 5 исключён организаторами — прогноз 0, факта нет.
import type { ActualItem, ForecastItem } from '../../api/types';
import { datesBetween, isDayOff, parseDate } from './calendar';

export const FORECAST_FROM = '2025-11-01';
export const FORECAST_TO = '2025-12-31';
export const ACTUALS_FROM = '2025-09-01';
export const ACTUALS_TO = '2025-10-31';

// Доля суток по часам 0–23
const WORKDAY_PROFILE = [
  0.004, 0.0005, 0, 0, 0.001, 0.012, 0.035, 0.075, 0.09, 0.07, 0.05, 0.045, 0.047, 0.048, 0.05,
  0.055, 0.068, 0.085, 0.088, 0.07, 0.05, 0.035, 0.022, 0.012,
];
const DAY_OFF_PROFILE = [
  0.006, 0.001, 0, 0, 0.001, 0.008, 0.018, 0.03, 0.045, 0.058, 0.067, 0.072, 0.074, 0.074, 0.072,
  0.07, 0.068, 0.066, 0.064, 0.058, 0.048, 0.036, 0.025, 0.015,
];
// Доля трамваев от пикового выпуска; 0 — трамваи не ходят (1:00–4:59)
const WORKDAY_FLEET = [
  0.3, 0, 0, 0, 0, 0.5, 0.8, 1, 1, 1, 0.7, 0.7, 0.7, 0.7, 0.7, 0.8, 1, 1, 1, 1, 0.7, 0.6, 0.5, 0.4,
];
// В выходные выпуск меньше и ровнее по дню — без утреннего и вечернего пика
const DAY_OFF_FLEET = [
  0.3, 0, 0, 0, 0, 0.4, 0.5, 0.5, 0.6, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.6,
  0.5, 0.4, 0.3,
];
const DAY_OFF_VOLUME = 0.62;
const CORRIDOR = 0.09;
// Шум факта относительно прогноза: WAPE-score на проверке выходит около 0,9, как у настоящей модели
const ACTUAL_NOISE = 0.27;

interface RouteSetup {
  route: number;
  dailyTotal: number;
  // Целевая загрузка в пик буднего дня: > 150 — маршрут попадает в «пиковую нагрузку»
  peakLoad: number;
  // > 1 — сильнее утренний пик, < 1 — вечерний
  morningBias: number;
  // Исключён организаторами: в сабмите нули, истории нет
  noData: boolean;
}

const ROUTES: RouteSetup[] = [
  { route: 1, dailyTotal: 16_400, peakLoad: 128, morningBias: 1.05, noData: false },
  { route: 5, dailyTotal: 9_200, peakLoad: 118, morningBias: 1, noData: true },
  { route: 7, dailyTotal: 21_300, peakLoad: 141, morningBias: 1.1, noData: false },
  { route: 11, dailyTotal: 23_800, peakLoad: 164, morningBias: 0.95, noData: false },
  { route: 12, dailyTotal: 25_600, peakLoad: 171, morningBias: 1.1, noData: false },
  { route: 17, dailyTotal: 20_650, peakLoad: 133, morningBias: 1, noData: false },
  { route: 25, dailyTotal: 12_100, peakLoad: 112, morningBias: 0.9, noData: false },
  { route: 26, dailyTotal: 20_900, peakLoad: 158, morningBias: 0.9, noData: false },
  { route: 28, dailyTotal: 14_300, peakLoad: 121, morningBias: 1, noData: false },
  { route: 50, dailyTotal: 15_200, peakLoad: 126, morningBias: 1.05, noData: false },
];

// Строки маршрута 17 на 14.11.2025 в 7 и 8 часов — ровно из примера ответа GET /forecast
const CONTRACT_EXAMPLE_ITEMS: ForecastItem[] = [
  {
    route: 17,
    date: '2025-11-14',
    hour: 7,
    prediction: 1685,
    lower: 1520,
    upper: 1850,
    trams_on_line: 13,
    passengers_per_tram: 129.6,
    is_analog: false,
  },
  {
    route: 17,
    date: '2025-11-14',
    hour: 8,
    prediction: 1859,
    lower: 1690,
    upper: 2030,
    trams_on_line: 14,
    passengers_per_tram: 132.8,
    is_analog: false,
  },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function wave(seed: number): number {
  return Math.sin(seed * 12.9898) * 0.5 + Math.sin(seed * 78.233) * 0.5;
}

function dayIndex(date: string): number {
  return Math.round(parseDate(date).getTime() / 86_400_000);
}

// Сезонный множитель: ровно в ноябре, спад в предновогоднюю неделю, 31 декабря — минимум
function seasonFactor(date: string): number {
  if (date === '2025-12-31') return 0.55;
  if (date >= '2025-12-24') return 0.9;
  return 1;
}

function hourShare(profile: number[], hour: number, morningBias: number): number {
  const base = profile[hour] ?? 0;
  if (hour >= 6 && hour <= 10) return base * morningBias;
  if (hour >= 16 && hour <= 20) return base / morningBias;
  return base;
}

function peakTrams(setup: RouteSetup): number {
  const shares = HOURS.map((hour) => hourShare(WORKDAY_PROFILE, hour, setup.morningBias));
  const sum = shares.reduce((total, share) => total + share, 0);
  return Math.ceil((setup.dailyTotal * Math.max(...shares)) / sum / setup.peakLoad);
}

interface HourValue {
  hour: number;
  value: number;
  trams: number | null;
}

// Общая основа прогноза и факта: пассажиры и трамваи по часам на дату
function hourlyValues(setup: RouteSetup, date: string, noise: number): HourValue[] {
  const dayOff = isDayOff(date);
  const profile = dayOff ? DAY_OFF_PROFILE : WORKDAY_PROFILE;
  const shares = HOURS.map((hour) => hourShare(profile, hour, setup.morningBias));
  const sum = shares.reduce((total, share) => total + share, 0);
  const day = dayIndex(date);
  const dayTotal =
    setup.dailyTotal *
    (dayOff ? DAY_OFF_VOLUME : 1) *
    seasonFactor(date) *
    (1 + 0.02 * wave(day + setup.route));
  const fleet = peakTrams(setup);
  const fleetProfile = dayOff ? DAY_OFF_FLEET : WORKDAY_FLEET;

  return HOURS.map((hour) => {
    const jitter = 1 + 0.04 * wave(setup.route * 31 + hour) + noise * wave(day * 7 + hour);
    const fleetShare = fleetProfile[hour] ?? 0;
    return {
      hour,
      value: Math.max(0, Math.round(((dayTotal * (shares[hour] ?? 0)) / sum) * jitter)),
      trams: fleetShare > 0 ? Math.max(1, Math.round(fleet * fleetShare)) : null,
    };
  });
}

function toForecastItems(setup: RouteSetup, date: string): ForecastItem[] {
  if (setup.noData) {
    return HOURS.map((hour) => ({
      route: setup.route,
      date,
      hour,
      prediction: 0,
      lower: 0,
      upper: 0,
      trams_on_line: null,
      passengers_per_tram: null,
      is_analog: false,
    }));
  }
  return hourlyValues(setup, date, 0).map(({ hour, value, trams }) => {
    const example = CONTRACT_EXAMPLE_ITEMS.find(
      (item) => item.route === setup.route && item.date === date && item.hour === hour,
    );
    if (example) return example;
    return {
      route: setup.route,
      date,
      hour,
      prediction: value,
      lower: Math.max(0, Math.round(value * (1 - CORRIDOR))),
      upper: Math.round(value * (1 + CORRIDOR)),
      trams_on_line: trams,
      passengers_per_tram: trams ? Math.round((value / trams) * 10) / 10 : null,
      is_analog: false,
    };
  });
}

// Факт — та же основа плюс «жизненный» шум; у маршрута 5 истории нет
function toActualItems(setup: RouteSetup, date: string): ActualItem[] {
  if (setup.noData) return [];
  return hourlyValues(setup, date, ACTUAL_NOISE).map(({ hour, value, trams }) => ({
    route: setup.route,
    date,
    hour,
    boardings: value,
    trams_on_line: trams,
  }));
}

function buildAll<T>(from: string, to: string, build: (setup: RouteSetup, date: string) => T[]) {
  return ROUTES.flatMap((setup) => datesBetween(from, to).flatMap((date) => build(setup, date)));
}

// Прогноз модели на сентябрь–октябрь (проверка на истории): по нему строится «Факт и прогноз»
// на экране «Качество модели» и WAPE. У маршрута без данных такого прогноза нет — сравнивать не с чем
function toBacktestItems(setup: RouteSetup, date: string): ForecastItem[] {
  return setup.noData ? [] : toForecastItems(setup, date);
}

// Считаем один раз при первом обращении. Прогноз ноября–декабря: 10 маршрутов × 61 день × 24 часа =
// 14 640 строк, ровно столько, сколько в test_submission.csv; плюс проверка на сентябре–октябре
let forecastCache: ForecastItem[] | null = null;
let actualsCache: ActualItem[] | null = null;

export function allForecastItems(): ForecastItem[] {
  forecastCache ??= [
    ...buildAll(ACTUALS_FROM, ACTUALS_TO, toBacktestItems),
    ...buildAll(FORECAST_FROM, FORECAST_TO, toForecastItems),
  ];
  return forecastCache;
}

export function allActualItems(): ActualItem[] {
  actualsCache ??= buildAll(ACTUALS_FROM, ACTUALS_TO, toActualItems);
  return actualsCache;
}
