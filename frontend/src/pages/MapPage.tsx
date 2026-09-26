import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage, type Route } from '../api';
import { LayersPanel, type MapLayers } from '../components/map/LayersPanel';
import { LazyRoutesMap } from '../components/map/LazyRoutesMap';
import { MapLegend } from '../components/map/MapLegend';
import { toMapRoutes } from '../components/map/mapData';
import { mapNotice } from '../components/map/mapNotice';
import { NoGeometryList } from '../components/map/NoGeometryList';
import { TimeSlider } from '../components/map/TimeSlider';
import { DayOnlyNotice } from '../components/states/DayOnlyNotice';
import { QueryView } from '../components/states/QueryView';
import { DEFAULT_MAP_HOUR, DISPLAY_HOURS } from '../config/constants';
import { useFactors } from '../hooks/useFactors';
import { useFilters } from '../hooks/useFilters';
import { useForecast } from '../hooks/useForecast';
import { usePlayback } from '../hooks/usePlayback';
import { useRouteGeometries } from '../hooks/useRouteGeometries';
import { useRoutes } from '../hooks/useRoutes';
import { formatDate } from '../utils/dates';
import { hasNoItems } from '../utils/empty';
import { itemsByRouteAndHour } from '../utils/forecast';
import { WEATHER_KIND_LABELS, eventLabel, weatherText } from '../utils/weather';

// Экран «Карта» (UI-3): тепловая карта маршрутов по часам, слои, «Проиграть день»
export function MapPage() {
  const { horizon } = useFilters();
  const routesQuery = useRoutes();

  if (horizon === 'month') {
    return <DayOnlyNotice title="Карта" message="Карта показывает прогноз по часам" />;
  }

  return (
    <QueryView query={routesQuery} isEmpty={hasNoItems} emptyMessage="Справочник маршрутов пуст">
      {(routes) => <MapScreen routes={routes.items} />}
    </QueryView>
  );
}

function MapScreen({ routes }: { routes: Route[] }) {
  const navigate = useNavigate();
  const { date } = useFilters();
  const forecastQuery = useForecast();
  const factorsQuery = useFactors(date);
  const { geometries, isPending: geometriesPending, withoutGeometry } = useRouteGeometries(routes);
  const notice = mapNotice(forecastQuery, {
    count: geometries.length,
    isPending: geometriesPending,
  });
  const playback = usePlayback(DISPLAY_HOURS, DEFAULT_MAP_HOUR);
  const [layers, setLayers] = useState<MapLayers>({ load: true, weather: false, events: false });

  const grid = useMemo(
    () => itemsByRouteAndHour(forecastQuery.data?.items ?? []),
    [forecastQuery.data],
  );
  const itemFor = (route: number) => grid.get(route)?.get(playback.hour);
  const factors = layers.events ? factorsQuery.data : undefined;
  const eventFor = (route: number) => eventLabel(factors, route);

  const mapRoutes = useMemo(
    () =>
      toMapRoutes({
        routes,
        geometries,
        itemFor: (route) => grid.get(route)?.get(playback.hour),
        eventFor: (route) => eventLabel(factors, route),
      }),
    [routes, geometries, grid, playback.hour, factors],
  );
  const weather = layers.weather ? factorsQuery.data?.weather : undefined;

  return (
    <div className="page">
      <div className="map-screen">
        <LazyRoutesMap
          routes={mapRoutes}
          showLoad={layers.load}
          onRouteClick={(route) => navigate(`/route/${route}`)}
        />
        <div className="map-overlay map-overlay--top-right">
          <LayersPanel layers={layers} onChange={setLayers} />
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
          <MapLegend showLoad={layers.load} />
        </div>
      </div>

      <TimeSlider
        hour={playback.hour}
        onHourChange={playback.setHour}
        playing={playback.playing}
        onTogglePlay={playback.togglePlay}
        speed={playback.speed}
        onSpeedChange={playback.setSpeed}
      />

      <NoGeometryList
        routes={withoutGeometry}
        itemFor={itemFor}
        eventFor={layers.events ? eventFor : undefined}
      />
    </div>
  );
}
