import type { FactorsResponse, ForecastItem } from '../api';
import { isDayOff } from './dayType';

export interface MonthTotals {
  total: number;
  workdayAverage: number | null;
  dayOffAverage: number | null;
}

function average(values: number[]): number | null {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

export function monthTotals(
  items: ForecastItem[],
  calendar: Map<string, FactorsResponse>,
): MonthTotals {
  const dayOff = items.filter((item) => isDayOff(calendar.get(item.date)));
  const workdays = items.filter((item) => !isDayOff(calendar.get(item.date)));
  return {
    total: items.reduce((sum, item) => sum + item.prediction, 0),
    workdayAverage: average(workdays.map((item) => item.prediction)),
    dayOffAverage: average(dayOff.map((item) => item.prediction)),
  };
}

type WeatherKind = NonNullable<NonNullable<FactorsResponse['weather']>['data_kind']>;

export interface MonthWeather {
  kinds: Set<WeatherKind>;
  temperatureMin: number;
  temperatureMax: number;
  precipitationMm: number;
  snowDays: number;
}

export function monthWeather(days: FactorsResponse[]): MonthWeather | null {
  const weather = days.flatMap((day) => (day.weather ? [day.weather] : []));
  if (weather.length === 0) return null;
  return {
    kinds: new Set(
      weather.flatMap((item): WeatherKind[] => (item.data_kind ? [item.data_kind] : [])),
    ),
    temperatureMin: Math.min(...weather.map((item) => item.temperature_min ?? Infinity)),
    temperatureMax: Math.max(...weather.map((item) => item.temperature_max ?? -Infinity)),
    precipitationMm: weather.reduce((sum, item) => sum + (item.precipitation_mm ?? 0), 0),
    // Норма — среднее значение на каждый день, «дней со снегом» из неё не посчитать
    snowDays: weather.filter((item) => item.data_kind === 'forecast' && (item.snowfall_cm ?? 0) > 0)
      .length,
  };
}
