import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../api';
import { HEALTH_REFRESH_MS } from '../config/constants';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
    refetchInterval: HEALTH_REFRESH_MS,
    retry: false,
  });
}
