import { useQueries } from '@tanstack/react-query';
import { getActuals, getForecast } from '../api';
import { QUALITY_EVAL_FROM, QUALITY_EVAL_TO } from '../config/constants';

// Факт и прогноз модели по часам за весь проверочный период, по всем маршрутам, — два запроса
// по контракту. Из них на фронте считаем WAPE (в API метрики нет) и строим «Факт и прогноз».
// Прогноз на сентябрь–октябрь есть в API, только если пакетный пересчёт (ML-8) пишет и его
export function useEvalData() {
  return useQueries({
    queries: [
      {
        queryKey: ['actuals', 'eval', QUALITY_EVAL_FROM, QUALITY_EVAL_TO],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          getActuals(
            { date_from: QUALITY_EVAL_FROM, date_to: QUALITY_EVAL_TO, granularity: 'hour' },
            signal,
          ),
        staleTime: Infinity,
      },
      {
        queryKey: ['forecast', 'eval', QUALITY_EVAL_FROM, QUALITY_EVAL_TO],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          getForecast(
            { date_from: QUALITY_EVAL_FROM, date_to: QUALITY_EVAL_TO, horizon: 'day' },
            signal,
          ),
        // Проверка на истории не меняется, пока не пересчитали модель
        staleTime: Infinity,
      },
    ],
  });
}
