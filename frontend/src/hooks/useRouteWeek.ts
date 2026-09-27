import { useQuery } from '@tanstack/react-query';
import { getForecast } from '../api';
import { FORECAST_DATE_MAX, FORECAST_DATE_MIN } from '../config/constants';
import { weekRange } from '../utils/dates';

// Почасовой прогноз маршрута на неделю выбранной даты — таблица «дни недели × часы» в карточке
export function useRouteWeek(route: number, date: string) {
  const period = weekRange(date, FORECAST_DATE_MIN, FORECAST_DATE_MAX);
  return useQuery({
    queryKey: ['forecast', 'route-week', route, period.date_from],
    queryFn: ({ signal }) => getForecast({ ...period, route: [route], horizon: 'day' }, signal),
  });
}
