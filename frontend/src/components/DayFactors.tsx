import type { FactorsResponse } from '../api';
import { weekdayName } from '../utils/dates';
import { formatDecimal, formatTemperature } from '../utils/format';

const DAY_TYPE_LABELS: Record<FactorsResponse['day_type'], string> = {
  working: 'Рабочий день',
  weekend: 'Выходной',
  holiday: 'Праздник',
  shortened: 'Сокращённый день',
};

// Без утечки из будущего: подписываем, прогноз это погоды или климатическая норма
const WEATHER_KIND_LABELS = {
  forecast: 'прогноз погоды',
  climate_norm: 'климатическая норма',
} as const;

function weatherText(weather: NonNullable<FactorsResponse['weather']>): string {
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

export function DayFactors({ factors }: { factors: FactorsResponse }) {
  const dayType = factors.holiday_name
    ? `${DAY_TYPE_LABELS[factors.day_type]}: ${factors.holiday_name}`
    : DAY_TYPE_LABELS[factors.day_type];

  return (
    <ul className="factors">
      <li className="factor">{weekdayName(factors.day_of_week)}</li>
      <li className="factor">
        {factors.weather ? weatherText(factors.weather) : 'Нет данных о погоде'}
        {factors.weather?.data_kind && (
          <span className="factor__note">{WEATHER_KIND_LABELS[factors.weather.data_kind]}</span>
        )}
      </li>
      <li className="factor">
        {dayType}
        {factors.is_school_holiday && <span className="factor__note">школьные каникулы</span>}
        {factors.special_day_name && (
          <span className="factor__note">{factors.special_day_name}</span>
        )}
      </li>
      <li className="factor">
        {factors.events.length === 0
          ? 'Событий нет'
          : factors.events
              .map((event) => `${event.event_name} ${event.start_at.slice(11, 16)}`)
              .join(' · ')}
      </li>
    </ul>
  );
}
