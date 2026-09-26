import type { FactorsResponse, ForecastItem } from '../../api';
import { formatDate, weekdayIndexFromMonday } from '../../utils/dates';
import { dayMark, dayMarkTitle, isDayOff } from '../../utils/dayType';
import { formatDecimal, formatNumber, formatThousands } from '../../utils/format';
import { intensityColor } from '../../utils/intensity';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface MonthCalendarProps {
  // Прогноз по дням за месяц (горизонт month, hour = null)
  items: ForecastItem[];
  calendar: Map<string, FactorsResponse>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

// Календарь месяца: в клетке — пассажиров за день, цвет — от самого тихого дня месяца к самому загруженному
export function MonthCalendar({ items, calendar, selectedDate, onSelectDate }: MonthCalendarProps) {
  const days = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const values = days.map((item) => item.prediction);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const ratio = (value: number) => (max > min ? (value - min) / (max - min) : 0.5);
  const leadingBlanks = days[0] ? weekdayIndexFromMonday(days[0].date) : 0;

  return (
    <div className="month-calendar">
      <div className="month-calendar__grid" role="grid" aria-label="Прогноз по дням месяца">
        {WEEKDAYS.map((weekday, index) => (
          <span
            key={weekday}
            role="columnheader"
            className={`month-calendar__weekday${index >= 5 ? ' month-calendar__weekday--off' : ''}`}
          >
            {weekday}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <span key={`blank-${index}`} className="month-calendar__blank" aria-hidden="true" />
        ))}
        {days.map((item) => {
          const factors = calendar.get(item.date);
          const mark = dayMark(factors);
          const classes = [
            'month-calendar__day',
            item.date === selectedDate ? 'month-calendar__day--selected' : '',
            isDayOff(factors) ? 'month-calendar__day--off' : '',
            item.is_analog ? 'month-calendar__day--analog' : '',
          ].join(' ');
          return (
            <button
              key={item.date}
              type="button"
              role="gridcell"
              className={classes}
              style={{ backgroundColor: intensityColor(ratio(item.prediction)) }}
              title={[
                `${formatDate(item.date)}: ${formatNumber(item.prediction)} пассажиров`,
                `коридор ${formatNumber(item.lower)} – ${formatNumber(item.upper)}`,
                dayMarkTitle(factors),
                'Нажмите, чтобы открыть прогноз по часам',
              ]
                .filter(Boolean)
                .join('\n')}
              onClick={() => onSelectDate(item.date)}
            >
              <span className="month-calendar__number">{Number(item.date.slice(8))}</span>
              <span className="month-calendar__value">{formatDecimal(item.prediction / 1000)}</span>
              <span className="month-calendar__unit">тыс.</span>
              {mark && <span className="month-calendar__mark">{mark}</span>}
            </button>
          );
        })}
      </div>
      <div className="heat-legend">
        <span>Пассажиров за день</span>
        <span>{formatThousands(min)}</span>
        <span className="heat-legend__bar" aria-hidden="true" />
        <span>{formatThousands(max)}</span>
      </div>
    </div>
  );
}
