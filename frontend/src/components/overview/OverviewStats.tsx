import { Link } from 'react-router';
import { errorMessage, type ForecastResponse } from '../../api';
import { useWaitingDecisions } from '../../hooks/useDecisions';
import { peakHour, routesOverNorm, totalPrediction } from '../../utils/forecast';
import { formatHourTime, formatThousands } from '../../utils/format';
import { StatCard } from '../StatCard';

interface OverviewStatsProps {
  forecast: ForecastResponse;
  routesTotal: number | undefined;
  date: string;
}

// Четыре цифры дня. Вместо карточки MAE — «Решения ждут диспетчера» (общее правило 9)
export function OverviewStats({ forecast, routesTotal, date }: OverviewStatsProps) {
  const peak = peakHour(forecast.items);
  const overNorm = routesOverNorm(forecast.items).size;
  const decisions = useWaitingDecisions(date);
  // Альтернативы (parent_decision_id) — варианты того же решения, считаем только основные
  const waiting = decisions.data?.items.filter((item) => item.parent_decision_id == null).length;

  return (
    <div className="stat-row">
      <StatCard
        icon="users"
        label="Пассажиров за день (прогноз)"
        value={formatThousands(totalPrediction(forecast.items))}
      />
      <StatCard
        icon="clock"
        tone="danger"
        label="Пиковый час"
        value={
          peak ? `${formatHourTime(peak.hour)} · ${formatThousands(peak.prediction)} пасс.` : '—'
        }
        note={peak && <Link to={`/map?hour=${peak.hour}`}>Показать на карте →</Link>}
      />
      {/* Зелёная галочка — только когда проблемы нет (общее правило 8) */}
      <StatCard
        icon={overNorm > 0 ? 'warning' : 'check'}
        tone={overNorm > 0 ? 'warning' : 'ok'}
        label="Маршрутов с пиковой нагрузкой"
        value={`${overNorm} из ${routesTotal ?? '—'}`}
        note="пассажиров на трамвай выше нормы"
      />
      <StatCard
        icon={waiting ? 'decisions' : 'check'}
        tone={waiting ? 'warning' : waiting === 0 ? 'ok' : 'default'}
        label="Решения ждут диспетчера"
        value={decisions.isPending ? '…' : (waiting ?? '—')}
        note={
          decisions.isError ? (
            errorMessage(decisions.error)
          ) : (
            <Link to={`/decisions?date=${date}`}>Перейти →</Link>
          )
        }
      />
    </div>
  );
}
