import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { PASSENGERS_PER_TRAM_NORM } from '../../config/constants';
import { maxLoad, type LoadPoint } from '../../utils/beforeAfter';
import { formatDecimal, formatHourTime } from '../../utils/format';
import { CHART_COLORS } from '../route/chartColors';

const CHART_HEIGHT_PX = 200;
const BAR_SIZE_PX = 10;
// Линия нормы должна быть видна всегда — даже у донора, где загрузка далеко ниже нормы
const AXIS_HEADROOM = 1.1;
const yDomain: [number, (dataMax: number) => number] = [
  0,
  (dataMax) => Math.ceil(Math.max(dataMax, PASSENGERS_PER_TRAM_NORM) * AXIS_HEADROOM),
];
// «До» — приглушённый, «После» — акцентный: смысл «было / стало», а не интенсивность
const BEFORE_COLOR = '#94a3b8';
const AFTER_COLOR = '#3b82f6';

function LoadTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = payload?.[0]?.payload as LoadPoint | undefined;
  if (!active || !point) return null;
  const format = (value: number | null) => (value === null ? '—' : formatDecimal(value));
  return (
    <div className="chart-tooltip">
      <strong>
        {formatHourTime(point.hour)}
        {point.inInterval ? ' · интервал решения' : ''}
      </strong>
      <dl className="map-tooltip__grid">
        <dt>до</dt>
        <dd>{format(point.before)} на трамвай</dd>
        {point.inInterval && (
          <>
            <dt>после</dt>
            <dd>{format(point.after)} на трамвай</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// «До / после» решения: пассажиров на трамвай по часам с линией нормы и интервалом решения
export function BeforeAfterChart({ title, points }: { title: string; points: LoadPoint[] }) {
  const inInterval = points.filter((point) => point.inInterval);
  const before = maxLoad(inInterval, 'before');
  const after = maxLoad(inInterval, 'after');

  return (
    <figure className="chart before-after">
      <figcaption className="chart-legend">
        <strong className="before-after__title">{title}</strong>
        <span className="chart-legend__item">
          <span
            className="chart-legend__swatch"
            style={{ background: BEFORE_COLOR }}
            aria-hidden="true"
          />
          До{before === null ? '' : ` (${formatDecimal(before)})`}
        </span>
        <span className="chart-legend__item">
          <span
            className="chart-legend__swatch"
            style={{ background: AFTER_COLOR }}
            aria-hidden="true"
          />
          После{after === null ? '' : ` (${formatDecimal(after)})`}
        </span>
        <span className="chart-legend__item">
          <span className="chart-legend__key chart-legend__key--norm" aria-hidden="true" />
          Норма {PASSENGERS_PER_TRAM_NORM}
        </span>
      </figcaption>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT_PX}>
        <BarChart data={points} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          {inInterval.length > 0 && (
            <ReferenceArea
              x1={inInterval[0]?.label}
              x2={inInterval.at(-1)?.label}
              fill="#60a5fa"
              fillOpacity={0.08}
            />
          )}
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
          />
          <YAxis
            width={40}
            domain={yDomain}
            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={LoadTooltip}
            cursor={{ fill: 'rgb(255 255 255 / 0.04)' }}
            isAnimationActive={false}
          />
          <ReferenceLine
            y={PASSENGERS_PER_TRAM_NORM}
            stroke={CHART_COLORS.norm}
            strokeDasharray="6 4"
          />
          <Bar
            dataKey="before"
            fill={BEFORE_COLOR}
            barSize={BAR_SIZE_PX}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="after"
            fill={AFTER_COLOR}
            barSize={BAR_SIZE_PX}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
