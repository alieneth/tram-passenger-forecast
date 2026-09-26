import type { FactorsResponse, ForecastItem } from '../../api';
import { DISPLAY_HOURS } from '../../config/constants';
import { dayOfMonth, formatDate, weekdayShort } from '../../utils/dates';
import { dayMark, dayMarkTitle, isDayOff } from '../../utils/dayType';
import { formatHour, formatHourTime, formatNumber } from '../../utils/format';
import { intensityColor } from '../../utils/intensity';

interface DaysHoursTableProps {
  items: ForecastItem[];
  calendar: Map<string, FactorsResponse>;
  selectedDate: string;
  hours: readonly number[];
  onSelectDate: (date: string) => void;
}

// Тепловая таблица «дни месяца × часы»: цвет — пассажиров в час относительно максимума месяца
export function DaysHoursTable({
  items,
  calendar,
  selectedDate,
  hours,
  onSelectDate,
}: DaysHoursTableProps) {
  const byDate = new Map<string, Map<number, ForecastItem>>();
  for (const item of items) {
    if (item.hour === null || item.hour === undefined) continue;
    const row = byDate.get(item.date) ?? new Map<number, ForecastItem>();
    row.set(item.hour, item);
    byDate.set(item.date, row);
  }
  const dates = [...byDate.keys()].sort();
  const visibleHours = DISPLAY_HOURS.filter((hour) => hours.includes(hour));
  const max = Math.max(1, ...items.map((item) => item.prediction));

  return (
    <div className="heat-table-wrap">
      <table
        className={`heat-table heat-table--days${items.some((item) => item.is_analog) ? ' heat-table--analog' : ''}`}
      >
        <thead>
          <tr>
            <th scope="col">Дата</th>
            {visibleHours.map((hour) => (
              <th key={hour} scope="col">
                {formatHour(hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const factors = calendar.get(date);
            const mark = dayMark(factors);
            const rowClass = [
              date === selectedDate ? 'heat-table__row--selected' : '',
              isDayOff(factors) ? 'heat-table__row--day-off' : '',
            ].join(' ');
            return (
              <tr
                key={date}
                className={rowClass}
                aria-selected={date === selectedDate}
                onClick={() => onSelectDate(date)}
              >
                <th scope="row" title={dayMarkTitle(factors)}>
                  <span className="day-label">
                    {dayOfMonth(date)}{' '}
                    <span className="day-label__weekday">{weekdayShort(date)}</span>
                    {mark && <span className="day-label__mark">{mark}</span>}
                  </span>
                </th>
                {visibleHours.map((hour) => {
                  const item = byDate.get(date)?.get(hour);
                  return (
                    <td
                      key={hour}
                      style={
                        item
                          ? { backgroundColor: intensityColor(item.prediction / max) }
                          : undefined
                      }
                      title={
                        item
                          ? `${formatDate(date)}, ${formatHourTime(hour)}: ${formatNumber(item.prediction)} пасс./ч`
                          : `${formatDate(date)}, ${formatHourTime(hour)}: нет прогноза`
                      }
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="heat-legend">
        <span>Пассажиров в час</span>
        <span>0</span>
        <span className="heat-legend__bar" aria-hidden="true" />
        <span>{formatNumber(max)}</span>
      </div>
    </div>
  );
}
