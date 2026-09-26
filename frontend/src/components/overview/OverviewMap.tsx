import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { ForecastResponse, Route } from '../../api';
import { useRouteGeometries } from '../../hooks/useRouteGeometries';
import { itemsByRoute, peakLoadItem } from '../../utils/forecast';
import { LazyRoutesMap } from '../map/LazyRoutesMap';
import { MapLegend } from '../map/MapLegend';
import { toMapRoutes } from '../map/mapData';
import { mapNotice } from '../map/mapNotice';
import { NoGeometryList } from '../map/NoGeometryList';

// Каждый маршрут — цветом своего самого загруженного часа, поэтому красных линий
// ровно столько, сколько в карточке «Маршрутов с пиковой нагрузкой»
export function OverviewMap({
  routes,
  forecastQuery,
}: {
  routes: Route[];
  forecastQuery: UseQueryResult<ForecastResponse>;
}) {
  const navigate = useNavigate();
  const items = forecastQuery.data?.items;
  const { geometries, isPending: geometriesPending, withoutGeometry } = useRouteGeometries(routes);
  const notice = mapNotice(forecastQuery, {
    count: geometries.length,
    isPending: geometriesPending,
  });
  const peaks = useMemo(() => {
    const byRoute = itemsByRoute(items ?? []);
    return new Map([...byRoute].map(([route, routeItems]) => [route, peakLoadItem(routeItems)]));
  }, [items]);
  const mapRoutes = useMemo(
    () => toMapRoutes({ routes, geometries, itemFor: (route) => peaks.get(route) }),
    [routes, geometries, peaks],
  );

  return (
    <div className="overview-map">
      <div className="overview-map__canvas">
        <LazyRoutesMap routes={mapRoutes} onRouteClick={(route) => navigate(`/route/${route}`)} />
        <div className="map-overlay map-overlay--bottom-left">
          <MapLegend compact />
        </div>
        {notice && (
          <div className="map-overlay map-overlay--center" role="status">
            {notice}
          </div>
        )}
      </div>
      <NoGeometryList routes={withoutGeometry} itemFor={(route) => peaks.get(route)} />
    </div>
  );
}
