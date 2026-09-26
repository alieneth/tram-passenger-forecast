import type { FactorsResponse } from '../api';
import { weekdayName } from '../utils/dates';
import { Icon, type IconName } from './Icon';
import { WEATHER_KIND_LABELS, weatherText } from '../utils/weather';

const DAY_TYPE_LABELS: Record<FactorsResponse['day_type'], string> = {
  working: 'Рабочий день',
  weekend: 'Выходной',
  holiday: 'Праздник',
  shortened: 'Сокращённый день',
};

function FactorIcon({ name }: { name: IconName }) {
  return (
    <span className="factor__icon" aria-hidden="true">
      <Icon name={name} size={22} />
    </span>
  );
}

export function DayFactors({ factors }: { factors: FactorsResponse }) {
  const dayType = factors.holiday_name
    ? `${DAY_TYPE_LABELS[factors.day_type]}: ${factors.holiday_name}`
    : DAY_TYPE_LABELS[factors.day_type];

  return (
    <ul className="factors">
      <li className="factor">
        <FactorIcon name="calendar" />
        <span className="factor__text">{weekdayName(factors.day_of_week)}</span>
      </li>
      <li className="factor">
        <FactorIcon name="cloud" />
        <span className="factor__text">
          {factors.weather ? weatherText(factors.weather) : 'Нет данных о погоде'}
          {factors.weather?.data_kind && (
            <span className="factor__note">{WEATHER_KIND_LABELS[factors.weather.data_kind]}</span>
          )}
        </span>
      </li>
      <li className="factor">
        <FactorIcon name="briefcase" />
        <span className="factor__text">
          {dayType}
          {factors.is_school_holiday && <span className="factor__note">школьные каникулы</span>}
          {factors.special_day_name && (
            <span className="factor__note">{factors.special_day_name}</span>
          )}
        </span>
      </li>
      <li className="factor">
        <FactorIcon name="event" />
        <span className="factor__text">
          {factors.events.length === 0
            ? 'Событий нет'
            : factors.events
                .map((event) => `${event.event_name} ${event.start_at.slice(11, 16)}`)
                .join(' · ')}
        </span>
      </li>
    </ul>
  );
}
