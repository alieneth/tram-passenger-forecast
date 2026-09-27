import { useQuery } from '@tanstack/react-query';
import { getForecast } from '../api';
import { monthRange } from '../utils/dates';

// Почасовой прогноз маршрута на весь месяц выбранной даты: из него строится
// таблица «дни × часы» и график выбранного дня — один запрос вместо двух
export function useRouteMonth(route: number, date: string) {
  const period = monthRange(date);
  return useQuery({
    queryKey: ['forecast', 'route-month', route, period.date_from],
    queryFn: ({ signal }) => getForecast({ ...period, route: [route], horizon: 'day' }, signal),
  });
}
