import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { getFactors, type FactorsResponse } from '../api';
import { datesInRange, monthRange } from '../utils/dates';

export interface MonthCalendar {
  days: Map<string, FactorsResponse>;
  isPending: boolean;
  // Первая ошибка — её message показываем пользователю
  error: unknown;
}

function combine(results: UseQueryResult<FactorsResponse>[]): MonthCalendar {
  return {
    days: new Map(
      results.flatMap((result) => (result.data ? [[result.data.date, result.data] as const] : [])),
    ),
    isPending: results.some((result) => result.isPending),
    error: results.find((result) => result.isError)?.error ?? null,
  };
}

// Тип дня (рабочий, выходной, праздник, перенос) по датам месяца.
// В контракте GET /factors — одна дата за запрос, поэтому запросов столько, сколько дней;
// ответы кэшируются навсегда — календарь не меняется
export function useMonthCalendar(date: string): MonthCalendar {
  const { date_from, date_to } = monthRange(date);
  return useQueries({
    queries: datesInRange(date_from, date_to).map((day) => ({
      queryKey: ['factors', day, undefined],
      queryFn: ({ signal }: { signal: AbortSignal }) => getFactors({ date: day }, signal),
      staleTime: Infinity,
    })),
    combine,
  });
}
