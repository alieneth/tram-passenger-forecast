import { useQuery } from '@tanstack/react-query';
import { getForecast, type Route } from '../api';
import { Panel } from '../components/Panel';
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

// Экран «Что если» (UI-11): сколько выходов нужно, чтобы уложиться в норму — до решения.
// Сценарий всегда на день выбранной даты — горизонт в шапке на экран не влияет
export function WhatIfPage() {
  const routesQuery = useRoutes();
  return (
    <QueryView query={routesQuery} isEmpty={hasNoItems} emptyMessage="Справочник маршрутов пуст">
      {(routes) => <WhatIfScreen routes={routes.items} />}
    </QueryView>
  );
}

function WhatIfScreen({ routes }: { routes: Route[] }) {
  const { date, route: contextRoute, setRoute: setContextRoute } = useFilters();
  const { state, setRoute, setInterval, setTramsDelta, setCorrection, reset } = useScenarioParams();
  // Маршрут из адреса (ссылка «В симулятор»), иначе тот, с которым диспетчер уже работает
  const route =
    routes.find((item) => item.route === (state.route ?? contextRoute))?.route ??
    routes[0]?.route ??
    1;
  const changeRoute = (next: number) => {
    setRoute(next);
    setContextRoute(next);
  };
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
          onRouteChange={changeRoute}
          onIntervalChange={setInterval}
          onDeltaChange={setTramsDelta}
          onCorrectionChange={setCorrection}
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
                corrections: {
                  weather: state.correctionsPct.weather / 100,
                  event: state.correctionsPct.event / 100,
                  season: state.correctionsPct.season / 100,
                },
              });
              return (
                <>
                  <ScenarioChart
                    points={points}
                    tramsDelta={state.tramsDelta}
                    correctionsPct={state.correctionsPct}
                  />
                  <ScenarioCards summary={summarize(points)} />
                </>
              );
            }}
          </QueryView>
        </Panel>
        <p className="muted">
          Выходы меняют число трамваев в выбранные часы при том же потоке; коэффициенты умножают
          поток на весь день — это поправка диспетчера поверх прогноза модели. Норма —{' '}
          {PASSENGERS_PER_TRAM_NORM} пассажиров на трамвай.
        </p>
      </div>
    </div>
  );
}
