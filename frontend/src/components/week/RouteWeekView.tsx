import type { ForecastItem, Route } from '../../api';
import { DISPLAY_HOURS } from '../../config/constants';
import { useFilters } from '../../hooks/useFilters';
import { useMonthCalendar } from '../../hooks/useMonthCalendar';
import { useRouteWeek } from '../../hooks/useRouteWeek';
import { dayOfMonth, formatDate, weekdayShort } from '../../utils/dates';
import { dayMark, dayMarkTitle, isDayOff } from '../../utils/dayType';
import { hasNoItems } from '../../utils/empty';
import { peakLoadItem, totalPrediction } from '../../utils/forecast';
import { formatDecimal, formatHourTime, formatThousands } from '../../utils/format';
import { LOAD_COLORS, LOAD_LABELS, loadLevel } from '../../utils/intensity';
import { DaysHoursTable } from '../route/DaysHoursTable';
import { QueryView } from '../states/QueryView';

// Горизонт «Неделя» (Q&A 26.09): неделя маршрута по дням. Клик по дню — его прогноз по часам,
// маршрут при этом не меняется
export function RouteWeekView({ route }: { route: Route }) {
  const { date, setDate, setHorizon } = useFilters();
  const weekQuery = useRouteWeek(route.route, date);
  const calendar = useMonthCalendar(date);

  const openDay = (day: string) => {
    setDate(day);
    setHorizon('day');
  };

  return (
    <QueryView query={weekQuery} isEmpty={hasNoItems} emptyMessage="Нет прогноза на эту неделю">
      {(week) => {
        const days = groupByDate(week.items);
        const total = totalPrediction(week.items);
        return (
          <div className="week-view">
            <p className="muted">
              {formatDate(days[0]?.date ?? date)} – {formatDate(days.at(-1)?.date ?? date)} · за
              неделю {formatThousands(total)} пасс.
            </p>
            <ol className="week-days">
              {days.map(({ date: day, items }) => {
                const factors = calendar.days.get(day);
                const peak = peakLoadItem(items);
                const level = loadLevel(peak);
                const mark = dayMark(factors);
                return (
                  <li key={day}>
                    <button
                      type="button"
                      className={`week-day${day === date ? ' week-day--selected' : ''}${isDayOff(factors) ? ' week-day--off' : ''}`}
                      title={dayMarkTitle(factors)}
                      onClick={() => openDay(day)}
                    >
                      <span className="week-day__date">
                        {weekdayShort(day)} <strong>{dayOfMonth(day)}</strong>
                      </span>
                      <span className="week-day__total">
                        {formatDecimal(totalPrediction(items) / 1000)}
                        <span className="week-day__unit"> тыс.</span>
                      </span>
                      <span
                        className="week-day__load"
                        title={`Пассажиров на трамвай: ${LOAD_LABELS[level]}`}
                      >
                        <span className="load-dot" style={{ background: LOAD_COLORS[level] }} />
                        {peak?.passengers_per_tram == null
                          ? '—'
                          : `${formatDecimal(peak.passengers_per_tram)} на трамвай`}
                      </span>
                      {peak?.hour != null && (
                        <span className="muted">пик {formatHourTime(peak.hour)}</span>
                      )}
                      {mark && <span className="week-day__mark">{mark}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
            <DaysHoursTable
              items={week.items}
              calendar={calendar.days}
              selectedDate={date}
              hours={DISPLAY_HOURS}
              onSelectDate={openDay}
            />
          </div>
        );
      }}
    </QueryView>
  );
}

function groupByDate(items: ForecastItem[]): { date: string; items: ForecastItem[] }[] {
  const byDate = new Map<string, ForecastItem[]>();
  for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayItems]) => ({ date, items: dayItems }));
}
