import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { ModelQuality } from '../../api';
import { formatDecimal } from '../../utils/format';
import { isNoDataRoute } from '../../utils/routes';
import { CHART_COLORS } from '../route/chartColors';
import { MAE_UNITS } from './units';

const CHART_HEIGHT_PX = 260;
const BAR_SIZE_PX = 14;
// «Наша модель» — акцент, базовая — приглушённый: сравнение, а не интенсивность
const MODEL_COLOR = '#3b82f6';
const BASELINE_COLOR = '#94a3b8';

type RouteRow = ModelQuality['by_route'][number];

interface ChartRow {
  label: string;
  row: RouteRow;
  model: number;
  baseline: number;
}

function RowTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const data = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !data) return null;
  const { row } = data;
  return (
    <div className="chart-tooltip">
      <strong>Маршрут {row.route}</strong>
      <dl className="map-tooltip__grid">
        <dt>наша модель</dt>
        <dd>{formatDecimal(row.model_mae)}</dd>
        <dt>базовая</dt>
        <dd>{formatDecimal(row.baseline_mae)}</dd>
        {row.improvement_pct != null && (
          <>
            <dt>лучше на</dt>
            <dd>{row.improvement_pct}%</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// «Ошибка по маршрутам»: MAE нашей и базовой модели по каждому маршруту с историей
export function RouteErrorChart({ quality }: { quality: ModelQuality }) {
  // Маршрут 5 исключён организаторами, а без факта сравнивать не с чем — только маршруты с историей
  const rows: ChartRow[] = quality.by_route
    .filter((row) => row.method === 'model' && !isNoDataRoute(row.route))
    .map((row) => ({
      label: String(row.route),
      row,
      model: row.model_mae,
      baseline: row.baseline_mae,
    }));

  return (
    <figure className="chart">
      <figcaption className="chart-legend">
        <span className="chart-legend__item">
          <span
            className="chart-legend__swatch"
            style={{ background: MODEL_COLOR }}
            aria-hidden="true"
          />
          Наша модель
        </span>
        <span className="chart-legend__item">
          <span
            className="chart-legend__swatch"
            style={{ background: BASELINE_COLOR }}
            aria-hidden="true"
          />
          Базовая: среднее за тот же час и день недели
        </span>
      </figcaption>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT_PX}>
        <BarChart data={rows} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
          />
          <YAxis
            width={48}
            tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            label={{
              value: `MAE, ${MAE_UNITS[quality.horizon]}`,
              angle: -90,
              position: 'insideLeft',
              fill: CHART_COLORS.axis,
              fontSize: 12,
            }}
          />
          <Tooltip
            content={RowTooltip}
            cursor={{ fill: 'rgb(255 255 255 / 0.04)' }}
            isAnimationActive={false}
          />
          <Bar
            dataKey="model"
            fill={MODEL_COLOR}
            barSize={BAR_SIZE_PX}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="baseline"
            fill={BASELINE_COLOR}
            barSize={BAR_SIZE_PX}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
