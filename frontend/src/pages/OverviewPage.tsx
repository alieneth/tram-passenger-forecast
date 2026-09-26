import { useState } from 'react';
import type { Route } from '../api';
import { DayFactors } from '../components/DayFactors';
import { MapWorkspace } from '../components/map/MapWorkspace';
import { OverviewStats } from '../components/overview/OverviewStats';
import { RoutesDaysTable } from '../components/overview/RoutesDaysTable';
import { RoutesList } from '../components/overview/RoutesList';
import { RouteWorkspace } from '../components/overview/RouteWorkspace';
import { Panel } from '../components/Panel';
import { RoutesHoursTable } from '../components/RoutesHoursTable';
import { QueryView } from '../components/states/QueryView';
import { Tabs } from '../components/Tabs';
import { DEFAULT_MAP_HOUR } from '../config/constants';
import { useDayForecast } from '../hooks/useDayForecast';
import { useFactors } from '../hooks/useFactors';
import { useFilters } from '../hooks/useFilters';
import { useForecast } from '../hooks/useForecast';
import { useMonthCalendar } from '../hooks/useMonthCalendar';
import { useRoutes } from '../hooks/useRoutes';
import { formatDate, monthTitle, weekdayShort } from '../utils/dates';
import { hasNoItems } from '../utils/empty';
import { periodFor } from '../utils/horizon';

const EMPTY_HINT = 'Выберите другую дату в пределах ноября–декабря 2025';

// Рабочий экран диспетчера (UI-2, UI-7 после Q&A): сплит — слева карта, справа сводка или развёртка
// выбранного маршрута. Карта не перезагружается при переключении представлений справа
export function OverviewPage() {
  const routesQuery = useRoutes();
  return (
    <QueryView query={routesQuery} isEmpty={hasNoItems} emptyMessage="Справочник маршрутов пуст">
      {(routes) => <Workspace routes={routes.items} />}
    </QueryView>
  );
}

function Workspace({ routes }: { routes: Route[] }) {
  const { route, setRoute } = useFilters();
  const selected = routes.find((item) => item.route === route) ?? null;
  // Повторный клик по выбранному маршруту — назад к общей картине
  const toggle = (next: number) => setRoute(next === route ? null : next);

  return (
    <div className="workspace">
      <div className="workspace__map">
        <MapWorkspace
          routes={routes}
          selectedRoute={route}
          onSelectRoute={toggle}
          initialMode="peak"
          initialHour={DEFAULT_MAP_HOUR}
          compact
        />
      </div>
      <div className="workspace__pane">
        {selected ? (
          <RouteWorkspace key={selected.route} route={selected} onClose={() => setRoute(null)} />
        ) : (
          <SummaryPane routes={routes} onSelectRoute={toggle} />
        )}
      </div>
    </div>
  );
}

type SummaryView = 'table' | 'list';

function SummaryPane({
  routes,
  onSelectRoute,
}: {
  routes: Route[];
  onSelectRoute: (route: number) => void;
}) {
  const { horizon, date } = useFilters();
  const [view, setView] = useState<SummaryView>('table');
  const dayQuery = useDayForecast(date);
  const periodQuery = useForecast();
  const factorsQuery = useFactors(date);
  const calendar = useMonthCalendar(date);

  if (horizon !== 'day') {
    const period = periodFor(horizon, date);
    const title =
      horizon === 'week'
        ? `Маршруты × дни, неделя ${formatDate(period.date_from).slice(0, 5)}–${formatDate(period.date_to).slice(0, 5)}`
        : `Маршруты × дни, ${monthTitle(date)}`;
    return (
      <Panel title={title}>
        <QueryView query={periodQuery} isEmpty={hasNoItems} emptyHint={EMPTY_HINT}>
          {(forecast) => (
            <RoutesDaysTable
              routes={routes}
              items={forecast.items}
              calendar={calendar.days}
              selectedRoute={null}
              onSelectRoute={onSelectRoute}
            />
          )}
        </QueryView>
        <p className="muted">
          Выберите маршрут — справа откроется его {horizon === 'week' ? 'неделя' : 'месяц'} по дням.
        </p>
      </Panel>
    );
  }

  return (
    <div className="page">
      <QueryView query={dayQuery} isEmpty={hasNoItems} emptyHint={EMPTY_HINT}>
        {(forecast) => (
          <OverviewStats forecast={forecast} routesTotal={routes.length} date={date} />
        )}
      </QueryView>
      <Panel title={`${formatDate(date)}, ${weekdayShort(date)}`}>
        <Tabs
          items={[
            { id: 'table', label: 'Маршруты × часы' },
            { id: 'list', label: 'Список маршрутов' },
          ]}
          value={view}
          onChange={setView}
          label="Представление"
        />
        <div className="route-workspace__tab">
          <QueryView query={dayQuery} isEmpty={hasNoItems} emptyHint={EMPTY_HINT}>
            {(forecast) =>
              view === 'table' ? (
                <RoutesHoursTable
                  routes={routes}
                  items={forecast.items}
                  onSelectRoute={onSelectRoute}
                />
              ) : (
                <RoutesList
                  routes={routes}
                  items={forecast.items}
                  selectedRoute={undefined}
                  onSelect={onSelectRoute}
                />
              )
            }
          </QueryView>
        </div>
      </Panel>
      <Panel title="Факторы дня">
        <QueryView query={factorsQuery}>{(factors) => <DayFactors factors={factors} />}</QueryView>
      </Panel>
    </div>
  );
}
