import { Link } from 'react-router';
import { DayFactors } from '../components/DayFactors';
import { Panel } from '../components/Panel';
import { RoutesHoursTable } from '../components/RoutesHoursTable';
import { QueryView } from '../components/states/QueryView';
import { StatCard } from '../components/StatCard';
import { useFactors } from '../hooks/useFactors';
import { useFilters } from '../hooks/useFilters';
import { useForecast } from '../hooks/useForecast';
import { useRoutes } from '../hooks/useRoutes';
import { formatDate } from '../utils/dates';
import { peakHour, routesOverNorm, totalPrediction } from '../utils/forecast';
import { formatHourTime, formatThousands } from '../utils/format';

const EMPTY_HINT = 'Выберите другую дату в пределах ноября–декабря 2025';

export function OverviewPage() {
  const { date } = useFilters();
  const routesQuery = useRoutes();
  const forecastQuery = useForecast();
  const factorsQuery = useFactors(date);

  return (
    <div className="page page--overview">
      <QueryView query={forecastQuery} emptyHint={EMPTY_HINT}>
        {(forecast) => {
          const peak = peakHour(forecast.items);
          const overNorm = routesOverNorm(forecast.items);
          const routesTotal = routesQuery.data?.total;
          return (
            <div className="stat-row">
              <StatCard
                label="Пассажиров за день (прогноз)"
                value={formatThousands(totalPrediction(forecast.items))}
              />
              <StatCard
                label="Пиковый час"
                tone="danger"
                value={
                  peak
                    ? `${formatHourTime(peak.hour)} · ${formatThousands(peak.prediction)} пасс.`
                    : '—'
                }
              />
              <StatCard
                label="Маршрутов с пиковой нагрузкой"
                tone="warning"
                value={`${overNorm.size} из ${routesTotal ?? '—'}`}
                note="пассажиров на трамвай выше нормы"
              />
              {/* Вместо карточки MAE — решения (общее правило 9). GET /decisions — волна 2 */}
              <StatCard
                label="Решения ждут диспетчера"
                value="—"
                note={<Link to="/decisions">Перейти →</Link>}
              />
            </div>
          );
        }}
      </QueryView>

      <div className="overview-grid">
        <Panel title="Карта маршрутов и прогноз пассажиропотока">
          <div className="map-placeholder">Карта появится в задаче UI-3</div>
        </Panel>
        <Panel title={`Маршруты × часы, ${formatDate(date)}`}>
          <QueryView query={routesQuery}>
            {(routes) => (
              <QueryView query={forecastQuery} emptyHint={EMPTY_HINT}>
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
