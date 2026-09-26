import { useSearchParams } from 'react-router';
import type { ForecastResponse, Route } from '../api';
import { DayFactors } from '../components/DayFactors';
import { OverviewMap } from '../components/overview/OverviewMap';
import { OverviewStats } from '../components/overview/OverviewStats';
import { RouteDetail } from '../components/overview/RouteDetail';
import { RoutesList } from '../components/overview/RoutesList';
import { Panel } from '../components/Panel';
import { RoutesHoursTable } from '../components/RoutesHoursTable';
import { DayOnlyNotice } from '../components/states/DayOnlyNotice';
import { QueryView } from '../components/states/QueryView';
import { useFactors } from '../hooks/useFactors';
import { useFilters } from '../hooks/useFilters';
import { useForecast } from '../hooks/useForecast';
import { useRoutes } from '../hooks/useRoutes';
import { formatDate, weekdayShort } from '../utils/dates';
import { hasNoItems } from '../utils/empty';

const EMPTY_HINT = 'Выберите другую дату в пределах ноября–декабря 2025';
const NO_ROUTES = 'Справочник маршрутов пуст';

// Экран «Обзор» (UI-2, UI-7): за 5 секунд понять, где и когда будет пик
export function OverviewPage() {
  const { horizon } = useFilters();
  if (horizon === 'month') {
    return <DayOnlyNotice title="Обзор" message="Обзор показывает прогноз на один день по часам" />;
  }
  return <OverviewDay />;
}

// Выбранный маршрут — в адресе (?route=17): карточку можно открыть ссылкой и закрыть кнопкой «Назад»
function useSelectedRoute(): [number | undefined, (route: number | undefined) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('route');
  const selected = raw === null ? undefined : Number(raw);
  const select = (route: number | undefined) =>
    setSearchParams((params) => {
      if (route === undefined) params.delete('route');
      else params.set('route', String(route));
      return params;
    });
  return [Number.isInteger(selected) ? selected : undefined, select];
}

function OverviewDay() {
  const { date } = useFilters();
  const routesQuery = useRoutes();
  const forecastQuery = useForecast();
  const factorsQuery = useFactors(date);
  const [selectedRoute, selectRoute] = useSelectedRoute();
  // Повторный клик по выбранному маршруту закрывает карточку
  const toggleRoute = (route: number) => selectRoute(route === selectedRoute ? undefined : route);

  return (
    <div className="page page--overview">
      <QueryView query={forecastQuery} isEmpty={hasNoItems} emptyHint={EMPTY_HINT}>
        {(forecast) => (
          <OverviewStats forecast={forecast} routesTotal={routesQuery.data?.total} date={date} />
        )}
      </QueryView>

      <QueryView query={routesQuery} isEmpty={hasNoItems} emptyMessage={NO_ROUTES}>
        {(routes) => (
          <>
            <div className="overview-grid">
              <Panel title="Карта маршрутов и прогноз пассажиропотока">
                <OverviewMap
                  routes={routes.items}
                  forecastQuery={forecastQuery}
                  selectedRoute={selectedRoute}
                  onSelectRoute={toggleRoute}
                />
              </Panel>
              <Panel title="Маршруты">
                <QueryView query={forecastQuery} isEmpty={hasNoItems} emptyHint={EMPTY_HINT}>
                  {(forecast) => (
                    <RoutesList
                      routes={routes.items}
                      items={forecast.items}
                      selectedRoute={selectedRoute}
                      onSelect={toggleRoute}
                    />
                  )}
                </QueryView>
              </Panel>
            </div>

            <SelectedRouteDetail
              routes={routes.items}
              forecast={forecastQuery.data}
              selectedRoute={selectedRoute}
              onClose={() => selectRoute(undefined)}
            />

            <Panel title={`Маршруты × часы, ${formatDate(date)}, ${weekdayShort(date)}`}>
              <QueryView query={forecastQuery} isEmpty={hasNoItems} emptyHint={EMPTY_HINT}>
                {(forecast) => (
                  <RoutesHoursTable
                    routes={routes.items}
                    items={forecast.items}
                    selectedRoute={selectedRoute}
                    onSelectRoute={toggleRoute}
                  />
                )}
              </QueryView>
            </Panel>
          </>
        )}
      </QueryView>

      <Panel title="Факторы дня">
        <QueryView query={factorsQuery}>{(factors) => <DayFactors factors={factors} />}</QueryView>
      </Panel>
    </div>
  );
}

function SelectedRouteDetail({
  routes,
  forecast,
  selectedRoute,
  onClose,
}: {
  routes: Route[];
  forecast: ForecastResponse | undefined;
  selectedRoute: number | undefined;
  onClose: () => void;
}) {
  if (selectedRoute === undefined || !forecast) return null;
  const route = routes.find((item) => item.route === selectedRoute);
  if (!route) return null;
  return (
    <RouteDetail
      // Новый маршрут — карточка открывается с первой вкладки
      key={route.route}
      route={route}
      dayItems={forecast.items.filter((item) => item.route === route.route)}
      onClose={onClose}
    />
  );
}
