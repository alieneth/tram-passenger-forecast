import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { PASSENGERS_PER_TRAM_NORM } from '../../config/constants';
import type { ChartPoint } from '../../utils/routeChart';
import { formatDecimal, formatHourTime, formatNumber } from '../../utils/format';
import { CHART_COLORS } from './chartColors';

const CHART_HEIGHT_PX = 280;

interface HourlyChartProps {
  points: ChartPoint[];
  compareLabel: string | null;
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !point) return null;
  const { item } = point;
  return (
    <div className="chart-tooltip">
      <strong>{formatHourTime(point.hour)}</strong>
      <dl className="map-tooltip__grid">
        <dt>прогноз</dt>
        <dd>{formatNumber(item.prediction)} пасс./ч</dd>
        <dt>коридор</dt>
        <dd>
          {formatNumber(item.lower)} – {formatNumber(item.upper)}
        </dd>
        <dt>трамваев</dt>
        <dd>{item.trams_on_line ?? '—'}</dd>
        <dt>на трамвай</dt>
        <dd>
          {item.passengers_per_tram === null || item.passengers_per_tram === undefined
            ? '—'
            : formatDecimal(item.passengers_per_tram)}
        </dd>
        {point.compare !== null && (
          <>
            <dt>неделю назад</dt>
            <dd>{formatNumber(point.compare)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function LegendKey({ className, label }: { className: string; label: string }) {
  return (
    <span className="chart-legend__item">
      <span className={`chart-legend__key ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

// Прогноз по часам с коридором, сравнением «неделю назад» и порогом нормы
export function HourlyChart({ points, compareLabel }: HourlyChartProps) {
  const hasOverNorm = points.some(
    (point) => point.threshold !== null && point.prediction > point.threshold,
  );
  return (
    <figure className="chart">
      <figcaption className="chart-legend">
        <LegendKey className="chart-legend__key--forecast" label="Прогноз" />
        <LegendKey className="chart-legend__key--corridor" label="Коридор уверенности" />
        {compareLabel && <LegendKey className="chart-legend__key--compare" label={compareLabel} />}
        <LegendKey
          className="chart-legend__key--norm"
          label={`Норма: ${PASSENGERS_PER_TRAM_NORM} на трамвай × трамваев на линии`}
        />
        {hasOverNorm && <LegendKey className="chart-legend__key--over" label="Выше нормы" />}
      </figcaption>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT_PX}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="label"
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
            content={ChartTooltip}
            cursor={{ stroke: CHART_COLORS.axis, strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Area
            dataKey="corridor"
            stroke="none"
            fill={CHART_COLORS.corridor}
            fillOpacity={0.18}
            isAnimationActive={false}
            activeDot={false}
          />
          <Area
            dataKey="overNorm"
            stroke="none"
            fill={CHART_COLORS.overNorm}
            fillOpacity={0.45}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            dataKey="threshold"
            stroke={CHART_COLORS.norm}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          {compareLabel && (
            <Line
              dataKey="compare"
              stroke={CHART_COLORS.compare}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          )}
          <Line
            dataKey="prediction"
            stroke={CHART_COLORS.forecast}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.forecast, strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: '#0b1a2c', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}
