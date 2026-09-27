import { useQuery } from '@tanstack/react-query';
import { getForecast, type ForecastQuery } from '../api';
import { apiHorizon, periodFor } from '../utils/horizon';
import { useFilters } from './useFilters';

// Прогноз по фильтрам шапки: «День» — по часам за дату, «Неделя» и «Месяц» — по дням за период
export function useForecast(routes?: number[]) {
  const { horizon, date } = useFilters();
  const query: ForecastQuery = {
    ...periodFor(horizon, date),
    horizon: apiHorizon(horizon),
    route: routes,
  };

  return useQuery({
    queryKey: ['forecast', query],
    queryFn: ({ signal }) => getForecast(query, signal),
  });
}
