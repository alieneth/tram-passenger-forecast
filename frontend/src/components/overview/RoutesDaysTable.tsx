import type { FactorsResponse, ForecastItem, Route } from '../../api';
import { NO_DATA_LABEL } from '../../config/constants';
import { dayOfMonth, formatDate, weekdayShort } from '../../utils/dates';
import { isDayOff } from '../../utils/dayType';
import { formatNumber, formatThousands } from '../../utils/format';
import { intensityColor } from '../../utils/intensity';
import { hasNoData } from '../../utils/routes';

interface RoutesDaysTableProps {
  routes: Route[];
  // Прогноз по дням за неделю или месяц (horizon=month)
  items: ForecastItem[];
  calendar: Map<string, FactorsResponse>;
  selectedRoute: number | null;
  onSelectRoute: (route: number) => void;
}

// «Маршруты × дни» — то же, что «маршруты × часы», для недели и месяца: где и в какие дни нагрузка
export function RoutesDaysTable({
  routes,
  items,
  calendar,
  selectedRoute,
  onSelectRoute,
}: RoutesDaysTableProps) {
  const dates = [...new Set(items.map((item) => item.date))].sort();
  const byKey = new Map(items.map((item) => [`${item.route}|${item.date}`, item]));
  const max = Math.max(1, ...items.map((item) => item.prediction));

  return (
    <div className="heat-table-wrap">
      <table className="heat-table heat-table--route-days">
        <thead>
          <tr>
            <th scope="col">Маршрут</th>
            {dates.map((date) => (
              <th
                key={date}
                scope="col"
                className={isDayOff(calendar.get(date)) ? 'heat-table__day-off' : undefined}
              >
                <span className="heat-table__weekday">{weekdayShort(date)}</span>
                {dayOfMonth(date)}
              </th>
            ))}
            <th scope="col">Итого</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => {
            const noData = hasNoData(route);
            const total = dates.reduce(
              (sum, date) => sum + (byKey.get(`${route.route}|${date}`)?.prediction ?? 0),
              0,
            );
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
                {noData && (
                  <td className="heat-table__no-data" colSpan={dates.length + 1}>
                    {NO_DATA_LABEL}
                  </td>
                )}
                {!noData &&
                  dates.map((date) => {
                    const item = byKey.get(`${route.route}|${date}`);
                    return (
                      <td
                        key={date}
                        style={
                          item
                            ? { backgroundColor: intensityColor(item.prediction / max) }
                            : undefined
                        }
                        title={
                          item
                            ? `Маршрут ${route.route}, ${formatDate(date)}: ${formatNumber(item.prediction)} пасс.`
                            : `Маршрут ${route.route}, ${formatDate(date)}: нет прогноза`
                        }
                      />
                    );
                  })}
                {!noData && <td className="heat-table__total">{formatThousands(total)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="heat-legend">
        <span>Пассажиров за день (прогноз)</span>
        <span>0</span>
        <span className="heat-legend__bar" aria-hidden="true" />
        <span>{formatNumber(max)}</span>
      </div>
    </div>
  );
}
