import type { ForecastItem } from '../../api';
import { formatInterval } from '../../utils/decisions';
import { overloadInterval, peakLoadItem, totalPrediction } from '../../utils/forecast';
import { formatDecimal, formatHourTime, formatThousands } from '../../utils/format';
import { Icon } from '../Icon';

interface DayStatsProps {
  dayItems: ForecastItem[];
  waitingDecisions: number;
  onOpenDecisions: () => void;
}

// Цифры дня маршрута и где пик. У пика с превышением — предупреждение, не галочка (экран 1а)
export function DayStats({ dayItems, waitingDecisions, onOpenDecisions }: DayStatsProps) {
  const peak = peakLoadItem(dayItems);
  const overload = overloadInterval(dayItems);
  const maxTrams = Math.max(0, ...dayItems.map((item) => item.trams_on_line ?? 0));

  return (
    <div className="flow-tab">
      <dl className="chart-summary">
        <div>
          <dt>За день</dt>
          <dd>{formatThousands(totalPrediction(dayItems))} пасс.</dd>
        </div>
        <div>
          <dt>Трамваев на линии в пик</dt>
          <dd>{maxTrams || '—'}</dd>
        </div>
        <div>
          <dt>Пассажиров на трамвай в пик</dt>
          <dd className={overload ? 'text-up' : undefined}>
            {peak?.passengers_per_tram == null ? '—' : formatDecimal(peak.passengers_per_tram)}
          </dd>
        </div>
      </dl>
      <div className={`peak-strip${overload ? ' peak-strip--warning' : ' peak-strip--ok'}`}>
        <Icon name={overload ? 'warning' : 'check'} size={18} />
        {overload ? (
          <span>
            Пик {formatInterval(overload)} — выше нормы
            {waitingDecisions > 0 && <span className="muted"> · есть решение</span>}
          </span>
        ) : (
          <span>Пик {peak?.hour == null ? '' : formatHourTime(peak.hour)} — в пределах нормы</span>
        )}
        {overload && (
          <button type="button" className="button button--primary" onClick={onOpenDecisions}>
            {waitingDecisions > 0 ? 'Открыть решение →' : 'Решения →'}
          </button>
        )}
      </div>
    </div>
  );
}
