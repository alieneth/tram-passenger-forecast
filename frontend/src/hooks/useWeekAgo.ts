import { useQuery } from '@tanstack/react-query';
import { getActuals, getForecast } from '../api';
import { ACTUALS_DATE_MAX, COMPARE_DAYS_BACK } from '../config/constants';
import { addDays } from '../utils/dates';

export interface ComparePoint {
  hour: number;
  value: number;
}

export interface Comparison {
  date: string;
  // Неделю назад может быть ещё факт (до 31.10) или уже прогноз
  source: 'actuals' | 'forecast';
  points: ComparePoint[];
}

// «Тот же день неделю назад» для графика маршрута
export function useWeekAgo(route: number, date: string, enabled: boolean) {
  const compareDate = addDays(date, -COMPARE_DAYS_BACK);
  const source = compareDate <= ACTUALS_DATE_MAX ? 'actuals' : 'forecast';

  return useQuery({
    queryKey: ['week-ago', route, compareDate],
    enabled,
    queryFn: async ({ signal }): Promise<Comparison> => {
      const period = { route: [route], date_from: compareDate, date_to: compareDate };
      const points =
        source === 'actuals'
          ? (await getActuals({ ...period, granularity: 'hour' }, signal)).items.map((item) => ({
              hour: item.hour ?? 0,
              value: item.boardings,
            }))
          : (await getForecast({ ...period, horizon: 'day' }, signal)).items.map((item) => ({
              hour: item.hour ?? 0,
              value: item.prediction,
            }));
      return { date: compareDate, source, points };
    },
  });
}
