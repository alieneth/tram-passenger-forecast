import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { dailyTicks, type DailyPoint } from '../../utils/dailyChart';
import { formatDate, formatDayMonth, formatDayMonthShort, weekdayShort } from '../../utils/dates';
import { dayMark } from '../../utils/dayType';
import { formatNumber, formatThousands } from '../../utils/format';
import { CHART_COLORS } from '../route/chartColors';

const CHART_HEIGHT_PX = 260;

interface DailyChartProps {
  points: DailyPoint[];
  forecastStart: string;
  // Выбранный месяц — подсвечиваем на оси
  monthFrom: string;
  monthTo: string;
  hasActuals: boolean;
}

function DailyTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = payload?.[0]?.payload as DailyPoint | undefined;
  if (!active || !point) return null;
  const mark = dayMark(point.factors);
  return (
    <div className="chart-tooltip">
      <strong>
        {formatDate(point.date)}, {weekdayShort(point.date)}
        {mark ? ` · ${mark}` : ''}
      </strong>
      <dl className="map-tooltip__grid">
        {point.actual !== null && (
          <>
            <dt>факт</dt>
            <dd>{formatNumber(point.actual)} пасс.</dd>
          </>
        )}
        {point.item && (
          <>
            <dt>прогноз</dt>
            <dd>{formatNumber(point.item.prediction)} пасс.</dd>
            <dt>коридор</dt>
            <dd>
              {formatNumber(point.item.lower)} – {formatNumber(point.item.upper)}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

// «Пассажиров в день»: факт сентября–октября и прогноз ноября–декабря с коридором
export function DailyChart({
  points,
  forecastStart,
  monthFrom,
  monthTo,
  hasActuals,
}: DailyChartProps) {
  return (
    <figure className="chart">
      <figcaption className="chart-legend">
        {hasActuals && (
          <span className="chart-legend__item">
            <span className="chart-legend__key chart-legend__key--compare" aria-hidden="true" />
            Факт сентябрь–октябрь
          </span>
        )}
        <span className="chart-legend__item">
          <span className="chart-legend__key chart-legend__key--forecast" aria-hidden="true" />
          Прогноз
        </span>
        <span className="chart-legend__item">
          <span className="chart-legend__key chart-legend__key--corridor" aria-hidden="true" />
          Коридор прогноза
        </span>
      </figcaption>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT_PX}>
        <ComposedChart data={points} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <ReferenceArea x1={monthFrom} x2={monthTo} fill="#60a5fa" fillOpacity={0.06} />
          <XAxis
            dataKey="date"
            ticks={dailyTicks(points)}
            tickFormatter={formatDayMonthShort}
            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
          />
          <YAxis
            width={64}
            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatThousands(value)}
          />
          <Tooltip
            content={DailyTooltip}
            cursor={{ stroke: CHART_COLORS.axis, strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <ReferenceLine
            x={forecastStart}
            stroke={CHART_COLORS.axis}
            strokeDasharray="4 4"
            label={{
              value: `${formatDayMonth(forecastStart)} — начало прогноза`,
              position: 'top',
              fill: CHART_COLORS.axis,
              fontSize: 12,
            }}
          />
          <Area
            dataKey="corridor"
            stroke="none"
            fill={CHART_COLORS.corridor}
            fillOpacity={0.18}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            dataKey="actual"
            stroke={CHART_COLORS.compare}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="forecast"
            stroke={CHART_COLORS.forecast}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: '#0b1a2c', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}
