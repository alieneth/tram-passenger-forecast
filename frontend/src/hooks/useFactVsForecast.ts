import { useQueries } from '@tanstack/react-query';
import { getActuals, getForecast } from '../api';

// Факт и прогноз модели по часам за проверочный период — два запроса по контракту.
// Прогноз на сентябрь–октябрь есть в API, только если пакетный пересчёт (ML-8) пишет и его
export function useFactVsForecast(route: number, from: string, to: string) {
  return useQueries({
    queries: [
      {
        queryKey: ['actuals', 'quality', route, from, to],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          getActuals({ route: [route], date_from: from, date_to: to, granularity: 'hour' }, signal),
      },
      {
        queryKey: ['forecast', 'quality', route, from, to],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          getForecast({ route: [route], date_from: from, date_to: to, horizon: 'day' }, signal),
      },
    ],
  });
}
