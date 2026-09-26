import { Navigate, useNavigate, useParams } from 'react-router';
import type { ForecastItem, Route } from '../api';
import { Panel } from '../components/Panel';
import { RouteLabel } from '../components/RouteLabel';
import { QueryView } from '../components/states/QueryView';
import { DISPLAY_HOURS, NEW_ROUTE_LABEL, PASSENGERS_PER_TRAM_NORM } from '../config/constants';
import { useFactors } from '../hooks/useFactors';
import { useFilters } from '../hooks/useFilters';
import { useForecast } from '../hooks/useForecast';
import { useRoutes } from '../hooks/useRoutes';
import { formatDate, monthTitle } from '../utils/dates';
import { isOverNorm } from '../utils/forecast';
import { formatDecimal, formatHourTime, formatNumber } from '../utils/format';

// Каркас экрана «Маршрут» (UI-4) и горизонта «Месяц» (UI-5): выбор маршрута и прогноз по часам
export function RoutePage() {
  const routesQuery = useRoutes();
  const params = useParams();

  return (
    <QueryView query={routesQuery}>
      {(routes) => {
        const route = routes.items.find((item) => String(item.route) === params.route);
        if (!route) {
          const first = routes.items[0];
          return first ? <Navigate to={`/route/${first.route}`} replace /> : null;
        }
        return <RouteDetails route={route} routes={routes.items} />;
      }}
    </QueryView>
  );
}

function RouteDetails({ route, routes }: { route: Route; routes: Route[] }) {
  const navigate = useNavigate();
  const { horizon, date } = useFilters();
  const forecastQuery = useForecast([route.route]);
  const factorsQuery = useFactors(date, route.route);

  return (
    <div className="page">
      <div className="toolbar">
        <label className="toolbar__field">
          <span className="header__label">Маршрут</span>
          <select
            className="field"
            value={route.route}
            onChange={(event) => navigate(`/route/${event.target.value}`)}
          >
            {routes.map((item) => (
              <option key={item.route} value={item.route}>
                Маршрут {item.route}
                {item.is_new ? ` — ${NEW_ROUTE_LABEL}` : ''}
              </option>
            ))}
          </select>
        </label>
        <RouteLabel route={route} showName />
      </div>

      <Panel
        title={
          horizon === 'day'
            ? `Прогноз по часам на ${formatDate(date)}`
            : `Маршрут ${route.route}: прогноз по дням, ${monthTitle(date)}`
        }
      >
        <QueryView query={forecastQuery} emptyHint="Выберите другую дату или горизонт «День»">
          {(forecast) => <HourlyTable items={forecast.items} />}
        </QueryView>
      </Panel>

      <Panel title="Почему такой прогноз?">
        <QueryView query={factorsQuery}>
          {(factors) =>
            factors.contributions?.length ? (
              <ul className="list">
                {factors.contributions.map((factor) => (
                  <li key={factor.factor_code} className="list__item">
                    <span>{factor.factor_name}</span>
                    <span className={factor.effect_pct >= 0 ? 'text-up' : 'text-down'}>
                      {factor.effect_pct > 0 ? '+' : ''}
                      {formatDecimal(factor.effect_pct)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Вклад факторов для этой даты не рассчитан</p>
            )
          }
        </QueryView>
      </Panel>
    </div>
  );
}

// Временная таблица вместо графика с коридором (UI-4): те же поля, что придут в график
function HourlyTable({ items }: { items: ForecastItem[] }) {
  const byHour = new Map(items.map((item) => [item.hour, item]));
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Час</th>
          <th>Пассажиров в час</th>
          <th>Коридор</th>
          <th>Трамваев</th>
          <th>Пассажиров на трамвай (норма {PASSENGERS_PER_TRAM_NORM})</th>
        </tr>
      </thead>
      <tbody>
        {DISPLAY_HOURS.map((hour) => {
          const item = byHour.get(hour);
          if (!item) {
            return (
              <tr key={hour}>
                <td>{formatHourTime(hour)}</td>
                <td colSpan={4} className="muted">
                  Нет прогноза на этот час
                </td>
              </tr>
            );
          }
          return (
            <tr key={hour} className={isOverNorm(item) ? 'data-table__row--alert' : undefined}>
              <td>{formatHourTime(hour)}</td>
              <td>{formatNumber(item.prediction)}</td>
              <td>
                {formatNumber(item.lower)}–{formatNumber(item.upper)}
              </td>
              <td>{item.trams_on_line ?? '—'}</td>
              <td>
                {item.passengers_per_tram === null || item.passengers_per_tram === undefined
                  ? '—'
                  : formatDecimal(item.passengers_per_tram)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
