import { ApiError } from '../api/errors';

// Сценарии сбоев для мок-режима — чтобы проверить и показать пустые состояния и ошибки (UI-13).
// Включается параметром ?mock=<сценарий> в адресе, выключается ?mock=normal. Запоминается на вкладку.
export type MockScenario =
  'normal' | 'offline' | 'not-ready' | 'server-error' | 'empty' | 'no-geometry';

const SCENARIOS: readonly MockScenario[] = [
  'normal',
  'offline',
  'not-ready',
  'server-error',
  'empty',
  'no-geometry',
];
const STORAGE_KEY = 'tram-forecast-mock-scenario';

function isScenario(value: string | null): value is MockScenario {
  return value !== null && (SCENARIOS as readonly string[]).includes(value);
}

export function currentScenario(): MockScenario {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('mock');
    if (isScenario(fromUrl)) {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return isScenario(stored) ? stored : 'normal';
  } catch {
    // Хранилище недоступно (приватный режим) — работаем без сценария
    return 'normal';
  }
}

// Сбои, общие для всех методов: сеть и внутренняя ошибка сервиса
export function commonFailure(): ApiError | null {
  const scenario = currentScenario();
  if (scenario === 'offline') return ApiError.client('NETWORK_ERROR');
  if (scenario === 'server-error') {
    return new ApiError('INTERNAL_ERROR', 'Внутренняя ошибка. Повторите запрос позже', 500);
  }
  return null;
}
