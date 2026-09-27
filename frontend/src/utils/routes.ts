import type { Route } from '../api';
import { NO_DATA_ROUTES } from '../config/constants';

// «Нет данных» — маршрут исключён организаторами или в справочнике помечен как новый без истории:
// прогноз по нему не показываем, чтобы ноль не читался как «пустой маршрут»
export function hasNoData(route: Pick<Route, 'route' | 'is_new'>): boolean {
  return route.is_new || NO_DATA_ROUTES.includes(route.route);
}

export function isNoDataRoute(route: number): boolean {
  return NO_DATA_ROUTES.includes(route);
}
