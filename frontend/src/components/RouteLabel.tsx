import type { Route } from '../api';
import { NEW_ROUTE_LABEL } from '../config/constants';

// У нового маршрута (5) метка «новый · прогноз по аналогам» — всегда и везде
export function RouteLabel({ route, showName = false }: { route: Route; showName?: boolean }) {
  return (
    <span className="route-label">
      <span className="route-label__number">Маршрут {route.route}</span>
      {route.is_new && <span className="badge badge--new">{NEW_ROUTE_LABEL}</span>}
      {showName && route.route_long_name && (
        <span className="route-label__name">{route.route_long_name}</span>
      )}
    </span>
  );
}
