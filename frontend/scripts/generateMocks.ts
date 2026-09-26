// Генератор мок-прогноза на горизонте «День»: 10 маршрутов × 24 часа на MOCK_DATE.
// Запуск: npm run mocks:generate. Результат — src/mocks/data/forecastDay.ts (руками не править).
// Цифры условные, но правдоподобные: два пика в будни, ночью почти ноль, у маршрута 5 широкий коридор.
import { writeFileSync } from 'node:fs';
import type { ForecastItem, ForecastResponse } from '../src/api/types.ts';

const MOCK_DATE = '2025-11-14';
const MODEL_VERSION = 'lgbm-v3';
const GENERATED_AT = '2025-11-13T23:15:00';
const OUTPUT_PATH = new URL('../src/mocks/data/forecastDay.ts', import.meta.url);

// Доля суток по часам 0–23 для буднего дня (утренний и вечерний пик)
const WEEKDAY_PROFILE = [
  0.004, 0.0005, 0, 0, 0.001, 0.012, 0.035, 0.075, 0.09, 0.07, 0.05, 0.045, 0.047, 0.048, 0.05,
  0.055, 0.068, 0.085, 0.088, 0.07, 0.05, 0.035, 0.022, 0.012,
];
// Доля трамваев от пикового выпуска по часам; 0 — трамваи не ходят (1:00–4:59)
const FLEET_SHARE = [
  0.3, 0, 0, 0, 0, 0.5, 0.8, 1, 1, 1, 0.7, 0.7, 0.7, 0.7, 0.7, 0.8, 1, 1, 1, 1, 0.7, 0.6, 0.5, 0.4,
];
const CORRIDOR_HISTORY = 0.09;
// У маршрута 5 истории нет — коридор шире (прогноз по аналогам)
const CORRIDOR_ANALOG = 0.25;

interface RouteSetup {
  route: number;
  dailyTotal: number;
  // Целевая загрузка в пик: > 150 — маршрут попадёт в «пиковую нагрузку»
  peakLoad: number;
  // Сдвиг пиков: > 1 — сильнее утро, < 1 — сильнее вечер
  morningBias: number;
  isAnalog: boolean;
}

const ROUTES: RouteSetup[] = [
  { route: 1, dailyTotal: 16_400, peakLoad: 128, morningBias: 1.05, isAnalog: false },
  { route: 5, dailyTotal: 9_200, peakLoad: 118, morningBias: 1, isAnalog: true },
  { route: 7, dailyTotal: 21_300, peakLoad: 141, morningBias: 1.1, isAnalog: false },
  { route: 11, dailyTotal: 23_800, peakLoad: 164, morningBias: 0.95, isAnalog: false },
  { route: 12, dailyTotal: 25_600, peakLoad: 171, morningBias: 1.1, isAnalog: false },
  { route: 17, dailyTotal: 20_650, peakLoad: 133, morningBias: 1, isAnalog: false },
  { route: 25, dailyTotal: 12_100, peakLoad: 112, morningBias: 0.9, isAnalog: false },
  { route: 26, dailyTotal: 20_900, peakLoad: 158, morningBias: 0.9, isAnalog: false },
  { route: 28, dailyTotal: 14_300, peakLoad: 121, morningBias: 1, isAnalog: false },
  { route: 50, dailyTotal: 15_200, peakLoad: 126, morningBias: 1.05, isAnalog: false },
];

// Строки маршрута 17 в 7 и 8 часов — ровно из примера ответа GET /forecast в контракте
const CONTRACT_EXAMPLE_ITEMS: ForecastItem[] = [
  {
    route: 17,
    date: MOCK_DATE,
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
    date: MOCK_DATE,
    hour: 8,
    prediction: 1859,
    lower: 1690,
    upper: 2030,
    trams_on_line: 14,
    passengers_per_tram: 132.8,
    is_analog: false,
  },
];

// Детерминированный «шум» ±4%, чтобы кривые маршрутов не были одинаковыми
function jitter(route: number, hour: number): number {
  return 1 + 0.04 * Math.sin(route * 12.9898 + hour * 78.233);
}

function hourShare(hour: number, morningBias: number): number {
  const base = WEEKDAY_PROFILE[hour] ?? 0;
  if (hour >= 6 && hour <= 10) return base * morningBias;
  if (hour >= 16 && hour <= 20) return base / morningBias;
  return base;
}

function buildRouteItems(setup: RouteSetup): ForecastItem[] {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const shares = hours.map((hour) => hourShare(hour, setup.morningBias));
  const shareSum = shares.reduce((sum, share) => sum + share, 0);
  const predictions = hours.map((hour) =>
    Math.round(((setup.dailyTotal * (shares[hour] ?? 0)) / shareSum) * jitter(setup.route, hour)),
  );
  const peakTrams = Math.ceil(Math.max(...predictions) / setup.peakLoad);
  const corridor = setup.isAnalog ? CORRIDOR_ANALOG : CORRIDOR_HISTORY;

  return hours.map((hour) => {
    const example = CONTRACT_EXAMPLE_ITEMS.find(
      (item) => item.route === setup.route && item.hour === hour,
    );
    if (example) return example;

    const prediction = predictions[hour] ?? 0;
    const fleetShare = FLEET_SHARE[hour] ?? 0;
    const trams = fleetShare > 0 ? Math.max(1, Math.round(peakTrams * fleetShare)) : null;
    return {
      route: setup.route,
      date: MOCK_DATE,
      hour,
      prediction,
      lower: Math.max(0, Math.round(prediction * (1 - corridor))),
      upper: Math.round(prediction * (1 + corridor)),
      trams_on_line: trams,
      passengers_per_tram: trams ? Math.round((prediction / trams) * 10) / 10 : null,
      is_analog: setup.isAnalog,
    };
  });
}

const response: ForecastResponse = {
  model_version: MODEL_VERSION,
  horizon: 'day',
  items: ROUTES.flatMap(buildRouteItems),
  generated_at: GENERATED_AT,
};

const source = `// Сгенерировано scripts/generateMocks.ts — руками не править, запускать npm run mocks:generate.
import type { ForecastResponse } from '../../api/types';

export const forecastDayMock: ForecastResponse = ${JSON.stringify(response, null, 2)};
`;

writeFileSync(OUTPUT_PATH, source);
