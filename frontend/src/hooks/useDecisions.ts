import { useQuery } from '@tanstack/react-query';
import { getDecisions, type DecisionStatusCode } from '../api';

// Решения, которые ждут диспетчера: новые и обновлённые (диаграмма статусов ТЗ 10.1)
export const WAITING_STATUSES: DecisionStatusCode[] = ['awaiting', 'updated'];

export function useWaitingDecisions(date: string) {
  return useQuery({
    queryKey: ['decisions', date, WAITING_STATUSES],
    queryFn: ({ signal }) => getDecisions({ date, status: WAITING_STATUSES }, signal),
  });
}
