import type { Route } from '../api';
import { NO_DATA_LABEL } from '../config/constants';
import { hasNoData } from '../utils/routes';

// У маршрута без данных (5) метка «нет данных» — всегда и везде
export function RouteLabel({ route, showName = false }: { route: Route; showName?: boolean }) {
  return (
    <span className="route-label">
      <span className="route-label__number">Маршрут {route.route}</span>
      {hasNoData(route) && <NoDataBadge />}
      {showName && route.route_long_name && (
        <span className="route-label__name">{route.route_long_name}</span>
      )}
    </span>
  );
}

export function NoDataBadge() {
  return <span className="badge badge--no-data">{NO_DATA_LABEL}</span>;
}
