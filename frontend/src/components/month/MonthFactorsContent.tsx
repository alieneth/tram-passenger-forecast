import { errorMessage } from '../../api';
import type { MonthCalendar } from '../../hooks/useMonthCalendar';
import { EmptyState } from '../states/EmptyState';
import { ErrorState } from '../states/ErrorState';
import { LoadingState } from '../states/LoadingState';
import { MonthFactors } from './MonthFactors';

// Факторы месяца собираются из ответов по каждой дате: часть может не прийти — показываем,
// что есть, и честно говорим, чего не хватает
export function MonthFactorsContent({
  calendar,
  monthFrom,
  monthTo,
}: {
  calendar: MonthCalendar;
  monthFrom: string;
  monthTo: string;
}) {
  const days = [...calendar.days.values()].filter(
    (day) => day.date >= monthFrom && day.date <= monthTo,
  );
  if (days.length === 0) {
    if (calendar.isPending) return <LoadingState />;
    if (calendar.error) {
      return <ErrorState message={errorMessage(calendar.error)} error={calendar.error} />;
    }
    return <EmptyState message="Нет данных календаря за выбранный месяц" />;
  }
  return (
    <>
      <MonthFactors days={days} />
      {calendar.error !== null && (
        <p className="muted">Часть дней не загрузилась: {errorMessage(calendar.error)}</p>
      )}
    </>
  );
}
