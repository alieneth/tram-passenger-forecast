import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { errorMessage, exportForecast, type Route } from '../api';
import { Panel } from '../components/Panel';
import { RouteLabel } from '../components/RouteLabel';
import { RouteMonthView } from '../components/month/RouteMonthView';
import { DayForecastPanel } from '../components/route/DayForecastPanel';
import { DaysHoursTable } from '../components/route/DaysHoursTable';
import { FactorContributions } from '../components/route/FactorContributions';
import { EmptyState } from '../components/states/EmptyState';
import { QueryView } from '../components/states/QueryView';
import { NEW_ROUTE_LABEL } from '../config/constants';
import { HOUR_INTERVALS } from '../config/intervals';
import { useFactors } from '../hooks/useFactors';
import { useFilters } from '../hooks/useFilters';
import { useMonthCalendar } from '../hooks/useMonthCalendar';
import { useRouteMonth } from '../hooks/useRouteMonth';
import { useRoutes } from '../hooks/useRoutes';
import { monthRange, monthTitle } from '../utils/dates';
import { saveFile } from '../utils/download';

// Экран «Маршрут» (UI-4): «дни × часы», прогноз дня с коридором, «Почему такой прогноз?»
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
  const { horizon, date, setDate } = useFilters();
  const [intervalId, setIntervalId] = useState(HOUR_INTERVALS[0]?.id ?? 'all');
  const [compareEnabled, setCompareEnabled] = useState(true);
  const interval = HOUR_INTERVALS.find((item) => item.id === intervalId) ?? HOUR_INTERVALS[0];
  const hours = interval?.hours ?? [];

  const monthQuery = useRouteMonth(route.route, date);
  const calendar = useMonthCalendar(date);
  const factorsQuery = useFactors(date, route.route);
  const download = useMutation({
    // Срез: «День» — по часам за дату, «Месяц» — по дням за месяц
    mutationFn: () =>
      exportForecast({
        format: 'csv',
        route: [route.route],
        horizon,
        ...(horizon === 'day' ? { date_from: date, date_to: date } : monthRange(date)),
      }),
    onSuccess: ({ blob, filename }) => saveFile(blob, filename),
  });

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
        {horizon === 'day' && (
          <>
            <label className="toolbar__field">
              <span className="header__label">Интервал</span>
              <select
                className="field"
                value={intervalId}
                onChange={(event) => setIntervalId(event.target.value)}
              >
                {HOUR_INTERVALS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="toolbar__field">
              <span className="header__label">Сравнить с</span>
              <select
                className="field"
                value={compareEnabled ? 'week' : 'none'}
                onChange={(event) => setCompareEnabled(event.target.value === 'week')}
              >
                <option value="week">неделю назад</option>
                <option value="none">без сравнения</option>
              </select>
            </label>
          </>
        )}
        <div className="toolbar__actions">
          <button
            type="button"
            className="button"
            disabled={download.isPending}
            onClick={() => download.mutate()}
          >
            {download.isPending ? 'Готовим файл…' : 'Скачать срез'}
          </button>
          <Link className="button button--primary" to={`/decisions?route=${route.route}`}>
            Открыть решения
          </Link>
        </div>
      </div>
      {download.isError && <p className="text-up">{errorMessage(download.error)}</p>}

      <div className="route-title">
        <RouteLabel route={route} showName />
        {route.depot_name && <span className="muted">Депо: {route.depot_name}</span>}
      </div>
      {route.is_new && (
        <div className="notice notice--warning" role="note">
          Истории поездок по маршруту нет — прогноз построен по похожим маршрутам, поэтому коридор
          уверенности шире.
        </div>
      )}

      {horizon === 'month' ? (
        <RouteMonthView route={route} />
      ) : (
        <div className="route-grid">
          <Panel title={`Дни × часы, ${monthTitle(date)}`}>
            <QueryView query={monthQuery} emptyHint="Выберите дату в ноябре–декабре 2025">
              {(forecast) => (
                <DaysHoursTable
                  items={forecast.items}
                  calendar={calendar}
                  selectedDate={date}
                  hours={hours}
                  onSelectDate={setDate}
                />
              )}
            </QueryView>
          </Panel>

          <div className="route-grid__side">
            <QueryView query={monthQuery} emptyHint="Выберите дату в ноябре–декабре 2025">
              {(forecast) => (
                <DayForecastPanel
                  route={route.route}
                  date={date}
                  items={forecast.items.filter((item) => item.date === date)}
                  hours={hours}
                  compareEnabled={compareEnabled}
                />
              )}
            </QueryView>

            <Panel title="Почему такой прогноз?">
              <QueryView query={factorsQuery}>
                {(factors) =>
                  factors.contributions?.length ? (
                    <FactorContributions contributions={factors.contributions} />
                  ) : (
                    <p className="muted">Вклад факторов для этой даты не рассчитан</p>
                  )
                }
              </QueryView>
            </Panel>

            {/* Доли проездных, льготных и пересадок с метро — метод API-7 (волна 2), в контракте его пока нет */}
            <Panel title={`Показатели маршрута ${route.route}`}>
              <EmptyState
                message="Показатели маршрута пока недоступны"
                hint="Доли проездных, льготных карт и пересадок с метро появятся с методом API-7"
              />
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
