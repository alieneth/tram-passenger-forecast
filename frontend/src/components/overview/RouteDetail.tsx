import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import type { ForecastItem, Route } from '../../api';
import { DISPLAY_HOURS } from '../../config/constants';
import { useFilters } from '../../hooks/useFilters';
import { useRouteDecisions } from '../../hooks/useDecisions';
import { isWaiting } from '../../utils/decisions';
import { Panel } from '../Panel';
import { RouteLabel } from '../RouteLabel';
import { LoadingState } from '../states/LoadingState';
import { Tabs } from '../Tabs';
import { DecisionsTab } from './DecisionsTab';
import { FlowTab } from './FlowTab';

// График тянет Recharts — грузим его, только когда открыли вкладку «График»
const DayForecastContent = lazy(() =>
  import('../route/DayForecastPanel').then((module) => ({ default: module.DayForecastContent })),
);

type DetailTab = 'flow' | 'chart' | 'decisions';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'flow', label: 'Пассажиропоток' },
  { id: 'chart', label: 'График' },
  { id: 'decisions', label: 'Решения' },
];

interface RouteDetailProps {
  route: Route;
  // Почасовой прогноз маршрута на выбранную дату (из общего запроса Обзора)
  dayItems: ForecastItem[];
  onClose: () => void;
}

// «Детализация · Маршрут N» на Обзоре (UI-7): Пассажиропоток / График / Решения
export function RouteDetail({ route, dayItems, onClose }: RouteDetailProps) {
  const { date } = useFilters();
  const [tab, setTab] = useState<DetailTab>('flow');
  const decisions = useRouteDecisions(route.route, date);
  const waiting = decisions.data?.items.filter(
    (item) => item.parent_decision_id == null && isWaiting(item),
  ).length;

  return (
    <Panel
      className="route-detail"
      title={`Детализация · Маршрут ${route.route}`}
      actions={
        <div className="route-detail__actions">
          <Link to={`/route/${route.route}`}>Экран маршрута →</Link>
          <button
            type="button"
            className="button button--small"
            aria-label="Закрыть детализацию"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      }
    >
      <RouteLabel route={route} showName />
      <Tabs
        items={TABS.map((item) =>
          item.id === 'decisions' && waiting ? { ...item, label: `Решения · ${waiting}` } : item,
        )}
        value={tab}
        onChange={setTab}
        label={`Детализация маршрута ${route.route}`}
      />
      <div role="tabpanel" className="route-detail__body">
        {tab === 'flow' && (
          <FlowTab
            route={route}
            dayItems={dayItems}
            waitingDecisions={waiting ?? 0}
            onOpenDecisions={() => setTab('decisions')}
          />
        )}
        {tab === 'chart' && (
          <Suspense fallback={<LoadingState text="Загружаем график…" />}>
            <DayForecastContent
              route={route.route}
              date={date}
              items={dayItems}
              hours={DISPLAY_HOURS}
              compareEnabled
            />
          </Suspense>
        )}
        {tab === 'decisions' && <DecisionsTab route={route} />}
      </div>
    </Panel>
  );
}
