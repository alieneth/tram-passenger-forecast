import { errorMessage, type ForecastItem } from '../../api';
import { useWeekAgo, type Comparison } from '../../hooks/useWeekAgo';
import { formatDate } from '../../utils/dates';
import { isOverNorm } from '../../utils/forecast';
import { formatDecimal, formatHourTime, formatNumber } from '../../utils/format';
import { buildChartPoints, peakPoint } from '../../utils/routeChart';
import { Panel } from '../Panel';
import { EmptyState } from '../states/EmptyState';
import { HourlyChart } from './HourlyChart';
import { HourlyTable } from './HourlyTable';

interface DayForecastPanelProps {
  route: number;
  date: string;
  // Почасовой прогноз маршрута за выбранную дату (из запроса на месяц)
  items: ForecastItem[];
  hours: readonly number[];
  compareEnabled: boolean;
}

function compareLabel(comparison: Comparison): string {
  const kind = comparison.source === 'actuals' ? 'факт' : 'прогноз';
  return `Неделю назад, ${formatDate(comparison.date)} (${kind})`;
}

export function DayForecastPanel(props: DayForecastPanelProps) {
  return (
    <Panel title={`Прогноз по часам на ${formatDate(props.date)}`}>
      <DayForecastContent {...props} />
    </Panel>
  );
}

// Сам график со сводкой — без панели: его же показывает вкладка «График» карточки маршрута на Обзоре
export function DayForecastContent({
  route,
  date,
  items,
  hours,
  compareEnabled,
}: DayForecastPanelProps) {
  const weekAgo = useWeekAgo(route, date, compareEnabled);
  const comparison = compareEnabled ? weekAgo.data : undefined;
  const points = buildChartPoints(items, hours, comparison?.points);
  const peak = peakPoint(points);
  const hoursOverNorm = points.filter((point) => isOverNorm(point.item)).length;
  const maxLoad = Math.max(0, ...points.map((point) => point.item.passengers_per_tram ?? 0));

  return (
    <>
      {points.length === 0 ? (
        <EmptyState message="Нет прогноза за выбранную дату" hint="Выберите другую дату" />
      ) : (
        <>
          <HourlyChart
            points={points}
            compareLabel={comparison ? compareLabel(comparison) : null}
          />
          {compareEnabled && weekAgo.isError && (
            <p className="muted">Сравнение недоступно: {errorMessage(weekAgo.error)}</p>
          )}
          <dl className="chart-summary">
            {peak && (
              <div>
                <dt>Пик</dt>
                <dd>
                  {formatHourTime(peak.hour)} · {formatNumber(peak.prediction)} пасс./ч
                </dd>
              </div>
            )}
            {peak && (
              <div>
                <dt>Коридор в пик</dt>
                <dd>
                  {formatNumber(peak.item.lower)} – {formatNumber(peak.item.upper)}
                </dd>
              </div>
            )}
            <div>
              <dt>Часов выше нормы</dt>
              <dd className={hoursOverNorm > 0 ? 'text-up' : undefined}>{hoursOverNorm}</dd>
            </div>
            <div>
              <dt>Максимум на трамвай</dt>
              <dd>{formatDecimal(maxLoad)}</dd>
            </div>
          </dl>
          <details className="details">
            <summary>Таблица по часам</summary>
            <HourlyTable items={items} hours={hours} />
          </details>
        </>
      )}
    </>
  );
}
