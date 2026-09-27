import { useState } from 'react';
import type { ActualItem, ForecastItem, Route } from '../api';
import { Panel } from '../components/Panel';
import { EvalDataView } from '../components/quality/EvalDataView';
import { FactVsForecastChart } from '../components/quality/FactVsForecastChart';
import { QualitySummary } from '../components/quality/QualitySummary';
import { RouteErrorChart } from '../components/quality/RouteErrorChart';
import { MAE_UNITS } from '../components/quality/units';
import { WapeSummary } from '../components/quality/WapeSummary';
import { EmptyState } from '../components/states/EmptyState';
import { QueryView } from '../components/states/QueryView';
import {
  QUALITY_CHART_FROM,
  QUALITY_CHART_TO,
  QUALITY_EVAL_FROM,
  QUALITY_EVAL_TO,
} from '../config/constants';
import { useFilters } from '../hooks/useFilters';
import { useModelQuality } from '../hooks/useModelQuality';
import { useRoutes } from '../hooks/useRoutes';
import { formatDate } from '../utils/dates';
import { hasNoItems } from '../utils/empty';
import { buildFactPoints, meanAbsoluteError } from '../utils/factVsForecast';
import { formatDecimal } from '../utils/format';
import { apiHorizon } from '../utils/horizon';
import { hasNoData } from '../utils/routes';
import { computeWape, formatWape } from '../utils/wape';

// Экран «Качество модели» (UI-10): главная метрика — WAPE-score организаторов, MAE и сравнение
// с базовой моделью — дополнительно
export function QualityPage() {
  const { horizon: viewHorizon } = useFilters();
  // Неделя и месяц — ошибка по дням, как у горизонта month
  const horizon = apiHorizon(viewHorizon);
  const qualityQuery = useModelQuality(horizon);
  const routesQuery = useRoutes();

  return (
    <div className="page">
      <h2 className="page__title">
        Проверка на {formatDate(QUALITY_EVAL_FROM)}–{formatDate(QUALITY_EVAL_TO)}{' '}
        <span className="muted">
          — данные, которые модель не видела
          {qualityQuery.data && ` · версия ${qualityQuery.data.model_version}`}
        </span>
      </h2>

      <Panel title="Точность по метрике организаторов (WAPE-score)">
        <EvalDataView>
          {(actuals, forecast) => <WapeSummary actuals={actuals} forecast={forecast} />}
        </EvalDataView>
      </Panel>

      <h3 className="page__subtitle">Дополнительно: MAE и сравнение с базовой моделью</h3>
      <QualitySummary />

      <div className="quality-grid">
        <Panel title={`Ошибка по маршрутам (MAE, ${MAE_UNITS[horizon]})`}>
          <QueryView query={qualityQuery}>
            {(quality) => <RouteErrorChart quality={quality} />}
          </QueryView>
        </Panel>
        {/* Важности факторов нет ни в БД, ни в контракте — ждём метод (ML-4 считает важность) */}
        <Panel title="Важность факторов">
          <EmptyState
            message="Важность факторов пока недоступна"
            hint="Появится, когда в API будет метод важности факторов модели"
          />
        </Panel>
      </div>

      <QueryView query={routesQuery} isEmpty={hasNoItems}>
        {(routes) => (
          <FactVsForecastPanel routes={routes.items.filter((route) => !hasNoData(route))} />
        )}
      </QueryView>
    </div>
  );
}

function FactVsForecastPanel({ routes }: { routes: Route[] }) {
  const [route, setRoute] = useState(routes[0]?.route ?? 1);

  return (
    <Panel
      title={`Факт и прогноз, маршрут ${route}, ${formatDate(QUALITY_CHART_FROM)}–${formatDate(QUALITY_CHART_TO)}`}
      actions={
        <select
          className="field"
          aria-label="Маршрут"
          value={route}
          onChange={(event) => setRoute(Number(event.target.value))}
        >
          {routes.map((item) => (
            <option key={item.route} value={item.route}>
              Маршрут {item.route}
            </option>
          ))}
        </select>
      }
    >
      <EvalDataView>
        {(actuals, forecast) => (
          <FactVsForecastContent route={route} actuals={actuals} forecast={forecast} />
        )}
      </EvalDataView>
    </Panel>
  );
}

function FactVsForecastContent({
  route,
  actuals,
  forecast,
}: {
  route: number;
  actuals: ActualItem[];
  forecast: ForecastItem[];
}) {
  // Из данных всего проверочного периода берём две недели одного маршрута
  const inChart = <T extends { route: number; date: string }>(item: T) =>
    item.route === route && item.date >= QUALITY_CHART_FROM && item.date <= QUALITY_CHART_TO;
  const routeActuals = actuals.filter(inChart);
  const routeForecast = forecast.filter(inChart);
  const points = buildFactPoints(QUALITY_CHART_FROM, QUALITY_CHART_TO, routeActuals, routeForecast);
  const mae = meanAbsoluteError(points);
  const wape = computeWape(routeActuals, routeForecast, () => false);

  return (
    <>
      <FactVsForecastChart points={points} />
      {mae !== null && (
        <p className="muted">
          За эти две недели: WAPE-score {formatWape(wape.hourly)}, MAE{' '}
          {formatDecimal(Math.round(mae * 10) / 10)} пасс./ч
        </p>
      )}
    </>
  );
}
