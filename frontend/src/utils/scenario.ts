import type { ForecastItem } from '../api';
import { DISPLAY_HOURS, PASSENGERS_PER_TRAM_NORM } from '../config/constants';
import { formatHour } from './format';

// Сценарий «что если». Два рычага:
// — число выходов в выбранные часы (поток при этом неизменен — бизнес-правило);
// — корректирующие коэффициенты на погоду, событие и сезон (критерий 2в): поток × коэффициент.
// Коэффициенты — поправка диспетчера поверх прогноза модели, а не пересчёт моделью
export interface Corrections {
  // Доли: 0.1 — +10% к потоку
  weather: number;
  event: number;
  season: number;
}

export const NO_CORRECTIONS: Corrections = { weather: 0, event: 0, season: 0 };

export function flowFactor({ weather, event, season }: Corrections): number {
  return (1 + weather) * (1 + event) * (1 + season);
}

export interface ScenarioParams {
  hours: readonly number[];
  // На сколько трамваев больше (или меньше) в выбранные часы
  tramsDelta: number;
  corrections: Corrections;
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
  // Сколько трамваев нужно, чтобы в этот час уложиться в норму (по потоку сценария)
  tramsForNorm: number;
  prediction: number;
  scenarioPassengers: number;
}

export interface ScenarioSummary {
  hoursOverBaseline: number;
  hoursOverScenario: number;
  maxBaseline: number;
  maxScenario: number | null;
  // Не хватает трамваев до нормы в самый тяжёлый час сценария — столько брать из резерва
  reserveNeeded: number;
  hoursWithoutTrams: number[];
  passengersBaseline: number;
  passengersScenario: number;
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
      const factor = flowFactor(params.corrections);
      const scenarioPassengers = item.prediction * factor;
      return {
        hour,
        label: formatHour(hour),
        inScenario,
        trams,
        tramsAfter,
        baseline: round1(item.prediction / trams),
        scenario: tramsAfter > 0 ? round1(scenarioPassengers / tramsAfter) : null,
        corridor:
          tramsAfter > 0
            ? [
                round1((item.lower * factor) / tramsAfter),
                round1((item.upper * factor) / tramsAfter),
              ]
            : null,
        tramsForNorm: Math.ceil(scenarioPassengers / PASSENGERS_PER_TRAM_NORM),
        prediction: item.prediction,
        scenarioPassengers,
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
    passengersBaseline: points.reduce((sum, point) => sum + point.prediction, 0),
    passengersScenario: Math.round(
      points.reduce((sum, point) => sum + point.scenarioPassengers, 0),
    ),
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
