import { useQuery } from '@tanstack/react-query';
import { getFactors } from '../api';

export function useFactors(date: string, route?: number) {
  return useQuery({
    queryKey: ['factors', date, route],
    queryFn: ({ signal }) => getFactors({ date, route }, signal),
  });
}
