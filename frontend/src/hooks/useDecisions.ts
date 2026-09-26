import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDecisions,
  updateDecisionStatus,
  type DecisionStatusCode,
  type DecisionStatusUpdate,
} from '../api';

// Решения, которые ждут диспетчера: новые и обновлённые (диаграмма статусов ТЗ 10.1)
export const WAITING_STATUSES: DecisionStatusCode[] = ['awaiting', 'updated'];

export function useWaitingDecisions(date: string) {
  return useQuery({
    queryKey: ['decisions', date, WAITING_STATUSES],
    queryFn: ({ signal }) => getDecisions({ date, status: WAITING_STATUSES }, signal),
  });
}

// Все решения маршрута на дату, включая принятые и отклонённые — чтобы видеть итог
export function useRouteDecisions(route: number, date: string) {
  return useQuery({
    queryKey: ['decisions', date, 'route', route],
    queryFn: ({ signal }) => getDecisions({ date, route }, signal),
  });
}

// После смены статуса перечитываем все списки решений: счётчик на Обзоре, карточку, экран «Решения»
export function useUpdateDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ decisionId, update }: { decisionId: number; update: DecisionStatusUpdate }) =>
      updateDecisionStatus(decisionId, update),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['decisions'] }),
  });
}
