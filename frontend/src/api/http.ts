import { API_URL } from './config';
import { ApiError, isApiErrorBody } from './errors';

type QueryValue = string | number | boolean | ReadonlyArray<string | number> | null | undefined;
export type QueryParams = Record<string, QueryValue>;

// Массивы — как в контракте (style: form, explode: true): route=1&route=7
function buildUrl(path: string, params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, String(item)));
    } else {
      search.append(key, String(value));
    }
  }
  const query = search.toString();
  return `${API_URL}${path}${query ? `?${query}` : ''}`;
}

async function request(path: string, params: QueryParams, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), { signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw ApiError.client('NETWORK_ERROR');
  }
  if (response.ok) return response;

  const body: unknown = await response.json().catch(() => null);
  if (isApiErrorBody(body)) throw ApiError.fromBody(body, response.status);
  throw ApiError.client('UNEXPECTED_RESPONSE', response.status);
}

export async function getJson<T>(
  path: string,
  params: QueryParams = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await request(path, params, signal);
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
