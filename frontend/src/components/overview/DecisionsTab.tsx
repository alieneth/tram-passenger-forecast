import { Link } from 'react-router';
import type { Route } from '../../api';
import { useFilters } from '../../hooks/useFilters';
import { useRouteDecisions } from '../../hooks/useDecisions';
import { groupDecisions } from '../../utils/decisions';
import { hasNoItems } from '../../utils/empty';
import { DecisionCard } from '../decisions/DecisionCard';
import { QueryView } from '../states/QueryView';

// Вкладка «Решения»: предложения по маршруту на выбранную дату (экран 1в)
export function DecisionsTab({ route }: { route: Route }) {
  const { date } = useFilters();
  const decisionsQuery = useRouteDecisions(route.route, date);
  return (
    <div className="decisions-tab">
      <QueryView
        query={decisionsQuery}
        isEmpty={hasNoItems}
        emptyMessage="Решений по маршруту на эту дату нет"
        emptyHint="Прогноз не превышает норму пассажиров на трамвай"
      >
        {(decisions) =>
          groupDecisions(decisions.items).map(({ main, alternatives }) => (
            <DecisionCard key={main.decision_id} decision={main} alternatives={alternatives} />
          ))
        }
      </QueryView>
      <Link className="decision__link" to={`/decisions?route=${route.route}`}>
        Все решения по маршруту →
      </Link>
    </div>
  );
}
