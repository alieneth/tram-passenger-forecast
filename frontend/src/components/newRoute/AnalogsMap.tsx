import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { ForecastItem, Route } from '../../api';
import { useRouteGeometries } from '../../hooks/useRouteGeometries';
import { itemsByRoute, peakLoadItem } from '../../utils/forecast';
import { LazyRoutesMap } from '../map/LazyRoutesMap';
import { MapLegend } from '../map/MapLegend';
import { toMapRoutes } from '../map/mapData';

// Новый маршрут на карте рядом с аналогами: он выделен (пунктир), аналоги приглушены.
// Цвет — как везде, по загрузке в пиковый час; своих «цветов маршрутов» нет (общее правило 4)
export function AnalogsMap({
  route,
  analogs,
  items,
}: {
  route: Route;
  analogs: Route[];
  items: ForecastItem[];
}) {
  const navigate = useNavigate();
  const routes = useMemo(() => [route, ...analogs], [route, analogs]);
  const { geometries } = useRouteGeometries(routes);
  const peaks = useMemo(() => {
    const byRoute = itemsByRoute(items);
    return new Map([...byRoute].map(([number, routeItems]) => [number, peakLoadItem(routeItems)]));
  }, [items]);
  const mapRoutes = useMemo(
    () => toMapRoutes({ routes, geometries, itemFor: (number) => peaks.get(number) }),
    [routes, geometries, peaks],
  );
  return (
    <div className="overview-map__canvas analogs-map">
      <LazyRoutesMap
        routes={mapRoutes}
        selectedRoute={route.route}
        onRouteClick={(number) => navigate(`/route/${number}`)}
      />
      <div className="map-overlay map-overlay--bottom-left">
        <MapLegend compact />
      </div>
    </div>
  );
}
