import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import type { ForecastItem, Route } from '../../api';
import { DISPLAY_HOURS } from '../../config/constants';
import { useFilters } from '../../hooks/useFilters';
import { useRouteDecisions } from '../../hooks/useDecisions';
import { useDayForecast } from '../../hooks/useDayForecast';
import { formatDate, monthTitle } from '../../utils/dates';
import { isWaiting } from '../../utils/decisions';
import { periodFor } from '../../utils/horizon';
import { RouteMonthView } from '../month/RouteMonthView';
import { RouteLabel } from '../RouteLabel';
import { LoadingState } from '../states/LoadingState';
import { QueryView } from '../states/QueryView';
import { Tabs } from '../Tabs';
import { RouteWeekView } from '../week/RouteWeekView';
import { DayStats } from './DayStats';
import { DecisionsTab } from './DecisionsTab';

// График тянет Recharts — грузим отдельным чанком
const DayForecastContent = lazy(() =>
  import('../route/DayForecastPanel').then((module) => ({ default: module.DayForecastContent })),
);

type DayTab = 'forecast' | 'decisions';

// Развёртка маршрута в правой половине сплита: день → неделя → месяц по горизонту в шапке.
// Заголовок с маршрутом закреплён — всегда видно, с каким маршрутом работаешь (Q&A 26.09)
export function RouteWorkspace({ route, onClose }: { route: Route; onClose: () => void }) {
  const { horizon, date } = useFilters();
  const period = periodFor(horizon, date);
  const periodText =
    horizon === 'day'
      ? formatDate(date)
      : horizon === 'week'
        ? `неделя ${formatDate(period.date_from).slice(0, 5)}–${formatDate(period.date_to).slice(0, 5)}`
        : monthTitle(date);

  return (
    <section className="route-workspace" aria-label={`Маршрут ${route.route}`}>
      <header className="route-workspace__head">
        <button type="button" className="button button--small" onClick={onClose}>
          ← Все маршруты
        </button>
        <RouteLabel route={route} />
        <span className="route-workspace__period">{periodText}</span>
        {route.depot_name && <span className="muted">депо: {route.depot_name}</span>}
        <Link className="route-workspace__open" to={`/route/${route.route}`}>
          Экран маршрута ↗
        </Link>
      </header>
      <div className="route-workspace__body">
        {horizon === 'day' && <RouteDayView route={route} />}
        {horizon === 'week' && <RouteWeekView route={route} />}
        {horizon === 'month' && <RouteMonthView route={route} />}
      </div>
    </section>
  );
}

function RouteDayView({ route }: { route: Route }) {
  const { date } = useFilters();
  const [tab, setTab] = useState<DayTab>('forecast');
  const forecastQuery = useDayForecast(date);
  const decisions = useRouteDecisions(route.route, date);
  const waiting =
    decisions.data?.items.filter((item) => item.parent_decision_id == null && isWaiting(item))
      .length ?? 0;

  return (
    <>
      <Tabs
        items={[
          { id: 'forecast', label: 'Прогноз по часам' },
          { id: 'decisions', label: waiting ? `Решения · ${waiting}` : 'Решения' },
        ]}
        value={tab}
        onChange={setTab}
        label={`Маршрут ${route.route}, ${formatDate(date)}`}
      />
      <div role="tabpanel" className="route-workspace__tab">
        {tab === 'forecast' && (
          <QueryView query={forecastQuery}>
            {(forecast) => {
              const dayItems: ForecastItem[] = forecast.items.filter(
                (item) => item.route === route.route,
              );
              return (
                <>
                  <DayStats
                    dayItems={dayItems}
                    waitingDecisions={waiting}
                    onOpenDecisions={() => setTab('decisions')}
                  />
                  <Suspense fallback={<LoadingState text="Загружаем график…" />}>
                    <DayForecastContent
                      route={route.route}
                      date={date}
                      items={dayItems}
                      hours={DISPLAY_HOURS}
                      compareEnabled
                    />
                  </Suspense>
                </>
              );
            }}
          </QueryView>
        )}
        {tab === 'decisions' && <DecisionsTab route={route} />}
      </div>
    </>
  );
}
