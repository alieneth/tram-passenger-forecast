import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDecisions,
  updateDecisionStatus,
  type Decision,
  type DecisionStatusCode,
  type DecisionStatusResult,
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

// Все решения на дату (при route — одного маршрута), включая принятые и отклонённые
export function useDecisionsForDate(date: string, route?: number) {
  return useQuery({
    queryKey: ['decisions', date, 'route', route ?? 'all'],
    queryFn: ({ signal }) => getDecisions({ date, route }, signal),
  });
}

export function useRouteDecisions(route: number, date: string) {
  return useDecisionsForDate(date, route);
}

// Запись журнала: ответ PATCH + что это было за решение (маршрут, интервал) — для подписи
export interface DecisionLogEntry {
  result: DecisionStatusResult;
  decision: Decision;
}

// Журнал этой сессии. Читать decision_log из API нельзя — такого метода в контракте нет,
// поэтому собираем ответы PATCH, пока вкладка открыта
const LOG_KEY = ['decision-log'] as const;

export function useDecisionLog(): DecisionLogEntry[] {
  return (
    useQuery<DecisionLogEntry[]>({
      queryKey: LOG_KEY,
      queryFn: () => [],
      initialData: [],
      staleTime: Infinity,
      // Без подписчиков кэш иначе удалит журнал через 5 минут
      gcTime: Infinity,
    }).data ?? []
  );
}

// После смены статуса перечитываем все списки решений: счётчик на Обзоре, карточку, экран «Решения»
export function useUpdateDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ decision, update }: { decision: Decision; update: DecisionStatusUpdate }) =>
      updateDecisionStatus(decision.decision_id, update),
    onSuccess: (result, { decision }) =>
      queryClient.setQueryData<DecisionLogEntry[]>(LOG_KEY, (log = []) => [
        { result, decision },
        ...log,
      ]),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['decisions'] }),
  });
}
