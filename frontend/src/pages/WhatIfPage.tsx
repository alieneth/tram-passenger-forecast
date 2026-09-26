import { useQuery } from '@tanstack/react-query';
import { getForecast, type Route } from '../api';
import { Panel } from '../components/Panel';
import { DayOnlyNotice } from '../components/states/DayOnlyNotice';
import { QueryView } from '../components/states/QueryView';
import { ScenarioCards } from '../components/whatIf/ScenarioCards';
import { ScenarioChart } from '../components/whatIf/ScenarioChart';
import { ScenarioForm } from '../components/whatIf/ScenarioForm';
import { PASSENGERS_PER_TRAM_NORM } from '../config/constants';
import { useFilters } from '../hooks/useFilters';
import { useRoutes } from '../hooks/useRoutes';
import { useScenarioParams } from '../hooks/useScenarioParams';
import { formatDate } from '../utils/dates';
import { hasNoItems } from '../utils/empty';
import { buildScenario, peakTrams, summarize } from '../utils/scenario';

// Экран «Что если» (UI-11): сколько выходов нужно, чтобы уложиться в норму — до решения
export function WhatIfPage() {
  const { horizon } = useFilters();
  const routesQuery = useRoutes();
  if (horizon === 'month') {
    return <DayOnlyNotice title="Что если" message="Сценарий считается по часам одного дня" />;
  }
  return (
    <QueryView query={routesQuery} isEmpty={hasNoItems} emptyMessage="Справочник маршрутов пуст">
      {(routes) => <WhatIfScreen routes={routes.items} />}
    </QueryView>
  );
}

function WhatIfScreen({ routes }: { routes: Route[] }) {
  const { date } = useFilters();
  const { state, setRoute, setInterval, setTramsDelta, reset } = useScenarioParams();
  const route = routes.find((item) => item.route === state.route)?.route ?? routes[0]?.route ?? 1;
  const forecastQuery = useQuery({
    queryKey: ['forecast', 'what-if', route, date],
    queryFn: ({ signal }) =>
      getForecast({ route: [route], date_from: date, date_to: date, horizon: 'day' }, signal),
  });
  const items = forecastQuery.data?.items ?? [];
  const basePeak = peakTrams(items, state.hours);

  return (
    <div className="what-if-grid">
      <Panel title="Сценарий">
        <ScenarioForm
          routes={routes}
          route={route}
          state={state}
          basePeakTrams={basePeak}
          onRouteChange={setRoute}
          onIntervalChange={setInterval}
          onDeltaChange={setTramsDelta}
          onReset={reset}
        />
      </Panel>
      <div className="what-if-grid__main">
        <Panel title={`Пассажиров на трамвай по часам · маршрут ${route} · ${formatDate(date)}`}>
          <QueryView query={forecastQuery} isEmpty={hasNoItems}>
            {(forecast) => {
              const points = buildScenario(forecast.items, {
                hours: state.hours,
                tramsDelta: state.tramsDelta,
              });
              return (
                <>
                  <ScenarioChart points={points} tramsDelta={state.tramsDelta} />
                  <ScenarioCards summary={summarize(points)} />
                </>
              );
            }}
          </QueryView>
        </Panel>
        <p className="muted">
          Поток пассажиров считаем неизменным: меняется только число трамваев в выбранные часы.
          Норма — {PASSENGERS_PER_TRAM_NORM} пассажиров на трамвай.
        </p>
      </div>
    </div>
  );
}
