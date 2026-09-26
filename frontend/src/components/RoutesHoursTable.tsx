import type { ForecastItem, Route } from '../api';
import { DISPLAY_HOURS, NEW_ROUTE_LABEL } from '../config/constants';
import { itemsByRouteAndHour } from '../utils/forecast';
import { formatHour, formatHourTime, formatNumber } from '../utils/format';
import { intensityColor } from '../utils/intensity';

// Тепловая таблица «маршруты × часы»: цвет — пассажиров в час относительно максимума таблицы
export function RoutesHoursTable({
  routes,
  items,
  selectedRoute,
  onSelectRoute,
}: {
  routes: Route[];
  items: ForecastItem[];
  selectedRoute?: number;
  onSelectRoute: (route: number) => void;
}) {
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
              className={[
                route.is_new ? 'heat-table__row--new' : '',
                route.route === selectedRoute ? 'heat-table__row--selected' : '',
              ].join(' ')}
              aria-selected={route.route === selectedRoute}
              onClick={() => onSelectRoute(route.route)}
            >
              <th
                scope="row"
                title={route.is_new ? `Маршрут ${route.route}: ${NEW_ROUTE_LABEL}` : undefined}
              >
                {route.route}
                {route.is_new && <span className="heat-table__new">новый</span>}
              </th>
              {DISPLAY_HOURS.map((hour) => {
                const item = grid.get(route.route)?.get(hour);
                return (
                  <td
                    key={hour}
                    style={
                      item ? { backgroundColor: intensityColor(item.prediction / max) } : undefined
                    }
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
        <span>0</span>
        <span className="heat-legend__bar" aria-hidden="true" />
        <span>{formatNumber(max)}</span>
        <span className="heat-legend__new" aria-hidden="true" />
        <span>прогноз по аналогам</span>
      </div>
    </div>
  );
}
