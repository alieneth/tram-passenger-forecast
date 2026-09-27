import { useQuery } from '@tanstack/react-query';
import { getForecast, type ForecastQuery } from '../api';

// Почасовой прогноз всех маршрутов на дату — независимо от горизонта в шапке: карта всегда показывает
// день, даже когда справа открыта неделя или месяц маршрута. Ключ тот же, что у useForecast на «Дне»
export function useDayForecast(date: string) {
  const query: ForecastQuery = { date_from: date, date_to: date, horizon: 'day', route: undefined };
  return useQuery({
    queryKey: ['forecast', query],
    queryFn: ({ signal }) => getForecast(query, signal),
  });
}
