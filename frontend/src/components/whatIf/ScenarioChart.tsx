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
import { PASSENGERS_PER_TRAM_NORM } from '../../config/constants';
import { formatDecimal, formatHourTime } from '../../utils/format';
import { plural } from '../../utils/plural';
import type { Corrections, ScenarioPoint } from '../../utils/scenario';
import { CHART_COLORS } from '../route/chartColors';

const CHART_HEIGHT_PX = 300;
const AXIS_HEADROOM = 1.1;

function ScenarioTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = payload?.[0]?.payload as ScenarioPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="chart-tooltip">
      <strong>{formatHourTime(point.hour)}</strong>
      <dl className="map-tooltip__grid">
        <dt>прогноз</dt>
        <dd>
          {formatDecimal(point.baseline)} на трамвай · {point.trams} тр.
        </dd>
        <dt>сценарий</dt>
        <dd>
          {point.scenario === null
            ? 'трамваев не остаётся'
            : `${formatDecimal(point.scenario)} на трамвай · ${point.tramsAfter} тр.`}
        </dd>
        <dt>для нормы</dt>
        <dd>{point.tramsForNorm} тр.</dd>
      </dl>
    </div>
  );
}

// «Исходный прогноз и сценарий»: пассажиров на трамвай по часам с нормой и коридором сценария
const CORRECTION_NAMES = { weather: 'погода', event: 'событие', season: 'сезон' } as const;

// «+1 выход, погода +10%» — что именно изменено в сценарии
function scenarioLabel(tramsDelta: number, correctionsPct: Record<keyof Corrections, number>) {
  const parts: string[] = [];
  if (tramsDelta !== 0) {
    parts.push(
      `${tramsDelta > 0 ? '+' : ''}${tramsDelta} ${plural(tramsDelta, ['выход', 'выхода', 'выходов'])}`,
    );
  }
  for (const key of Object.keys(CORRECTION_NAMES) as (keyof Corrections)[]) {
    const pct = correctionsPct[key];
    if (pct !== 0) parts.push(`${CORRECTION_NAMES[key]} ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`);
  }
  return parts.length ? `Сценарий (${parts.join(', ')})` : 'Сценарий (без изменений)';
}

export function ScenarioChart({
  points,
  tramsDelta,
  correctionsPct,
}: {
  points: ScenarioPoint[];
  tramsDelta: number;
  correctionsPct: Record<keyof Corrections, number>;
}) {
  const changed = points.filter((point) => point.inScenario);
  const partial = changed.length > 0 && changed.length < points.length;
  const yMax = (dataMax: number) =>
    Math.ceil(Math.max(dataMax, PASSENGERS_PER_TRAM_NORM) * AXIS_HEADROOM);

  return (
    <figure className="chart">
      <figcaption className="chart-legend">
        <span className="chart-legend__item">
          <span className="chart-legend__key chart-legend__key--compare" aria-hidden="true" />
          Исходный прогноз
        </span>
        <span className="chart-legend__item">
          <span className="chart-legend__key chart-legend__key--forecast" aria-hidden="true" />
          {scenarioLabel(tramsDelta, correctionsPct)}
        </span>
        <span className="chart-legend__item">
          <span className="chart-legend__key chart-legend__key--corridor" aria-hidden="true" />
          Коридор сценария
        </span>
        <span className="chart-legend__item">
          <span className="chart-legend__key chart-legend__key--norm" aria-hidden="true" />
          Норма {PASSENGERS_PER_TRAM_NORM}
        </span>
      </figcaption>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT_PX}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          {partial && (
            <ReferenceArea
              x1={changed[0]?.label}
              x2={changed.at(-1)?.label}
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
            width={44}
            domain={[0, yMax]}
            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={ScenarioTooltip}
            cursor={{ stroke: CHART_COLORS.axis }}
            isAnimationActive={false}
          />
          <Area
            dataKey="corridor"
            stroke="none"
            fill={CHART_COLORS.corridor}
            fillOpacity={0.15}
            isAnimationActive={false}
            activeDot={false}
          />
          <ReferenceLine
            y={PASSENGERS_PER_TRAM_NORM}
            stroke={CHART_COLORS.norm}
            strokeDasharray="6 4"
          />
          <Line
            dataKey="baseline"
            stroke={CHART_COLORS.compare}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="scenario"
            stroke={CHART_COLORS.forecast}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.forecast, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}
