import { useQuery } from '@tanstack/react-query';
import { getActuals, getForecast } from '../api';
import {
  ACTUALS_DATE_MAX,
  FORECAST_DATE_MAX,
  FORECAST_DATE_MIN,
  MONTH_CHART_ACTUALS_FROM,
} from '../config/constants';

// Прогноз маршрута по дням на весь период (ноябрь–декабрь, 61 день — в пределах 62 по контракту).
// Из него строятся и календарь выбранного месяца, и прогнозная часть графика
export function useRouteDailyForecast(route: number) {
  return useQuery({
    queryKey: ['forecast', 'route-daily', route],
    queryFn: ({ signal }) =>
      getForecast(
        {
          route: [route],
          date_from: FORECAST_DATE_MIN,
          date_to: FORECAST_DATE_MAX,
          horizon: 'month',
        },
        signal,
      ),
  });
}

// Факт по дням за сентябрь–октябрь — «история» перед прогнозом на графике
export function useRouteDailyActuals(route: number) {
  return useQuery({
    queryKey: ['actuals', 'route-daily', route],
    queryFn: ({ signal }) =>
      getActuals(
        {
          route: [route],
          date_from: MONTH_CHART_ACTUALS_FROM,
          date_to: ACTUALS_DATE_MAX,
          granularity: 'day',
        },
        signal,
      ),
  });
}
