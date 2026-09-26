import type { Error as ApiErrorBody } from './types';

// Коды, которых нет в контракте: ошибки на стороне браузера (сеть, неожиданный ответ)
export type ClientErrorCode = 'NETWORK_ERROR' | 'UNEXPECTED_RESPONSE';
export type ErrorCode = ApiErrorBody['code'] | ClientErrorCode;

const CLIENT_ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  NETWORK_ERROR: 'Сервер API недоступен. Проверьте подключение и повторите позже',
  UNEXPECTED_RESPONSE: 'Сервер вернул неожиданный ответ. Повторите запрос позже',
};

// Единая ошибка для всего фронта: текст для пользователя — всегда message из ответа API
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number | null;
  readonly details: ApiErrorBody['details'];

  constructor(
    code: ErrorCode,
    message: string,
    status: number | null,
    details?: ApiErrorBody['details'],
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static fromBody(body: ApiErrorBody, status: number): ApiError {
    return new ApiError(body.code, body.message, status, body.details);
  }

  static client(code: ClientErrorCode, status: number | null = null): ApiError {
    return new ApiError(code, CLIENT_ERROR_MESSAGES[code], status);
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

// 404 «нет данных» — это пустое состояние, а не авария: экран показывает спокойное сообщение
const EMPTY_DATA_CODES: ReadonlyArray<ErrorCode> = [
  'FORECAST_NOT_FOUND',
  'ACTUALS_NOT_FOUND',
  'DATE_NOT_IN_CALENDAR',
  'GEOMETRY_NOT_FOUND',
];

export function isEmptyDataError(error: unknown): error is ApiError {
  return error instanceof ApiError && EMPTY_DATA_CODES.includes(error.code);
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : CLIENT_ERROR_MESSAGES.UNEXPECTED_RESPONSE;
}
