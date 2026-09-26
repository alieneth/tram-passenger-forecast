import type { FactorsResponse } from '../../api';
import { formatDayMonth } from '../../utils/dates';
import { dayMark, isDayOff } from '../../utils/dayType';
import { formatDecimal, formatTemperature } from '../../utils/format';
import { monthWeather } from '../../utils/monthStats';
import { WEATHER_KIND_LABELS } from '../../utils/weather';

// «Факторы месяца» — из тех же ответов GET /factors по датам, что подписывают календарь
export function MonthFactors({ days }: { days: FactorsResponse[] }) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const dayOffCount = sorted.filter((day) => isDayOff(day)).length;
  const special = sorted.filter((day) => day.holiday_name || day.special_day_name);
  const schoolHolidays = sorted.filter((day) => day.is_school_holiday);
  const weather = monthWeather(sorted);

  return (
    <ul className="month-factors">
      <li className="month-factors__item">
        <span className="month-factors__title">Будни и выходные</span>
        <span>
          Рабочих дней — {sorted.length - dayOffCount}, выходных и праздничных — {dayOffCount}
        </span>
        <span className="day-strip" aria-hidden="true">
          {sorted.map((day) => (
            <span
              key={day.date}
              className={`day-strip__day${isDayOff(day) ? ' day-strip__day--off' : ''}`}
              title={`${formatDayMonth(day.date)}${dayMark(day) ? ` · ${dayMark(day)}` : ''}`}
            />
          ))}
        </span>
      </li>

      <li className="month-factors__item">
        <span className="month-factors__title">Праздники и переносы</span>
        {special.length === 0 ? (
          <span className="muted">Нет</span>
        ) : (
          special.map((day) => (
            <span key={day.date}>
              {formatDayMonth(day.date)} — {day.holiday_name ?? day.special_day_name}
            </span>
          ))
        )}
      </li>

      <li className="month-factors__item">
        <span className="month-factors__title">Школьные каникулы</span>
        {schoolHolidays.length === 0 ? (
          <span className="muted">Нет</span>
        ) : (
          <span>
            {formatDayMonth(schoolHolidays[0]?.date ?? '')} –{' '}
            {formatDayMonth(schoolHolidays.at(-1)?.date ?? '')} ({schoolHolidays.length} дн.)
          </span>
        )}
      </li>

      <li className="month-factors__item">
        <span className="month-factors__title">Погода</span>
        {weather ? (
          <>
            <span>
              от {formatTemperature(weather.temperatureMin)} до{' '}
              {formatTemperature(weather.temperatureMax)}, осадки за месяц{' '}
              {formatDecimal(weather.precipitationMm)} мм
              {weather.snowDays > 0 && `, дней со снегом — ${weather.snowDays}`}
            </span>
            {/* Для месяца модель берёт климатическую норму — подписываем, откуда цифры */}
            <span className="factor__note">
              {[...weather.kinds].map((kind) => WEATHER_KIND_LABELS[kind]).join(' + ')}
            </span>
          </>
        ) : (
          <span className="muted">Нет данных о погоде</span>
        )}
      </li>
    </ul>
  );
}
