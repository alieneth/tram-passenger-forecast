import { DayFactors } from '../components/DayFactors';
import { OverviewMap } from '../components/overview/OverviewMap';
import { OverviewStats } from '../components/overview/OverviewStats';
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

// Экран «Обзор» (UI-2): за 5 секунд понять, где и когда будет пик
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
        {(forecast) => (
          <OverviewStats forecast={forecast} routesTotal={routesQuery.data?.total} date={date} />
        )}
      </QueryView>

      <div className="overview-grid">
        <Panel title="Карта маршрутов и прогноз пассажиропотока">
          <QueryView query={routesQuery} isEmpty={hasNoItems} emptyMessage={NO_ROUTES}>
            {(routes) => <OverviewMap routes={routes.items} forecastQuery={forecastQuery} />}
          </QueryView>
        </Panel>
        <Panel title={`Маршруты × часы, ${formatDate(date)}, ${weekdayShort(date)}`}>
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
