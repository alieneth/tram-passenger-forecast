import { useQuery } from '@tanstack/react-query';
import { getRoutes } from '../api';

// Справочник меняется редко — один запрос на всё приложение
export function useRoutes() {
  return useQuery({
    queryKey: ['routes'],
    queryFn: ({ signal }) => getRoutes({}, signal),
    staleTime: Infinity,
  });
}
