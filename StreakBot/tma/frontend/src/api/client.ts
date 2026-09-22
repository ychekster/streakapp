/**
 * HTTP-клиент к API TMA.
 *
 * Каждый запрос несёт заголовок `Authorization: tma <initData>` — бэкенд по нему
 * проверяет подпись Telegram. Ошибки сети и API приводятся к единому типу
 * `ApiRequestError`, чтобы UI показывал понятный текст, не разбирая разные форматы.
 */

import { REQUEST_TIMEOUT_MS } from "../constants";
import { getInitData } from "../telegram/webapp";

// Базовый URL API (пустая строка => тот же источник, что и фронтенд).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const AUTH_SCHEME = "tma";

/** Машинно-читаемые коды ошибок, которые UI может различать. Пользователю показывается
 *  не текст ответа сервера, а подпись кода на языке интерфейса (см. errors.ts). */
export type ApiErrorCode =
  | "network_error"
  | "invalid_init_data"
  | "missing_init_data"
  | "task_not_found"
  | "duplicate_name"
  | "habit_limit"
  | "rate_limited"
  | "invalid_name"
  | "invalid_days"
  | "invalid_frequency"
  | "invalid_reminder_time"
  | "invalid_color"
  | "invalid_timezone"
  | "invalid_language"
  | "invalid_theme"
  | "validation_error"
  | "internal_error"
  | "http_error";

/** Единая ошибка запроса к API. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

// Форма тела ошибки от бэкенда: { "error": { "code", "message" } }.
interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Выполнить запрос к API и вернуть распарсенный JSON-ответ типа T.
 * Бросает `ApiRequestError` при сетевой ошибке, ответе с не-2xx статусом или если
 * сервер не ответил за REQUEST_TIMEOUT_MS: без предела зависший запрос (например,
 * при обрыве туннеля) навсегда оставил бы экран загрузки или заблокированную отметку.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `${AUTH_SCHEME} ${getInitData()}`,
    // Тип тела — только когда тело есть: у GET без него запрос остаётся «простым».
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch {
    // fetch падает при сетевой недоступности и по таймауту — отдельный понятный код.
    throw new ApiRequestError(0, "network_error", "Нет связи с сервером");
  } finally {
    window.clearTimeout(timeout);
  }

  const body = await parseJsonSafe(response);

  if (!response.ok) {
    const errorBody = (body as ApiErrorBody | null)?.error;
    const code = (errorBody?.code as ApiErrorCode) ?? "http_error";
    const message = errorBody?.message ?? "Не удалось выполнить запрос";
    throw new ApiRequestError(response.status, code, message);
  }

  return body as T;
}
