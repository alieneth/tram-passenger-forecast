import type { ActualItem, ForecastItem } from '../../api';
import { NO_DATA_LABEL, NO_DATA_ROUTES, WAPE_SCORE_TARGET } from '../../config/constants';
import { formatThousands } from '../../utils/format';
import { isNoDataRoute } from '../../utils/routes';
import { computeWape, formatWape, type WapeRoute } from '../../utils/wape';
import { EmptyState } from '../states/EmptyState';

const PERCENT = 100;

function scoreClass(score: number | null): string {
  if (score === null) return '';
  return score >= WAPE_SCORE_TARGET ? 'wape--good' : 'wape--bad';
}

function RouteBar({ row }: { row: WapeRoute }) {
  const width = `${Math.round((row.score ?? 0) * PERCENT)}%`;
  return (
    <li className="wape-routes__row">
      <span className="wape-routes__route">{row.route}</span>
      <span className="wape-routes__track" aria-hidden="true">
        <span className={`wape-routes__bar ${scoreClass(row.score)}`} style={{ width }} />
        <span className="wape-routes__target" style={{ left: `${WAPE_SCORE_TARGET * PERCENT}%` }} />
      </span>
      <strong className={scoreClass(row.score)}>{formatWape(row.score)}</strong>
      <span className="muted wape-routes__total">{formatThousands(row.actualTotal)} пасс.</span>
    </li>
  );
}

// Главная метрика организаторов — WAPE-score. В API её нет: считаем здесь из факта и прогноза
// модели на сентябре–октябре. Маршрут 5 исключён организаторами — в расчёт не входит
export function WapeSummary({
  actuals,
  forecast,
}: {
  actuals: ActualItem[];
  forecast: ForecastItem[];
}) {
  const wape = computeWape(actuals, forecast, isNoDataRoute);
  if (wape.pairs === 0) {
    return (
      <EmptyState
        message="Не с чем сравнить: нет часов, где есть и факт, и прогноз"
        hint="Нужен прогноз модели на сентябрь–октябрь 2025"
      />
    );
  }
  const passed = wape.hourly !== null && wape.hourly >= WAPE_SCORE_TARGET;

  return (
    <div className="wape">
      <div className="wape__main">
        <dl className="wape__values">
          <div>
            <dt>WAPE-score по часам</dt>
            <dd>
              <strong className={`wape__score ${scoreClass(wape.hourly)}`}>
                {formatWape(wape.hourly)}
              </strong>
            </dd>
          </div>
          <div>
            <dt>по дням (неделя, месяц)</dt>
            <dd>
              <strong className={scoreClass(wape.daily)}>{formatWape(wape.daily)}</strong>
            </dd>
          </div>
        </dl>
        <p className={passed ? 'wape__verdict wape--good' : 'wape__verdict wape--bad'}>
          {passed
            ? `Выше ${formatWape(WAPE_SCORE_TARGET)} — максимум баллов за точность`
            : `Ниже порога ${formatWape(WAPE_SCORE_TARGET)} — до максимума баллов не хватает`}
        </p>
        <p className="muted">
          WAPE-score = max(0, 1 − Σ|факт − прогноз| / Σ факт) — чем ближе к 1, тем точнее. Как у
          организаторов, по каждому часу; сравнили {wape.pairs.toLocaleString('ru-RU')} часов.
          Маршрут {NO_DATA_ROUTES.join(', ')} исключён организаторами — нет данных.
        </p>
      </div>
      <ul className="wape-routes" aria-label="WAPE-score по маршрутам">
        {wape.byRoute.map((row) => (
          <RouteBar key={row.route} row={row} />
        ))}
        {NO_DATA_ROUTES.map((route) => (
          <li key={route} className="wape-routes__row wape-routes__row--no-data">
            <span className="wape-routes__route">{route}</span>
            <span className="wape-routes__track" aria-hidden="true" />
            <span className="muted">{NO_DATA_LABEL}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
