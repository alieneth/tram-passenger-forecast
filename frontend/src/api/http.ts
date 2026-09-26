import { API_URL } from './config';
import { ApiError, isApiErrorBody } from './errors';

type QueryValue = string | number | boolean | ReadonlyArray<string | number> | null | undefined;
export type QueryParams = Record<string, QueryValue>;

// Массивы — как в контракте (style: form, explode: true): route=1&route=7
export function buildQuery(params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, String(item)));
    } else {
      search.append(key, String(value));
    }
  }
  return search.toString();
}

function buildUrl(path: string, params: QueryParams = {}): string {
  const query = buildQuery(params);
  return `${API_URL}${path}${query ? `?${query}` : ''}`;
}

async function request(
  path: string,
  params: QueryParams,
  signal?: AbortSignal,
  // Статусы, при которых тело — обычный ответ, а не ошибка (GET /health отдаёт Health и с 503)
  acceptStatuses: readonly number[] = [],
  init: RequestInit = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), { ...init, signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw ApiError.client('NETWORK_ERROR');
  }
  if (response.ok || acceptStatuses.includes(response.status)) return response;

  const body: unknown = await response.json().catch(() => null);
  if (isApiErrorBody(body)) throw ApiError.fromBody(body, response.status);
  throw ApiError.client('UNEXPECTED_RESPONSE', response.status);
}

export async function getJson<T>(
  path: string,
  params: QueryParams = {},
  signal?: AbortSignal,
  acceptStatuses: readonly number[] = [],
): Promise<T> {
  const response = await request(path, params, signal, acceptStatuses);
  try {
    return (await response.json()) as T;
  } catch {
    throw ApiError.client('UNEXPECTED_RESPONSE', response.status);
  }
}

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

// Имя файла берём из Content-Disposition, как его отдаёт бэкенд
function parseFilename(header: string | null, fallback: string): string {
  const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

export async function getFile(
  path: string,
  params: QueryParams,
  fallbackFilename: string,
  signal?: AbortSignal,
): Promise<DownloadedFile> {
  const response = await request(path, params, signal);
  return {
    blob: await response.blob(),
    filename: parseFilename(response.headers.get('Content-Disposition'), fallbackFilename),
  };
}

// Изменение данных (PATCH решения): тело — JSON, ответ — JSON
export async function sendJson<T>(
  method: 'PATCH' | 'POST',
  path: string,
  body: unknown,
): Promise<T> {
  const response = await request(path, {}, undefined, [], {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  try {
    return (await response.json()) as T;
  } catch {
    throw ApiError.client('UNEXPECTED_RESPONSE', response.status);
  }
}
