// Мок-решения строятся из того же мок-прогноза: на каждый маршрут, где в какой-то час пассажиров
// на трамвай больше нормы, — предложение перебросить выходы с маршрута того же депо (БП-08),
// а без донора в депо — выпуск из резерва. Так карточка «Решения ждут» не противоречит карте.
import type { Decision, DecisionStatusCode, ForecastItem } from '../../api/types';
import { parseDate } from './calendar';
import { allForecastItems } from './forecast';
import { routesMock } from './routes';

const NORM = 150;
// Вагон готовят к выпуску за 40 минут до начала интервала (TRAM_PREP_MINUTES в .env.example)
const PREP_MINUTES = 40;
const CREATED_HOUR = '08:00:00';
const MAX_DONOR_LOAD = 110;
// id решения стабилен между запросами: номер дня × 100 + порядковый номер за день
const IDS_PER_DAY = 100;

// Названия статусов — по ТЗ 10.1 (в API приходят из decision_status.status_name)
export const STATUS_NAMES: Record<DecisionStatusCode, string> = {
  generated: 'Сформировано',
  awaiting: 'Ожидает решения',
  updated: 'Актуализировано',
  accepted: 'Принято',
  rejected: 'Отклонено',
  expired: 'Просрочено',
  executed: 'Исполнено',
  not_executed: 'Не исполнено',
  closed: 'Закрыто',
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function depotOf(route: number): number | null {
  return routesMock.items.find((item) => item.route === route)?.depot_id ?? null;
}

// Непрерывный интервал вокруг самого загруженного часа, где загрузка выше нормы
function overloadInterval(items: ForecastItem[]): ForecastItem[] {
  const over = items.filter((item) => (item.passengers_per_tram ?? 0) > NORM);
  const peak = over.reduce<ForecastItem | undefined>(
    (best, item) =>
      (item.passengers_per_tram ?? 0) > (best?.passengers_per_tram ?? 0) ? item : best,
    undefined,
  );
  if (!peak || peak.hour === null || peak.hour === undefined) return [];
  const hours = new Set(over.map((item) => item.hour));
  let from = peak.hour;
  let to = peak.hour;
  while (hours.has(from - 1)) from -= 1;
  while (hours.has(to + 1)) to += 1;
  return items.filter((item) => (item.hour ?? -1) >= from && (item.hour ?? -1) <= to);
}

function deadline(date: string, hourFrom: number): string {
  const minutes = hourFrom * 60 - PREP_MINUTES;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${date}T${hh}:${mm}:00`;
}

const cache = new Map<string, Decision[]>();

// Обратное к схеме id: по номеру решения — дата, за которую оно сформировано
export function decisionDate(decisionId: number): string {
  const day = Math.floor(decisionId / IDS_PER_DAY);
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export function decisionsFor(date: string): Decision[] {
  const cached = cache.get(date);
  if (cached) return cached;
  const decisions = buildDecisions(date);
  cache.set(date, decisions);
  return decisions;
}

function buildDecisions(date: string): Decision[] {
  const dayItems = allForecastItems().filter((item) => item.date === date);
  const routes = [...new Set(dayItems.map((item) => item.route))];
  const decisions: Decision[] = [];
  let nextId = Math.round(parseDate(date).getTime() / 86_400_000) * IDS_PER_DAY + 1;

  for (const route of routes) {
    const interval = overloadInterval(dayItems.filter((item) => item.route === route));
    const first = interval[0];
    const last = interval.at(-1);
    if (!first || !last || first.hour == null || last.hour == null) continue;
    const hourFrom = first.hour;
    const hourTo = last.hour;
    const inInterval = (item: ForecastItem) =>
      (item.hour ?? -1) >= hourFrom && (item.hour ?? -1) <= hourTo;

    const loadBefore = Math.max(...interval.map((item) => item.passengers_per_tram ?? 0));
    const trams = Math.max(...interval.map((item) => item.trams_on_line ?? 0));
    const passengers = loadBefore * trams;
    // Сколько вагонов добавить, чтобы уложиться в норму (поток считаем неизменным — БП)
    const tramsDelta = Math.max(1, Math.ceil(passengers / NORM) - trams);
    const depot = depotOf(route);
    const donor = routes.find((candidate) => {
      if (candidate === route || depot === null || depotOf(candidate) !== depot) return false;
      const donorItems = dayItems.filter((item) => item.route === candidate && inInterval(item));
      return donorItems.every((item) => (item.passengers_per_tram ?? 0) < MAX_DONOR_LOAD);
    });
    const donorItems = dayItems.filter((item) => item.route === donor && inInterval(item));
    const donorTrams = Math.max(0, ...donorItems.map((item) => item.trams_on_line ?? 0));
    const donorLoad = Math.max(0, ...donorItems.map((item) => item.passengers_per_tram ?? 0));

    const main: Decision = {
      decision_id: nextId++,
      parent_decision_id: null,
      decision_type: donor === undefined ? 'reserve' : 'transfer',
      route,
      donor_route: donor ?? null,
      date,
      hour_from: hourFrom,
      hour_to: hourTo,
      trams_delta: tramsDelta,
      norm: NORM,
      load_before: round1(loadBefore),
      load_after: round1(passengers / (trams + tramsDelta)),
      donor_load_before: donor === undefined ? null : round1(donorLoad),
      donor_load_after:
        donor === undefined || donorTrams <= tramsDelta
          ? null
          : round1((donorLoad * donorTrams) / (donorTrams - tramsDelta)),
      excess_pct: Math.round((loadBefore / NORM - 1) * 100),
      // Резерв берётся из депо самого маршрута — «одно депо», если депо маршрута известно
      same_depot: donor !== undefined || depot !== null,
      deadline_at: deadline(date, hourFrom),
      status_code: 'awaiting',
      status_name: STATUS_NAMES.awaiting,
      created_at: `${date}T${CREATED_HOUR}`,
    };
    decisions.push(main);

    // У переброски — запасной вариант: один вагон из резерва депо (как в примере контракта)
    if (main.decision_type === 'transfer') {
      decisions.push({
        ...main,
        decision_id: nextId++,
        parent_decision_id: main.decision_id,
        decision_type: 'reserve',
        donor_route: null,
        trams_delta: 1,
        load_after: round1(passengers / (trams + 1)),
        donor_load_before: null,
        donor_load_after: null,
      });
    }
  }
  return decisions;
}
