import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getRouteGeometry, type Route, type RouteGeometry } from '../api';

// combine вне компонента — тогда результат стабилен между рендерами и карта не перерисовывается зря
function combine(results: UseQueryResult<RouteGeometry>[]) {
  return {
    geometries: results
      .map((result) => result.data)
      .filter((geometry): geometry is RouteGeometry => geometry !== undefined),
    isPending: results.some((result) => result.isPending),
    failed: results.map((result) => result.isError),
  };
}

// Трассы запрашиваем только у маршрутов с has_geometry: у остальных API вернёт 404 GEOMETRY_NOT_FOUND
export function useRouteGeometries(routes: Route[]) {
  const drawable = useMemo(() => routes.filter((route) => route.has_geometry), [routes]);
  const { geometries, isPending, failed } = useQueries({
    queries: drawable.map((route) => ({
      queryKey: ['geometry', route.route],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getRouteGeometry(route.route, { direction_id: 0 }, signal),
      staleTime: Infinity,
    })),
    combine,
  });
  // Маршрут, трассу которого получить не удалось, уходит в список «без координат» — карта не ломается
  const withoutGeometry = useMemo(
    () => routes.filter((route) => !route.has_geometry || failed[drawable.indexOf(route)] === true),
    [routes, drawable, failed],
  );
  return { geometries, isPending, withoutGeometry };
}
