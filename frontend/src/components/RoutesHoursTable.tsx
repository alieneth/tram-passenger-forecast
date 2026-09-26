import { useNavigate } from 'react-router';
import type { ForecastItem, Route } from '../api';
import { DISPLAY_HOURS } from '../config/constants';
import { itemsByRouteAndHour } from '../utils/forecast';
import { formatHour, formatHourTime, formatNumber } from '../utils/format';
import { intensityColor } from '../utils/intensity';

// Тепловая таблица «маршруты × часы»: цвет — пассажиров в час относительно максимума таблицы
export function RoutesHoursTable({ routes, items }: { routes: Route[]; items: ForecastItem[] }) {
  const navigate = useNavigate();
  const grid = itemsByRouteAndHour(items);
  const max = Math.max(1, ...items.map((item) => item.prediction));

  return (
    <div className="heat-table-wrap">
      <table className="heat-table">
        <thead>
          <tr>
            <th scope="col">Маршрут</th>
            {DISPLAY_HOURS.map((hour) => (
              <th key={hour} scope="col">
                {formatHour(hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr
              key={route.route}
              className={route.is_new ? 'heat-table__row--new' : undefined}
              onClick={() => navigate(`/route/${route.route}`)}
            >
              <th scope="row">{route.route}</th>
              {DISPLAY_HOURS.map((hour) => {
                const item = grid.get(route.route)?.get(hour);
                return (
                  <td
                    key={hour}
                    style={item ? { background: intensityColor(item.prediction / max) } : undefined}
                    title={
                      item
                        ? `Маршрут ${route.route}, ${formatHourTime(hour)}: ${formatNumber(item.prediction)} пасс./ч (${formatNumber(item.lower)}–${formatNumber(item.upper)})`
                        : `Маршрут ${route.route}, ${formatHourTime(hour)}: нет прогноза`
                    }
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="heat-legend">
        <span>Пассажиров в час (прогноз)</span>
        <span>ниже</span>
        <span className="heat-legend__bar" aria-hidden="true" />
        <span>выше</span>
      </div>
    </div>
  );
}
