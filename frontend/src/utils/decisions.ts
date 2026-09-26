import type { Decision } from '../api';
import { formatDecimal, formatHour } from './format';
import { plural } from './plural';

const EXITS: [string, string, string] = ['выход', 'выхода', 'выходов'];

// hour_to входит в интервал: 17–18 — это 17:00–19:00
export function formatInterval(decision: Pick<Decision, 'hour_from' | 'hour_to'>): string {
  return `${formatHour(decision.hour_from)}:00–${formatHour((decision.hour_to + 1) % 24)}:00`;
}

export function problemText(decision: Decision): string {
  return `Пик ${formatInterval(decision)} · ${formatDecimal(decision.load_before)} пасс. на трамвай`;
}

export function proposalText(decision: Decision): string {
  const exits = `${decision.trams_delta} ${plural(decision.trams_delta, EXITS)}`;
  if (decision.decision_type === 'reserve' || decision.donor_route == null) {
    return `+${exits} на маршрут ${decision.route} из резерва депо`;
  }
  const donorLoad =
    decision.donor_load_before == null
      ? ''
      : ` (там ${formatDecimal(decision.donor_load_before)} пасс. на трамвай)`;
  return `+${exits} на маршрут ${decision.route}, снять ${exits} с маршрута ${decision.donor_route}${donorLoad}`;
}

export function effectText(decision: Decision): string {
  const main = `на маршруте ${decision.route} — ${formatDecimal(decision.load_after)} пасс. на трамвай`;
  if (decision.donor_route == null || decision.donor_load_after == null) return main;
  return `${main}, на маршруте ${decision.donor_route} — ${formatDecimal(decision.donor_load_after)}`;
}

// «Решить до 16:20» — дата у решения та же, что у прогноза
export function deadlineTime(decision: Decision): string {
  return decision.deadline_at.slice(11, 16);
}

export function isWaiting(decision: Decision): boolean {
  return decision.status_code === 'awaiting' || decision.status_code === 'updated';
}

// Основные решения и их альтернативы (parent_decision_id) — одной группой
export function groupDecisions(
  decisions: Decision[],
): { main: Decision; alternatives: Decision[] }[] {
  return decisions
    .filter((item) => item.parent_decision_id == null)
    .map((main) => ({
      main,
      alternatives: decisions.filter((item) => item.parent_decision_id === main.decision_id),
    }));
}

export type DecisionTab = 'new' | 'accepted' | 'rejected' | 'closed';

const ACCEPTED: Decision['status_code'][] = ['accepted', 'executed', 'not_executed'];

// Вкладка группы решений — по итогу всей группы: принят хоть один вариант — «Принятые»,
// что-то ещё ждёт — «Новые», иначе — по статусу основного решения
export function decisionTab(group: { main: Decision; alternatives: Decision[] }): DecisionTab {
  const all = [group.main, ...group.alternatives];
  if (all.some((item) => ACCEPTED.includes(item.status_code))) return 'accepted';
  if (all.some(isWaiting) || group.main.status_code === 'generated') return 'new';
  if (group.main.status_code === 'rejected') return 'rejected';
  return 'closed';
}
