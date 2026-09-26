import type { Route } from '../../api';
import { FORECAST_DATE_MIN, MONTH_CHART_ACTUALS_FROM } from '../../config/constants';
import { useFilters } from '../../hooks/useFilters';
import { useMonthCalendar } from '../../hooks/useMonthCalendar';
import { useRouteDailyActuals, useRouteDailyForecast } from '../../hooks/useRouteDaily';
import { buildDailyPoints } from '../../utils/dailyChart';
import { monthRange, monthTitle } from '../../utils/dates';
import { formatThousands } from '../../utils/format';
import { monthTotals } from '../../utils/monthStats';
import { Panel } from '../Panel';
import { LoadingState } from '../states/LoadingState';
import { QueryView } from '../states/QueryView';
import { DailyChart } from './DailyChart';
import { MonthCalendar } from './MonthCalendar';
import { MonthFactors } from './MonthFactors';

// Горизонт «Месяц» на экране «Маршрут» (UI-5): календарь, график по дням, факторы месяца
export function RouteMonthView({ route }: { route: Route }) {
  const { date, setDate, setHorizon } = useFilters();
  const { date_from: monthFrom, date_to: monthTo } = monthRange(date);
  const forecastQuery = useRouteDailyForecast(route.route);
  const actualsQuery = useRouteDailyActuals(route.route);
  const calendar = useMonthCalendar(date);
  const monthDays = [...calendar.values()].filter(
    (day) => day.date >= monthFrom && day.date <= monthTo,
  );

  // Клик по дню — открываем его прогноз по часам
  const openDay = (day: string) => {
    setDate(day);
    setHorizon('day');
  };

  return (
    <div className="route-grid">
      <Panel title={`Маршрут ${route.route} · календарь пассажиропотока, ${monthTitle(date)}`}>
        <QueryView query={forecastQuery} emptyHint="Выберите месяц в ноябре–декабре 2025">
          {(forecast) => {
            const items = forecast.items.filter(
              (item) => item.date >= monthFrom && item.date <= monthTo,
            );
            const totals = monthTotals(items, calendar);
            return (
              <>
                <MonthCalendar
                  items={items}
                  calendar={calendar}
                  selectedDate={date}
                  onSelectDate={openDay}
                />
                <dl className="chart-summary">
                  <div>
                    <dt>За месяц</dt>
                    <dd>{formatThousands(totals.total)} пасс.</dd>
                  </div>
                  <div>
                    <dt>В среднем в будни</dt>
                    <dd>
                      {totals.workdayAverage === null
                        ? '—'
                        : formatThousands(totals.workdayAverage)}
                    </dd>
                  </div>
                  <div>
                    <dt>В среднем в выходные</dt>
                    <dd>
                      {totals.dayOffAverage === null ? '—' : formatThousands(totals.dayOffAverage)}
                    </dd>
                  </div>
                </dl>
              </>
            );
          }}
        </QueryView>
      </Panel>

      <div className="route-grid__side">
        <Panel title="Пассажиров в день">
          <QueryView query={forecastQuery}>
            {(forecast) => {
              // У маршрута без истории (5) факта нет — 404 ACTUALS_NOT_FOUND, рисуем только прогноз
              const actuals = actualsQuery.data?.items ?? [];
              const lastDate = forecast.items.reduce(
                (last, item) => (item.date > last ? item.date : last),
                FORECAST_DATE_MIN,
              );
              return (
                <>
                  <DailyChart
                    points={buildDailyPoints(
                      MONTH_CHART_ACTUALS_FROM,
                      lastDate,
                      actuals,
                      forecast.items,
                      calendar,
                    )}
                    forecastStart={FORECAST_DATE_MIN}
                    monthFrom={monthFrom}
                    monthTo={monthTo}
                    hasActuals={actuals.length > 0}
                  />
                  {actualsQuery.isError && (
                    <p className="muted">Факт за сентябрь–октябрь: {actualsQuery.error.message}</p>
                  )}
                  {actualsQuery.isPending && <p className="muted">Загружаем факт…</p>}
                </>
              );
            }}
          </QueryView>
        </Panel>

        <Panel title={`Факторы месяца, ${monthTitle(date)}`}>
          {monthDays.length === 0 ? <LoadingState /> : <MonthFactors days={monthDays} />}
        </Panel>
      </div>
    </div>
  );
}
