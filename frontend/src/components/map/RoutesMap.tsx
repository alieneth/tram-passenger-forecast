import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import { MAP_CENTER, MAP_FIT_PADDING_PX, MAP_ZOOM, NO_DATA_LABEL } from '../../config/constants';
import { hasNoData } from '../../utils/routes';
import { FALLBACK_STYLE, MAP_STYLE } from '../../config/map';
import {
  buildLines,
  buildStops,
  labelPosition,
  routeColor,
  routesBounds,
  type MapRoute,
} from './mapData';
import {
  addRouteLayers,
  applyLocalNames,
  HIT_LAYER,
  LINES_SOURCE,
  STOPS_SOURCE,
} from './mapLayers';
import { RouteTooltip } from './RouteTooltip';

// MapLibre 6 ищет воркер по относительному пути, который ломается после сборки Vite, —
// поэтому воркер собирает сам Vite, а адрес передаём явно
setWorkerUrl(mapWorkerUrl);

interface RoutesMapProps {
  routes: MapRoute[];
  selectedRoute?: number;
  showLoad?: boolean;
  onRouteClick?: (route: number) => void;
}

interface Hover {
  route: number;
  x: number;
  y: number;
  // Размер карты в момент наведения — чтобы подсказка не вылезала за край
  width: number;
  height: number;
}

function createLabel(mapRoute: MapRoute, showLoad: boolean, dimmed: boolean): HTMLElement {
  const noData = hasNoData(mapRoute.route);
  const element = document.createElement('div');
  element.className = [
    'map-label',
    noData ? 'map-label--no-data' : '',
    dimmed ? 'map-label--dimmed' : '',
  ].join(' ');
  element.style.borderColor = routeColor(mapRoute, showLoad);
  element.textContent = noData
    ? `${mapRoute.route.route} · ${NO_DATA_LABEL}`
    : String(mapRoute.route.route);
  if (mapRoute.eventName) {
    const event = document.createElement('span');
    event.className = 'map-label__event';
    event.textContent = mapRoute.eventName;
    element.append(event);
  }
  return element;
}

export function RoutesMap({
  routes,
  selectedRoute,
  showLoad = true,
  onRouteClick,
}: RoutesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const fittedRef = useRef(false);
  const onRouteClickRef = useRef(onRouteClick);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    onRouteClickRef.current = onRouteClick;
  }, [onRouteClick]);

  // Карта создаётся один раз; дальше меняются только данные источников
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-left');

    let usedFallback = false;
    map.on('error', () => {
      // Подложка не загрузилась (нет интернета) — переходим на однотонный фон
      if (!usedFallback && !map.isStyleLoaded()) {
        usedFallback = true;
        map.setStyle(FALLBACK_STYLE);
      }
    });
    map.on('style.load', () => {
      applyLocalNames(map);
      addRouteLayers(map);
      setReady(true);
    });
    map.on('mousemove', HIT_LAYER, (event) => {
      const route = event.features?.[0]?.properties?.route;
      if (typeof route !== 'number') return;
      map.getCanvas().style.cursor = onRouteClickRef.current ? 'pointer' : '';
      const canvas = map.getCanvas();
      setHover({
        route,
        x: event.point.x,
        y: event.point.y,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
    });
    map.on('mouseleave', HIT_LAYER, () => {
      map.getCanvas().style.cursor = '';
      setHover(null);
    });
    map.on('click', HIT_LAYER, (event) => {
      const route = event.features?.[0]?.properties?.route;
      if (typeof route === 'number') onRouteClickRef.current?.(route);
    });

    mapRef.current = map;
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const view = { selectedRoute, showLoad };
    map.getSource<GeoJSONSource>(LINES_SOURCE)?.setData(buildLines(routes, view));
    map.getSource<GeoJSONSource>(STOPS_SOURCE)?.setData(buildStops(routes, view));

    // Подписи — HTML-маркеры: не зависят от шрифтов подложки
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = routes.flatMap((mapRoute) => {
      const position = labelPosition(mapRoute);
      if (!position) return [];
      return [
        new Marker({
          element: createLabel(
            mapRoute,
            showLoad,
            selectedRoute !== undefined && selectedRoute !== mapRoute.route.route,
          ),
          anchor: 'left',
          offset: [8, 0],
        })
          .setLngLat(position)
          .addTo(map),
      ];
    });

    const bounds = routesBounds(routes);
    if (bounds && !fittedRef.current) {
      map.fitBounds(bounds, { padding: MAP_FIT_PADDING_PX, duration: 0 });
      fittedRef.current = true;
    }
  }, [routes, selectedRoute, showLoad, ready]);

  const hovered = hover && routes.find((mapRoute) => mapRoute.route.route === hover.route);

  return (
    <div className="routes-map">
      <div ref={containerRef} className="routes-map__canvas" />
      {hover && hovered && (
        <RouteTooltip
          mapRoute={hovered}
          x={hover.x}
          y={hover.y}
          containerWidth={hover.width}
          containerHeight={hover.height}
        />
      )}
    </div>
  );
}
