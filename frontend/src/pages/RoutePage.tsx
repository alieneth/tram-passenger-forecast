import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { errorMessage, exportForecast, type Route } from '../api';
import { Panel } from '../components/Panel';
import { RouteLabel } from '../components/RouteLabel';
import { RouteMonthView } from '../components/month/RouteMonthView';
import { DayForecastPanel } from '../components/route/DayForecastPanel';
import { RouteWeekView } from '../components/week/RouteWeekView';
import { DaysHoursTable } from '../components/route/DaysHoursTable';
import { FactorContributions } from '../components/route/FactorContributions';
import { EmptyState } from '../components/states/EmptyState';
import { NoDataRouteState } from '../components/states/NoDataRouteState';
import { QueryView } from '../components/states/QueryView';
import { NO_DATA_LABEL } from '../config/constants';
import { HOUR_INTERVALS } from '../config/intervals';
import { useFactors } from '../hooks/useFactors';
import { useFilters } from '../hooks/useFilters';
import { useMonthCalendar } from '../hooks/useMonthCalendar';
import { useRouteMonth } from '../hooks/useRouteMonth';
import { useRoutes } from '../hooks/useRoutes';
import { monthTitle } from '../utils/dates';
import { saveFile } from '../utils/download';
import { hasNoItems } from '../utils/empty';
import { apiHorizon, periodFor } from '../utils/horizon';
import { hasNoData } from '../utils/routes';

// Экран «Маршрут» (UI-4): «дни × часы», прогноз дня с коридором, «Почему такой прогноз?»
export function RoutePage() {
  const routesQuery = useRoutes();
  const params = useParams();

  return (
    <QueryView
      query={routesQuery}
      isEmpty={hasNoItems}
      emptyMessage="Справочник маршрутов пуст"
      emptyHint="Маршруты появятся, когда бэкенд загрузит справочник"
    >
      {(routes) => {
        const first = routes.items[0];
        // Без номера в адресе — открываем первый маршрут
        if (params.route === undefined) {
          return first ? <Navigate to={`/route/${first.route}`} replace /> : null;
        }
        const route = routes.items.find((item) => String(item.route) === params.route);
        // Неизвестный номер — говорим об этом прямо, а не подменяем другим маршрутом
        if (!route) return <UnknownRoute route={params.route} first={first?.route} />;
        return <RouteDetails route={route} routes={routes.items} />;
      }}
    </QueryView>
  );
}

function UnknownRoute({ route, first }: { route: string; first: number | undefined }) {
  return (
    <div className="page">
      <EmptyState
        message={`Маршрут ${route} не найден`}
        hint="Маршруты проекта: 1, 5, 7, 11, 12, 17, 25, 26, 28, 50"
      />
      {first !== undefined && (
        <Link className="button" to={`/route/${first}`}>
          Открыть маршрут {first}
        </Link>
      )}
    </div>
  );
}

function RouteDetails({ route, routes }: { route: Route; routes: Route[] }) {
  const navigate = useNavigate();
  const { horizon, date, setDate, setRoute } = useFilters();
  // Открытый маршрут — общий контекст: на Обзоре, в Решениях и «Что если» он останется выбранным
  useEffect(() => setRoute(route.route), [route.route, setRoute]);
  const [intervalId, setIntervalId] = useState(HOUR_INTERVALS[0]?.id ?? 'all');
  const [compareEnabled, setCompareEnabled] = useState(true);
  const interval = HOUR_INTERVALS.find((item) => item.id === intervalId) ?? HOUR_INTERVALS[0];
  const hours = interval?.hours ?? [];
  const noData = hasNoData(route);

  const monthQuery = useRouteMonth(route.route, date);
  const calendar = useMonthCalendar(date);
  const factorsQuery = useFactors(date, route.route);
  const download = useMutation({
    // Срез: «День» — по часам за дату, «Неделя» и «Месяц» — по дням за период
    mutationFn: () =>
      exportForecast({
        format: 'csv',
        route: [route.route],
        horizon: apiHorizon(horizon),
        ...periodFor(horizon, date),
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
                {hasNoData(item) ? ` — ${NO_DATA_LABEL}` : ''}
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
      {noData && <NoDataRouteState route={route.route} />}

      {!noData && horizon === 'month' && <RouteMonthView route={route} />}
      {!noData && horizon === 'week' && (
        <Panel title={`Маршрут ${route.route} · неделя по дням`}>
          <RouteWeekView route={route} />
        </Panel>
      )}
      {!noData && horizon === 'day' && (
        <div className="route-grid">
          <Panel title={`Дни × часы, ${monthTitle(date)}`}>
            <QueryView
              query={monthQuery}
              isEmpty={hasNoItems}
              emptyHint="Выберите дату в ноябре–декабре 2025"
            >
              {(forecast) => (
                <DaysHoursTable
                  items={forecast.items}
                  calendar={calendar.days}
                  selectedDate={date}
                  hours={hours}
                  onSelectDate={setDate}
                />
              )}
            </QueryView>
            {calendar.error !== null && (
              <p className="muted">
                Типы дней (выходные, праздники) не загрузились: {errorMessage(calendar.error)}
              </p>
            )}
          </Panel>

          <div className="route-grid__side">
            <QueryView
              query={monthQuery}
              isEmpty={hasNoItems}
              emptyHint="Выберите дату в ноябре–декабре 2025"
            >
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
