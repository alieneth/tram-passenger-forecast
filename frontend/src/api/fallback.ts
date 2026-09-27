import { ApiError } from './errors';

// Какие методы сейчас отдаются из моков — для значка в шапке
const mocked = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: readonly string[] = [];

function publish(): void {
  snapshot = [...mocked].sort();
  listeners.forEach((listener) => listener());
}

// Когда реальный метод можно подменить моком: не реализован (501), нет такого пути (404/405 без
// тела ошибки контракта), сервер недоступен или прогноз ещё не рассчитан (503 FORECAST_NOT_READY).
// Ошибки по делу — 400, 404 «нет данных», 409 — не подменяем: их надо показать как есть
const NOT_IMPLEMENTED_STATUSES = [404, 405, 501];

export function shouldFallback(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.code === 'NETWORK_ERROR' || error.code === 'FORECAST_NOT_READY') return true;
  // Справочник маршрутов взят из моков — бэкенд про эти маршруты не знает, данные по ним тоже из моков
  if (error.code === 'ROUTE_NOT_FOUND' && mocked.has('routes')) return true;
  if (error.status === 501) return true;
  return (
    error.code === 'UNEXPECTED_RESPONSE' && NOT_IMPLEMENTED_STATUSES.includes(error.status ?? 0)
  );
}

export function markMocked(method: string, isMocked: boolean): void {
  if (mocked.has(method) === isMocked) return;
  if (isMocked) mocked.add(method);
  else mocked.delete(method);
  publish();
}

export function subscribeMocked(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function mockedMethods(): readonly string[] {
  return snapshot;
}
