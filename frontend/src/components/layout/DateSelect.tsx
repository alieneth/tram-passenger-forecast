import { FORECAST_DATE_MAX, FORECAST_DATE_MIN } from '../../config/constants';
import { useFilters } from '../../hooks/useFilters';
import { datesInRange, monthTitle } from '../../utils/dates';

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

  return (
    <input
      className="field"
      type="date"
      aria-label="Дата прогноза"
      value={date}
      min={FORECAST_DATE_MIN}
      max={FORECAST_DATE_MAX}
      onChange={(event) => event.target.value && setDate(event.target.value)}
    />
  );
}
