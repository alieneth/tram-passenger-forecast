import type { FactorsResponse } from '../api';
import { formatDecimal, formatTemperature } from './format';

export type Weather = NonNullable<FactorsResponse['weather']>;

// Без утечки из будущего: подписываем, прогноз это погоды или климатическая норма
export const WEATHER_KIND_LABELS = {
  forecast: 'прогноз погоды',
  climate_norm: 'климатическая норма',
} as const;

export function weatherText(weather: Weather): string {
  const parts: string[] = [];
  if (weather.temperature_min !== undefined && weather.temperature_max !== undefined) {
    parts.push(
      `${formatTemperature(weather.temperature_min)} … ${formatTemperature(weather.temperature_max)}`,
    );
  }
  if (weather.snowfall_cm) parts.push(`снег ${formatDecimal(weather.snowfall_cm)} см`);
  else if (weather.precipitation_mm)
    parts.push(`осадки ${formatDecimal(weather.precipitation_mm)} мм`);
  else parts.push('без осадков');
  return parts.join(', ');
}

// Событие у маршрута: «Матч ЦСКА 19:30»
export function eventLabel(
  factors: FactorsResponse | undefined,
  route: number,
): string | undefined {
  const event = factors?.events.find((item) => item.routes.includes(route));
  return event && `${event.event_name} ${event.start_at.slice(11, 16)}`;
}
