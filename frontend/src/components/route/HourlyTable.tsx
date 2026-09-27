import type { ForecastItem } from '../../api';
import { PASSENGERS_PER_TRAM_NORM } from '../../config/constants';
import { isOverNorm } from '../../utils/forecast';
import { formatDecimal, formatHourTime, formatNumber } from '../../utils/format';

// Табличный вид графика: те же значения — для точного чтения и доступности
export function HourlyTable({ items, hours }: { items: ForecastItem[]; hours: readonly number[] }) {
  const byHour = new Map(items.map((item) => [item.hour, item]));
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Час</th>
          <th>Пассажиров в час</th>
          <th>Коридор</th>
          <th>Трамваев</th>
          <th>На трамвай (норма {PASSENGERS_PER_TRAM_NORM})</th>
        </tr>
      </thead>
      <tbody>
        {hours.map((hour) => {
          const item = byHour.get(hour);
          if (!item) {
            return (
              <tr key={hour}>
                <td>{formatHourTime(hour)}</td>
                <td colSpan={4} className="muted">
                  Нет прогноза на этот час
                </td>
              </tr>
            );
          }
          return (
            <tr key={hour} className={isOverNorm(item) ? 'data-table__row--alert' : undefined}>
              <td>{formatHourTime(hour)}</td>
              <td>{formatNumber(item.prediction)}</td>
              <td>
                {formatNumber(item.lower)}–{formatNumber(item.upper)}
              </td>
              <td>{item.trams_on_line ?? '—'}</td>
              <td>
                {item.passengers_per_tram === null || item.passengers_per_tram === undefined
                  ? '—'
                  : formatDecimal(item.passengers_per_tram)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
