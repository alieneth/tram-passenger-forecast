import type { Decision } from '../../api';
import { useDecisionForecast } from '../../hooks/useDecisionForecast';
import { loadPoints } from '../../utils/beforeAfter';
import { hasNoItems } from '../../utils/empty';
import { QueryView } from '../states/QueryView';
import { BeforeAfterChart } from './BeforeAfterChart';
import { DecisionCard } from './DecisionCard';

// Развёрнутое решение: карточка с действиями и графики «до / после» для маршрута и донора
export function DecisionDetails({
  decision,
  alternatives,
}: {
  decision: Decision;
  alternatives: Decision[];
}) {
  const forecastQuery = useDecisionForecast(decision);
  return (
    <div className="decision-details">
      <QueryView query={forecastQuery} isEmpty={hasNoItems}>
        {(forecast) => {
          const itemsOf = (route: number) => forecast.items.filter((item) => item.route === route);
          return (
            <div className="decision-details__charts">
              <BeforeAfterChart
                title={`Маршрут ${decision.route}`}
                points={loadPoints(itemsOf(decision.route), decision, 'route')}
              />
              {decision.donor_route != null && (
                <BeforeAfterChart
                  title={`Маршрут ${decision.donor_route} (донор)`}
                  points={loadPoints(itemsOf(decision.donor_route), decision, 'donor')}
                />
              )}
            </div>
          );
        }}
      </QueryView>
      <DecisionCard decision={decision} alternatives={alternatives} showHeader={false} />
    </div>
  );
}
