import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatDate, weekdayShort } from '../../utils/dates';
import { dayTicks, tickLabel, type FactPoint } from '../../utils/factVsForecast';
import { formatHourTime, formatNumber } from '../../utils/format';
import { CHART_COLORS } from '../route/chartColors';

const CHART_HEIGHT_PX = 260;

function FactTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = payload?.[0]?.payload as FactPoint | undefined;
  if (!active || !point) return null;
  const format = (value: number | null) => (value === null ? '—' : formatNumber(value));
  return (
    <div className="chart-tooltip">
      <strong>
        {formatDate(point.date)}, {weekdayShort(point.date)}, {formatHourTime(point.hour)}
      </strong>
      <dl className="map-tooltip__grid">
        <dt>факт</dt>
        <dd>{format(point.actual)}</dd>
        <dt>прогноз</dt>
        <dd>{format(point.forecast)}</dd>
      </dl>
    </div>
  );
}

// Факт и прогноз модели по часам: видно, повторяет ли модель два будних пика и выходные
export function FactVsForecastChart({ points }: { points: FactPoint[] }) {
  return (
    <figure className="chart">
      <figcaption className="chart-legend">
        <span className="chart-legend__item">
          <span className="chart-legend__key chart-legend__key--compare" aria-hidden="true" />
          Факт
        </span>
        <span className="chart-legend__item">
          <span className="chart-legend__key chart-legend__key--forecast" aria-hidden="true" />
          Прогноз модели
        </span>
      </figcaption>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT_PX}>
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="key"
            ticks={dayTicks(points)}
            tickFormatter={tickLabel}
            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
          />
          <YAxis
            width={56}
            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatNumber(value)}
          />
          <Tooltip
            content={FactTooltip}
            cursor={{ stroke: CHART_COLORS.axis }}
            isAnimationActive={false}
          />
          <Line
            dataKey="actual"
            stroke={CHART_COLORS.compare}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="forecast"
            stroke={CHART_COLORS.forecast}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
