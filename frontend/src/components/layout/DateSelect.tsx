import { FORECAST_DATE_MAX, FORECAST_DATE_MIN } from '../../config/constants';
import { useFilters } from '../../hooks/useFilters';

// «День» — выбор даты, «Месяц» — выбор месяца (первое число месяца хранится как дата)
export function DateSelect() {
  const { horizon, date, setDate } = useFilters();

  if (horizon === 'month') {
    return (
      <input
        className="field"
        type="month"
        aria-label="Месяц прогноза"
        value={date.slice(0, 7)}
        min={FORECAST_DATE_MIN.slice(0, 7)}
        max={FORECAST_DATE_MAX.slice(0, 7)}
        onChange={(event) => event.target.value && setDate(`${event.target.value}-01`)}
      />
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
