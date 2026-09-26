import type { FactorsResponse } from '../api';
import { weekdayName } from '../utils/dates';
import { WEATHER_KIND_LABELS, weatherText } from '../utils/weather';

const DAY_TYPE_LABELS: Record<FactorsResponse['day_type'], string> = {
  working: 'Рабочий день',
  weekend: 'Выходной',
  holiday: 'Праздник',
  shortened: 'Сокращённый день',
};

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
