import { useQuery } from '@tanstack/react-query';
import { getForecast, type Decision } from '../api';

// Прогноз по часам для маршрута решения и донора — для графиков «до / после»
export function useDecisionForecast(decision: Decision) {
  const routes = [decision.route, ...(decision.donor_route == null ? [] : [decision.donor_route])];
  return useQuery({
    queryKey: ['forecast', 'decision', decision.date, routes],
    queryFn: ({ signal }) =>
      getForecast(
        { route: routes, date_from: decision.date, date_to: decision.date, horizon: 'day' },
        signal,
      ),
  });
}
