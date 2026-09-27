import type { ForecastItem, Route } from '../api';
import { DISPLAY_HOURS, NO_DATA_LABEL } from '../config/constants';
import { itemsByRouteAndHour } from '../utils/forecast';
import { formatHour, formatHourTime, formatNumber } from '../utils/format';
import { intensityColor } from '../utils/intensity';
import { hasNoData } from '../utils/routes';

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
          {routes.map((route) => {
            const noData = hasNoData(route);
            return (
              <tr
                key={route.route}
                className={[
                  noData ? 'heat-table__row--no-data' : '',
                  route.route === selectedRoute ? 'heat-table__row--selected' : '',
                ].join(' ')}
                aria-selected={route.route === selectedRoute}
                onClick={() => onSelectRoute(route.route)}
              >
                <th scope="row">{route.route}</th>
                {noData ? (
                  <td className="heat-table__no-data" colSpan={DISPLAY_HOURS.length}>
                    {NO_DATA_LABEL}
                  </td>
                ) : (
                  DISPLAY_HOURS.map((hour) => {
                    const item = grid.get(route.route)?.get(hour);
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
                            ? `Маршрут ${route.route}, ${formatHourTime(hour)}: ${formatNumber(item.prediction)} пасс./ч (${formatNumber(item.lower)}–${formatNumber(item.upper)})`
                            : `Маршрут ${route.route}, ${formatHourTime(hour)}: нет прогноза`
                        }
                      />
                    );
                  })
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="heat-legend">
        <span>Пассажиров в час (прогноз)</span>
        <span>0</span>
        <span className="heat-legend__bar" aria-hidden="true" />
        <span>{formatNumber(max)}</span>
      </div>
    </div>
  );
}
