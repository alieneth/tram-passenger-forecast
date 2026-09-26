import { useQuery } from '@tanstack/react-query';
import { getModelQuality, type Horizon } from '../api';

export function useModelQuality(horizon: Horizon) {
  return useQuery({
    queryKey: ['model-quality', horizon],
    queryFn: ({ signal }) => getModelQuality({ horizon }, signal),
    // Качество считается раз на версию модели — перезапрашивать незачем
    staleTime: Infinity,
  });
}
