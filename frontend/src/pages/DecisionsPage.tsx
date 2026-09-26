import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { DecisionList } from '../api';
import { DecisionJournal } from '../components/decisions/DecisionJournal';
import { DecisionListItem } from '../components/decisions/DecisionListItem';
import { Panel } from '../components/Panel';
import { EmptyState } from '../components/states/EmptyState';
import { QueryView } from '../components/states/QueryView';
import { Tabs } from '../components/Tabs';
import { NO_DATA_LABEL, PASSENGERS_PER_TRAM_NORM } from '../config/constants';
import { useDecisionsForDate } from '../hooks/useDecisions';
import { useFilters } from '../hooks/useFilters';
import { useRoutes } from '../hooks/useRoutes';
import { formatDate } from '../utils/dates';
import { decisionTab, groupDecisions, type DecisionTab } from '../utils/decisions';
import { hasNoData } from '../utils/routes';

const TABS: { id: DecisionTab; label: string }[] = [
  { id: 'new', label: 'Новые' },
  { id: 'accepted', label: 'Принятые' },
  { id: 'rejected', label: 'Отклонённые' },
  { id: 'closed', label: 'Закрытые' },
];

const EMPTY_MESSAGES: Record<DecisionTab, string> = {
  new: 'Новых решений нет — прогноз не превышает норму',
  accepted: 'Принятых решений пока нет',
  rejected: 'Отклонённых решений нет',
  closed: 'Закрытых и просроченных решений нет',
};

// Экран «Решения» (UI-8): предложения по всем маршрутам на дату и журнал действий.
// Решения всегда на конкретный день — горизонт в шапке на экран не влияет
export function DecisionsPage() {
  const { date, route: contextRoute, setRoute: setContextRoute } = useFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  // Без ?route — маршрут, с которым диспетчер уже работает (общий контекст шапки)
  const routeParam =
    searchParams.get('route') ?? (contextRoute === null ? null : String(contextRoute));
  const route = routeParam === null ? undefined : Number(routeParam);
  const routesQuery = useRoutes();
  const decisionsQuery = useDecisionsForDate(date, Number.isInteger(route) ? route : undefined);
  const [tab, setTab] = useState<DecisionTab>('new');

  const setRoute = (value: string) => {
    setContextRoute(value === '' ? null : Number(value));
    setSearchParams((params) => {
      if (value === '') params.delete('route');
      else params.set('route', value);
      return params;
    });
  };

  return (
    <div className="decisions-grid">
      <div className="decisions-grid__main">
        <div className="toolbar">
          <label className="toolbar__field">
            <span className="header__label">Маршрут</span>
            <select
              className="field"
              value={routeParam ?? ''}
              onChange={(event) => setRoute(event.target.value)}
            >
              <option value="">Все маршруты</option>
              {routesQuery.data?.items.map((item) => (
                <option key={item.route} value={item.route}>
                  Маршрут {item.route}
                  {hasNoData(item) ? ` — ${NO_DATA_LABEL}` : ''}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">Решения на {formatDate(date)}</span>
        </div>

        <QueryView query={decisionsQuery}>
          {(decisions) => (
            <DecisionTabs
              // Другая дата или маршрут — раскрываем заново первое решение
              key={`${date}-${routeParam ?? 'all'}`}
              decisions={decisions}
              tab={tab}
              onTabChange={setTab}
            />
          )}
        </QueryView>

        <p className="muted">
          Норма — {PASSENGERS_PER_TRAM_NORM} пассажиров на трамвай; настройка появится на экране
          «Настройки». Переброска выходов — только между маршрутами одного депо.
        </p>
      </div>

      <Panel title="Журнал" className="decisions-grid__side">
        <DecisionJournal />
      </Panel>
    </div>
  );
}

function DecisionTabs({
  decisions,
  tab,
  onTabChange,
}: {
  decisions: DecisionList;
  tab: DecisionTab;
  onTabChange: (tab: DecisionTab) => void;
}) {
  const groups = groupDecisions(decisions.items).sort((a, b) =>
    a.main.deadline_at.localeCompare(b.main.deadline_at),
  );
  const byTab = (id: DecisionTab) => groups.filter((group) => decisionTab(group) === id);
  const visible = byTab(tab);
  // Раскрыто одно решение; по умолчанию — первое в списке (самый ранний крайний срок)
  const [expandedId, setExpandedId] = useState<number | null | undefined>(undefined);
  const expanded = expandedId === undefined ? visible[0]?.main.decision_id : expandedId;

  return (
    <>
      <Tabs
        items={TABS.map((item) => {
          const count = byTab(item.id).length;
          return count ? { ...item, label: `${item.label} (${count})` } : item;
        })}
        value={tab}
        onChange={(id) => {
          onTabChange(id);
          setExpandedId(undefined);
        }}
        label="Статус решений"
      />
      {visible.length === 0 ? (
        <EmptyState message={EMPTY_MESSAGES[tab]} />
      ) : (
        <ul className="decision-list">
          {visible.map(({ main, alternatives }) => (
            <DecisionListItem
              key={main.decision_id}
              decision={main}
              alternatives={alternatives}
              expanded={main.decision_id === expanded}
              onToggle={() =>
                setExpandedId(main.decision_id === expanded ? null : main.decision_id)
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}
