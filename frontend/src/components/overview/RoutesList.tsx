import type { ForecastItem, Route } from '../../api';
import { DISPLAY_HOURS, NO_DATA_LABEL } from '../../config/constants';
import { itemsByRoute, peakLoadItem } from '../../utils/forecast';
import { formatNumber } from '../../utils/format';
import { LOAD_COLORS, loadLevel } from '../../utils/intensity';
import { hasNoData } from '../../utils/routes';
import { Icon } from '../Icon';
import { Sparkline } from '../Sparkline';

interface RoutesListProps {
  routes: Route[];
  items: ForecastItem[];
  selectedRoute: number | undefined;
  onSelect: (route: number) => void;
}

// Список маршрутов справа от карты: самые загруженные сверху, у каждого — своё значение пика
export function RoutesList({ routes, items, selectedRoute, onSelect }: RoutesListProps) {
  const byRoute = itemsByRoute(items);
  const rows = routes
    .map((route) => {
      const routeItems = byRoute.get(route.route) ?? [];
      const byHour = new Map(routeItems.map((item) => [item.hour, item.prediction]));
      return {
        route,
        noData: hasNoData(route),
        peakLoad: peakLoadItem(routeItems),
        peakPassengers: Math.max(0, ...routeItems.map((item) => item.prediction)),
        profile: DISPLAY_HOURS.map((hour) => byHour.get(hour) ?? 0),
      };
    })
    // Маршруты без данных — в конец списка, чтобы не перемешивались с загруженными
    .sort(
      (a, b) =>
        Number(a.noData) - Number(b.noData) ||
        (b.peakLoad?.passengers_per_tram ?? 0) - (a.peakLoad?.passengers_per_tram ?? 0),
    );

  return (
    <ul className="routes-list">
      {rows.map(({ route, noData, peakLoad, peakPassengers, profile }) => (
        <li key={route.route}>
          <button
            type="button"
            className={`routes-list__row${route.route === selectedRoute ? ' routes-list__row--selected' : ''}`}
            aria-pressed={route.route === selectedRoute}
            onClick={() => onSelect(route.route)}
          >
            <span
              className="routes-list__badge"
              style={{ borderColor: LOAD_COLORS[noData ? 'none' : loadLevel(peakLoad)] }}
            >
              {route.route}
            </span>
            <span className="routes-list__name">Маршрут {route.route}</span>
            {noData ? (
              <span className="routes-list__value muted">{NO_DATA_LABEL}</span>
            ) : (
              <span className="routes-list__value">
                {formatNumber(peakPassengers)} <span className="muted">пасс./ч в пик</span>
              </span>
            )}
            {/* Пустая ячейка вместо графика — чтобы строка не сдвигала колонки */}
            {noData ? (
              <span className="sparkline" aria-hidden="true" />
            ) : (
              <Sparkline values={profile} />
            )}
            <Icon name="chevronRight" size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}
