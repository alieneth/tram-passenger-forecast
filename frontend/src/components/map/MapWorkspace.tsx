import { useMemo, useState } from 'react';
import { errorMessage, type Route } from '../../api';
import { DISPLAY_HOURS } from '../../config/constants';
import { useDayForecast } from '../../hooks/useDayForecast';
import { useFactors } from '../../hooks/useFactors';
import { useFilters } from '../../hooks/useFilters';
import { usePlayback } from '../../hooks/usePlayback';
import { useRouteGeometries } from '../../hooks/useRouteGeometries';
import { formatDate } from '../../utils/dates';
import { itemsByRoute, itemsByRouteAndHour, peakLoadItem } from '../../utils/forecast';
import { WEATHER_KIND_LABELS, eventLabel, weatherText } from '../../utils/weather';
import { LayersPanel, type MapLayers } from './LayersPanel';
import { LazyRoutesMap } from './LazyRoutesMap';
import { MapLegend } from './MapLegend';
import { toMapRoutes } from './mapData';
import { mapNotice } from './mapNotice';
import { NoGeometryList } from './NoGeometryList';
import { TimeSlider } from './TimeSlider';

// «Пик дня» — маршрут цветом своего самого загруженного часа (сходится с карточкой «Маршрутов в пике»),
// «По часам» — шкала 05…00 и «Проиграть день»
export type MapMode = 'peak' | 'hour';

interface MapWorkspaceProps {
  routes: Route[];
  selectedRoute: number | null;
  onSelectRoute: (route: number) => void;
  initialMode: MapMode;
  initialHour: number;
  // Карта в левой половине сплита: слои свёрнуты, список «без координат» короче
  compact?: boolean;
}

// Карта маршрутов с динамикой по часам — одна и та же на Обзоре (сплит) и на экране «Карта»
export function MapWorkspace({
  routes,
  selectedRoute,
  onSelectRoute,
  initialMode,
  initialHour,
  compact = false,
}: MapWorkspaceProps) {
  const { date } = useFilters();
  const forecastQuery = useDayForecast(date);
  const factorsQuery = useFactors(date);
  const { geometries, isPending: geometriesPending, withoutGeometry } = useRouteGeometries(routes);
  const [mode, setMode] = useState<MapMode>(initialMode);
  const playback = usePlayback(DISPLAY_HOURS, initialHour);
  const [layers, setLayers] = useState<MapLayers>({ load: true, weather: false, events: false });
  const notice = mapNotice(forecastQuery, {
    count: geometries.length,
    isPending: geometriesPending,
  });

  const items = forecastQuery.data?.items;
  const grid = useMemo(() => itemsByRouteAndHour(items ?? []), [items]);
  const peaks = useMemo(() => {
    const byRoute = itemsByRoute(items ?? []);
    return new Map([...byRoute].map(([route, routeItems]) => [route, peakLoadItem(routeItems)]));
  }, [items]);
  const itemFor = (route: number) =>
    mode === 'peak' ? peaks.get(route) : grid.get(route)?.get(playback.hour);
  const factors = layers.events ? factorsQuery.data : undefined;

  const mapRoutes = useMemo(
    () =>
      toMapRoutes({
        routes,
        geometries,
        itemFor: (route) =>
          mode === 'peak' ? peaks.get(route) : grid.get(route)?.get(playback.hour),
        eventFor: (route) => eventLabel(factors, route),
      }),
    [routes, geometries, grid, peaks, mode, playback.hour, factors],
  );
  const weather = layers.weather ? factorsQuery.data?.weather : undefined;

  // Движение по шкале — это уже режим «По часам»
  const toHours = () => setMode('hour');

  return (
    <div className={`map-workspace${compact ? ' map-workspace--compact' : ''}`}>
      <div className="map-screen">
        <LazyRoutesMap
          routes={mapRoutes}
          showLoad={layers.load}
          selectedRoute={selectedRoute ?? undefined}
          onRouteClick={onSelectRoute}
        />
        <div className="map-overlay map-overlay--top-left-offset">
          <div
            className="segmented segmented--small"
            role="group"
            aria-label="Что показывает карта"
          >
            <button
              type="button"
              className={`segmented__item${mode === 'peak' ? ' segmented__item--active' : ''}`}
              aria-pressed={mode === 'peak'}
              onClick={() => setMode('peak')}
            >
              Пик дня
            </button>
            <button
              type="button"
              className={`segmented__item${mode === 'hour' ? ' segmented__item--active' : ''}`}
              aria-pressed={mode === 'hour'}
              onClick={toHours}
            >
              По часам
            </button>
          </div>
          <span className="map-caption">Прогноз на {formatDate(date)}</span>
        </div>
        <div className="map-overlay map-overlay--top-right">
          {compact ? (
            <details className="map-card map-layers-toggle">
              <summary>Слои</summary>
              <LayersPanel layers={layers} onChange={setLayers} />
            </details>
          ) : (
            <LayersPanel layers={layers} onChange={setLayers} />
          )}
          {weather && (
            <div className="map-card">
              <span className="header__label">Погода на {formatDate(date)}</span>
              <span>{weatherText(weather)}</span>
              {weather.data_kind && (
                <span className="factor__note">{WEATHER_KIND_LABELS[weather.data_kind]}</span>
              )}
            </div>
          )}
          {(layers.weather || layers.events) && factorsQuery.isError && (
            <div className="map-card">{errorMessage(factorsQuery.error)}</div>
          )}
        </div>
        {notice && (
          <div className="map-overlay map-overlay--center" role="status">
            {notice}
          </div>
        )}
        <div className="map-overlay map-overlay--bottom-left">
          <MapLegend showLoad={layers.load} compact={compact} />
        </div>
      </div>

      {mode === 'hour' ? (
        <TimeSlider
          hour={playback.hour}
          onHourChange={playback.setHour}
          playing={playback.playing}
          onTogglePlay={playback.togglePlay}
          speed={playback.speed}
          onSpeedChange={playback.setSpeed}
        />
      ) : (
        <button type="button" className="button map-workspace__hours" onClick={toHours}>
          ▶ Динамика по часам
        </button>
      )}

      <NoGeometryList
        routes={withoutGeometry}
        itemFor={itemFor}
        eventFor={layers.events ? (route) => eventLabel(factors, route) : undefined}
        selectedRoute={selectedRoute}
        onSelect={onSelectRoute}
      />
    </div>
  );
}
