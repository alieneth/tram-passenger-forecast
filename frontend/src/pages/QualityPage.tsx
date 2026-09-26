import { useState } from 'react';
import { errorMessage, isEmptyDataError, type Route } from '../api';
import { Panel } from '../components/Panel';
import { FactVsForecastChart } from '../components/quality/FactVsForecastChart';
import { QualitySummary } from '../components/quality/QualitySummary';
import { RouteErrorChart } from '../components/quality/RouteErrorChart';
import { MAE_UNITS } from '../components/quality/units';
import { EmptyState } from '../components/states/EmptyState';
import { ErrorState } from '../components/states/ErrorState';
import { LoadingState } from '../components/states/LoadingState';
import { QueryView } from '../components/states/QueryView';
import { QUALITY_CHART_FROM, QUALITY_CHART_TO } from '../config/constants';
import { useFactVsForecast } from '../hooks/useFactVsForecast';
import { useFilters } from '../hooks/useFilters';
import { useModelQuality } from '../hooks/useModelQuality';
import { useRoutes } from '../hooks/useRoutes';
import { formatDate } from '../utils/dates';
import { hasNoItems } from '../utils/empty';
import { buildFactPoints, meanAbsoluteError } from '../utils/factVsForecast';
import { formatDecimal } from '../utils/format';

// Экран «Качество модели» (UI-10): доказательство, что модель точнее базовой
export function QualityPage() {
  const { horizon } = useFilters();
  const qualityQuery = useModelQuality(horizon);
  const routesQuery = useRoutes();

  return (
    <div className="page">
      <QueryView query={qualityQuery}>
        {(quality) => (
          <h2 className="page__title">
            Проверка на {formatDate(quality.eval_date_from)}–{formatDate(quality.eval_date_to)}{' '}
            <span className="muted">
              — данные, которые модель не видела · версия {quality.model_version}
            </span>
          </h2>
        )}
      </QueryView>
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
        {(routes) => <FactVsForecastPanel routes={routes.items.filter((route) => !route.is_new)} />}
      </QueryView>
    </div>
  );
}

function FactVsForecastPanel({ routes }: { routes: Route[] }) {
  const [route, setRoute] = useState(routes[0]?.route ?? 1);
  const [actualsQuery, forecastQuery] = useFactVsForecast(
    route,
    QUALITY_CHART_FROM,
    QUALITY_CHART_TO,
  );
  const failed = [actualsQuery, forecastQuery].find((query) => query.isError);

  let content;
  if (actualsQuery.isPending || forecastQuery.isPending) {
    content = <LoadingState />;
  } else if (failed?.error) {
    content = isEmptyDataError(failed.error) ? (
      <EmptyState
        message={failed.error.message}
        hint="Для графика нужен прогноз модели на проверочный период (сентябрь–октябрь)"
      />
    ) : (
      <ErrorState message={errorMessage(failed.error)} error={failed.error} />
    );
  } else {
    const points = buildFactPoints(
      QUALITY_CHART_FROM,
      QUALITY_CHART_TO,
      actualsQuery.data?.items ?? [],
      forecastQuery.data?.items ?? [],
    );
    const mae = meanAbsoluteError(points);
    content = (
      <>
        <FactVsForecastChart points={points} />
        {mae !== null && (
          <p className="muted">
            MAE за эти две недели: {formatDecimal(Math.round(mae * 10) / 10)} пасс./ч
          </p>
        )}
      </>
    );
  }

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
      {content}
    </Panel>
  );
}
