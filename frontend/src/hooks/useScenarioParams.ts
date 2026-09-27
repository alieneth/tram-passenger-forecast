import { useSearchParams } from 'react-router';
import { CORRECTION_LIMITS, DISPLAY_HOURS } from '../config/constants';
import { HOUR_INTERVALS } from '../config/intervals';
import type { Corrections } from '../utils/scenario';

type CorrectionKey = keyof Corrections;
// В адресе — проценты: ?weather=10&event=25&season=-5
const CORRECTION_KEYS: CorrectionKey[] = ['weather', 'event', 'season'];

// Параметры сценария — в адресе: ссылку «В симулятор» из решения можно открыть уже заполненной.
// ?route=11&from=17&to=18&delta=1 — интервал решения; ?interval=morning — готовый интервал
export interface ScenarioState {
  route: number | undefined;
  hours: readonly number[];
  intervalId: string;
  customInterval: { from: number; to: number } | null;
  tramsDelta: number;
  // Поправки в процентах, как в адресе и на ползунках
  correctionsPct: Record<CorrectionKey, number>;
}

function clampPct(key: CorrectionKey, value: number | undefined): number {
  const { min, max } = CORRECTION_LIMITS[key];
  return Math.min(max, Math.max(min, value ?? 0));
}

const MAX_HOUR = 23;
const MIN_HOUR = 5;

function toInt(value: string | null): number | undefined {
  if (value === null) return undefined;
  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
}

export function useScenarioParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const from = toInt(searchParams.get('from'));
  const to = toInt(searchParams.get('to'));
  const custom =
    from !== undefined && to !== undefined && from >= MIN_HOUR && to <= MAX_HOUR && from <= to
      ? { from, to }
      : null;
  const preset =
    HOUR_INTERVALS.find((item) => item.id === searchParams.get('interval')) ?? HOUR_INTERVALS[0];

  const state: ScenarioState = {
    route: toInt(searchParams.get('route')),
    hours: custom
      ? DISPLAY_HOURS.filter((hour) => hour >= custom.from && hour <= custom.to)
      : (preset?.hours ?? DISPLAY_HOURS),
    intervalId: custom ? 'custom' : (preset?.id ?? 'all'),
    customInterval: custom,
    tramsDelta: toInt(searchParams.get('delta')) ?? 0,
    correctionsPct: {
      weather: clampPct('weather', toInt(searchParams.get('weather'))),
      event: clampPct('event', toInt(searchParams.get('event'))),
      season: clampPct('season', toInt(searchParams.get('season'))),
    },
  };

  const update = (patch: Record<string, string | number | null>) =>
    setSearchParams(
      (params) => {
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) params.delete(key);
          else params.set(key, String(value));
        }
        return params;
      },
      { replace: true },
    );

  return {
    state,
    setRoute: (route: number) => update({ route }),
    setInterval: (id: string) =>
      update(id === 'custom' ? { interval: null } : { interval: id, from: null, to: null }),
    setTramsDelta: (delta: number) => update({ delta: delta === 0 ? null : delta }),
    setCorrection: (key: CorrectionKey, pct: number) => update({ [key]: pct === 0 ? null : pct }),
    reset: () =>
      update({ delta: null, ...Object.fromEntries(CORRECTION_KEYS.map((key) => [key, null])) }),
  };
}
