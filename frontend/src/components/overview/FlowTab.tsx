import type { ForecastItem, Route } from '../../api';
import { DISPLAY_HOURS } from '../../config/constants';
import { useFilters } from '../../hooks/useFilters';
import { useMonthCalendar } from '../../hooks/useMonthCalendar';
import { useRouteWeek } from '../../hooks/useRouteWeek';
import { formatInterval } from '../../utils/decisions';
import { hasNoItems } from '../../utils/empty';
import { overloadInterval, peakLoadItem, totalPrediction } from '../../utils/forecast';
import { formatDecimal, formatHourTime, formatThousands } from '../../utils/format';
import { Icon } from '../Icon';
import { DaysHoursTable } from '../route/DaysHoursTable';
import { QueryView } from '../states/QueryView';

interface FlowTabProps {
  route: Route;
  dayItems: ForecastItem[];
  waitingDecisions: number;
  onOpenDecisions: () => void;
}

// Вкладка «Пассажиропоток»: цифры дня, неделя по часам и где пик
export function FlowTab({ route, dayItems, waitingDecisions, onOpenDecisions }: FlowTabProps) {
  const { date, setDate } = useFilters();
  const weekQuery = useRouteWeek(route.route, date);
  const calendar = useMonthCalendar(date);
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

      <QueryView query={weekQuery} isEmpty={hasNoItems}>
        {(week) => (
          <DaysHoursTable
            items={week.items}
            calendar={calendar.days}
            selectedDate={date}
            hours={DISPLAY_HOURS}
            onSelectDate={setDate}
          />
        )}
      </QueryView>

      {/* У пика с превышением — значок предупреждения, не галочка (06_opisanie-maketov, экран 1а) */}
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
