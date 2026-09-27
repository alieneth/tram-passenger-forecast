import { FORECAST_DATE_MAX, FORECAST_DATE_MIN } from '../../config/constants';
import { useFilters } from '../../hooks/useFilters';
import { addDays, clampDate, datesInRange, formatDate, monthTitle } from '../../utils/dates';
import { periodFor } from '../../utils/horizon';
import { Icon } from '../Icon';

const DAYS_IN_WEEK = 7;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// «День» — выбор даты, «Месяц» — выбор месяца (первое число месяца хранится как дата)
export function DateSelect() {
  const { horizon, date, setDate } = useFilters();

  // Месяцев в периоде прогноза всего два — список нагляднее и не зависит от языка браузера
  if (horizon === 'month') {
    const months = [
      ...new Set(datesInRange(FORECAST_DATE_MIN, FORECAST_DATE_MAX).map((day) => day.slice(0, 7))),
    ];
    return (
      <select
        className="field"
        aria-label="Месяц прогноза"
        value={date.slice(0, 7)}
        onChange={(event) => setDate(`${event.target.value}-01`)}
      >
        {months.map((month) => (
          <option key={month} value={month}>
            {capitalize(monthTitle(`${month}-01`))}
          </option>
        ))}
      </select>
    );
  }

  // Стрелки ‹ › — диспетчер листает соседние дни (на «Неделе» — недели), не открывая календарь
  const step = horizon === 'week' ? DAYS_IN_WEEK : 1;
  const week = horizon === 'week' ? periodFor('week', date) : null;
  return (
    <div className="date-stepper">
      <button
        type="button"
        className="button date-stepper__button"
        aria-label={horizon === 'week' ? 'Предыдущая неделя' : 'Предыдущий день'}
        disabled={date <= FORECAST_DATE_MIN}
        onClick={() => setDate(clampDate(addDays(date, -step), FORECAST_DATE_MIN, FORECAST_DATE_MAX))}
      >
        <Icon name="chevronLeft" size={16} />
      </button>
      <input
        className="field"
        type="date"
        aria-label="Дата прогноза"
        value={date}
        min={FORECAST_DATE_MIN}
        max={FORECAST_DATE_MAX}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) return;
          setDate(clampDate(value, FORECAST_DATE_MIN, FORECAST_DATE_MAX));
        }}
      />
      <button
        type="button"
        className="button date-stepper__button"
        aria-label={horizon === 'week' ? 'Следующая неделя' : 'Следующий день'}
        disabled={date >= FORECAST_DATE_MAX}
        onClick={() => setDate(clampDate(addDays(date, step), FORECAST_DATE_MIN, FORECAST_DATE_MAX))}
      >
        <Icon name="chevronRight" size={16} />
      </button>
      {week && (
        <span className="date-stepper__range">
          {formatDate(week.date_from).slice(0, 5)}–{formatDate(week.date_to).slice(0, 5)}
        </span>
      )}
    </div>
  );
}
