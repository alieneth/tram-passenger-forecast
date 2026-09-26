import type { FeatureCollection, LineString, Point } from 'geojson';
import type { LngLatBoundsLike } from 'maplibre-gl';
import type { ForecastItem, Route, RouteGeometry } from '../../api';
import { LOAD_COLORS, loadLevel } from '../../utils/intensity';
import { hasNoData } from '../../utils/routes';

const NEUTRAL_ROUTE_COLOR = '#60a5fa';

// Всё, что карта знает о маршруте: справочник, трасса и прогноз на показываемый час
export interface MapRoute {
  route: Route;
  geometry: RouteGeometry;
  item: ForecastItem | undefined;
  // Название события рядом с маршрутом — для слоя «События»
  eventName?: string;
}

export interface MapRoutesInput {
  routes: Route[];
  geometries: RouteGeometry[];
  itemFor: (route: number) => ForecastItem | undefined;
  eventFor?: (route: number) => string | undefined;
}

export function toMapRoutes({ routes, geometries, itemFor, eventFor }: MapRoutesInput): MapRoute[] {
  return geometries.flatMap((geometry) => {
    const route = routes.find((item) => item.route === geometry.route);
    if (!route) return [];
    return [{ route, geometry, item: itemFor(route.route), eventName: eventFor?.(route.route) }];
  });
}

export interface RouteFeatureProps {
  route: number;
  color: string;
  no_data: boolean;
  has_event: boolean;
  dimmed: boolean;
}

// Линия — основной вариант рейса в направлении 0 (остановки по порядку)
function coordinates(geometry: RouteGeometry): [number, number][] {
  const direction = geometry.directions.find((item) => item.direction_id === 0);
  return (
    (direction ?? geometry.directions[0])?.stops.map((stop) => [stop.stop_lon, stop.stop_lat]) ?? []
  );
}

export interface MapView {
  selectedRoute?: number;
  // Слой «Пассажиропоток» выключен — все линии нейтрального цвета
  showLoad: boolean;
}

// Маршрут без данных — всегда серый: у него нет загрузки, которую можно раскрасить
export function routeColor(mapRoute: MapRoute, showLoad: boolean): string {
  if (hasNoData(mapRoute.route)) return LOAD_COLORS.none;
  return showLoad ? LOAD_COLORS[loadLevel(mapRoute.item)] : NEUTRAL_ROUTE_COLOR;
}

function featureProps(mapRoute: MapRoute, { selectedRoute, showLoad }: MapView): RouteFeatureProps {
  return {
    route: mapRoute.route.route,
    color: routeColor(mapRoute, showLoad),
    no_data: hasNoData(mapRoute.route),
    has_event: Boolean(mapRoute.eventName),
    dimmed: selectedRoute !== undefined && selectedRoute !== mapRoute.route.route,
  };
}

export function buildLines(
  routes: MapRoute[],
  view: MapView,
): FeatureCollection<LineString, RouteFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: routes.map((mapRoute) => ({
      type: 'Feature',
      properties: featureProps(mapRoute, view),
      geometry: { type: 'LineString', coordinates: coordinates(mapRoute.geometry) },
    })),
  };
}

export function buildStops(
  routes: MapRoute[],
  view: MapView,
): FeatureCollection<Point, RouteFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((mapRoute) =>
      coordinates(mapRoute.geometry).map((point) => ({
        type: 'Feature' as const,
        properties: featureProps(mapRoute, view),
        geometry: { type: 'Point' as const, coordinates: point },
      })),
    ),
  };
}

export function labelPosition(mapRoute: MapRoute): [number, number] | undefined {
  return coordinates(mapRoute.geometry).at(-1);
}

export function routesBounds(routes: MapRoute[]): LngLatBoundsLike | null {
  const points = routes.flatMap((mapRoute) => coordinates(mapRoute.geometry));
  if (points.length === 0) return null;
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}
