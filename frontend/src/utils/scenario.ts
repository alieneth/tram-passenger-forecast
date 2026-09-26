import type { ForecastItem } from '../api';
import { DISPLAY_HOURS, PASSENGERS_PER_TRAM_NORM } from '../config/constants';
import { formatHour } from './format';

// Сценарий «что если» по числу выходов. Поток пассажиров считаем неизменным (бизнес-правило):
// меняется только число трамваев в выбранные часы, а значит — пассажиров на трамвай
export interface ScenarioParams {
  hours: readonly number[];
  // На сколько трамваев больше (или меньше) в выбранные часы
  tramsDelta: number;
}

export interface ScenarioPoint {
  hour: number;
  label: string;
  inScenario: boolean;
  trams: number;
  tramsAfter: number;
  baseline: number;
  // null — в этот час трамваев не останется
  scenario: number | null;
  corridor: [number, number] | null;
  // Сколько трамваев нужно, чтобы в этот час уложиться в норму
  tramsForNorm: number;
}

export interface ScenarioSummary {
  hoursOverBaseline: number;
  hoursOverScenario: number;
  maxBaseline: number;
  maxScenario: number | null;
  // Не хватает трамваев до нормы в самый тяжёлый час сценария — столько брать из резерва
  reserveNeeded: number;
  hoursWithoutTrams: number[];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function buildScenario(items: ForecastItem[], params: ScenarioParams): ScenarioPoint[] {
  // Часы — в порядке шкалы 05 … 23, 00, как на всех экранах
  const order = (item: ForecastItem) => DISPLAY_HOURS.indexOf(item.hour ?? -1);
  return items
    .filter((item) => order(item) >= 0 && (item.trams_on_line ?? 0) > 0)
    .sort((a, b) => order(a) - order(b))
    .map((item) => {
      const hour = item.hour ?? 0;
      const trams = item.trams_on_line ?? 0;
      const inScenario = params.hours.includes(hour);
      const tramsAfter = trams + (inScenario ? params.tramsDelta : 0);
      return {
        hour,
        label: formatHour(hour),
        inScenario,
        trams,
        tramsAfter,
        baseline: round1(item.prediction / trams),
        scenario: tramsAfter > 0 ? round1(item.prediction / tramsAfter) : null,
        corridor:
          tramsAfter > 0
            ? [round1(item.lower / tramsAfter), round1(item.upper / tramsAfter)]
            : null,
        tramsForNorm: Math.ceil(item.prediction / PASSENGERS_PER_TRAM_NORM),
      };
    });
}

export function summarize(points: ScenarioPoint[]): ScenarioSummary {
  const scenarioValues = points.flatMap((point) =>
    point.scenario === null ? [] : [point.scenario],
  );
  return {
    hoursOverBaseline: points.filter((point) => point.baseline > PASSENGERS_PER_TRAM_NORM).length,
    hoursOverScenario: points.filter(
      (point) => point.scenario !== null && point.scenario > PASSENGERS_PER_TRAM_NORM,
    ).length,
    maxBaseline: Math.max(0, ...points.map((point) => point.baseline)),
    maxScenario: scenarioValues.length ? Math.max(...scenarioValues) : null,
    reserveNeeded: Math.max(
      0,
      ...points.map((point) => point.tramsForNorm - Math.max(0, point.tramsAfter)),
    ),
    hoursWithoutTrams: points.filter((point) => point.scenario === null).map((point) => point.hour),
  };
}

// Выходов на линии в пик по прогнозу — от этого числа диспетчер добавляет или снимает
export function peakTrams(items: ForecastItem[], hours: readonly number[]): number {
  return Math.max(
    0,
    ...items
      .filter((item) => hours.includes(item.hour ?? -1))
      .map((item) => item.trams_on_line ?? 0),
  );
}
