import { useQuery } from '@tanstack/react-query';
import { getForecast, type ForecastQuery } from '../api';
import { monthRange } from '../utils/dates';
import { useFilters } from './useFilters';

// Прогноз по фильтрам шапки: «День» — по часам за дату, «Месяц» — по дням за весь месяц
export function useForecast(routes?: number[]) {
  const { horizon, date } = useFilters();
  const period = horizon === 'day' ? { date_from: date, date_to: date } : monthRange(date);
  const query: ForecastQuery = { ...period, horizon, route: routes };

  return useQuery({
    queryKey: ['forecast', query],
    queryFn: ({ signal }) => getForecast(query, signal),
  });
}
