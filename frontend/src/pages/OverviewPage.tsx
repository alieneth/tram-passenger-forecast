import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ForecastResponse, Route } from '../api';
import { LazyRoutesMap } from '../components/map/LazyRoutesMap';
import { MapLegend } from '../components/map/MapLegend';
import { toMapRoutes } from '../components/map/mapData';
import { mapNotice } from '../components/map/mapNotice';
import { NoGeometryList } from '../components/map/NoGeometryList';
import { DayFactors } from '../components/DayFactors';
import { Panel } from '../components/Panel';
import { RoutesHoursTable } from '../components/RoutesHoursTable';
import { DayOnlyNotice } from '../components/states/DayOnlyNotice';
import { QueryView } from '../components/states/QueryView';
import { StatCard } from '../components/StatCard';
import { useFactors } from '../hooks/useFactors';
import { useFilters } from '../hooks/useFilters';
import { useForecast } from '../hooks/useForecast';
import { useRouteGeometries } from '../hooks/useRouteGeometries';
import { useRoutes } from '../hooks/useRoutes';
import { formatDate } from '../utils/dates';
import {
  itemsByRoute,
  peakHour,
  peakLoadItem,
  routesOverNorm,
  totalPrediction,
} from '../utils/forecast';
import { hasNoItems } from '../utils/empty';
import { formatHourTime, formatThousands } from '../utils/format';

const EMPTY_HINT = 'Выберите другую дату в пределах ноября–декабря 2025';
const NO_ROUTES = 'Справочник маршрутов пуст';

export function OverviewPage() {
  const { horizon } = useFilters();
  if (horizon === 'month') {
    return <DayOnlyNotice title="Обзор" message="Обзор показывает прогноз на один день по часам" />;
  }
  return <OverviewDay />;
}

function OverviewDay() {
  const { date } = useFilters();
  const routesQuery = useRoutes();
  const forecastQuery = useForecast();
  const factorsQuery = useFactors(date);

  return (
    <div className="page page--overview">
      <QueryView query={forecastQuery} isEmpty={hasNoItems} emptyHint={EMPTY_HINT}>
        {(forecast) => {
          const peak = peakHour(forecast.items);
          const overNorm = routesOverNorm(forecast.items);
          const routesTotal = routesQuery.data?.total;
          return (
            <div className="stat-row">
              <StatCard
                label="Пассажиров за день (прогноз)"
                value={formatThousands(totalPrediction(forecast.items))}
              />
              <StatCard
                label="Пиковый час"
                tone="danger"
                value={
                  peak
                    ? `${formatHourTime(peak.hour)} · ${formatThousands(peak.prediction)} пасс.`
                    : '—'
                }
              />
              <StatCard
                label="Маршрутов с пиковой нагрузкой"
                tone="warning"
                value={`${overNorm.size} из ${routesTotal ?? '—'}`}
                note="пассажиров на трамвай выше нормы"
              />
              {/* Вместо карточки MAE — решения (общее правило 9). GET /decisions — волна 2 */}
              <StatCard
                label="Решения ждут диспетчера"
                value="—"
                note={<Link to="/decisions">Перейти →</Link>}
              />
            </div>
          );
        }}
      </QueryView>

      <div className="overview-grid">
        <Panel title="Карта маршрутов и прогноз пассажиропотока">
          <QueryView query={routesQuery} isEmpty={hasNoItems} emptyMessage={NO_ROUTES}>
            {(routes) => <OverviewMap routes={routes.items} forecastQuery={forecastQuery} />}
          </QueryView>
        </Panel>
        <Panel title={`Маршруты × часы, ${formatDate(date)}`}>
          <QueryView query={routesQuery} isEmpty={hasNoItems} emptyMessage={NO_ROUTES}>
            {(routes) => (
              <QueryView query={forecastQuery} isEmpty={hasNoItems} emptyHint={EMPTY_HINT}>
                {(forecast) => <RoutesHoursTable routes={routes.items} items={forecast.items} />}
              </QueryView>
            )}
          </QueryView>
        </Panel>
      </div>

      <Panel title="Факторы дня">
        <QueryView query={factorsQuery}>{(factors) => <DayFactors factors={factors} />}</QueryView>
      </Panel>
    </div>
  );
}

// Каждый маршрут — цветом своего самого загруженного часа, поэтому красных линий
// ровно столько, сколько в карточке «Маршрутов с пиковой нагрузкой»
function OverviewMap({
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
