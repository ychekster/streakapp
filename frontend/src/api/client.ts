/**
 * HTTP-клиент к API TMA.
 *
 * Каждый запрос несёт заголовок авторизации: в Telegram — `Authorization: tma
 * <initData>` (бэкенд проверяет подпись Telegram), в установленном веб-приложении —
 * `Authorization: Bearer <token>` его сессии (web/session.ts). Ошибки сети и API приводятся к
 * единому типу `ApiRequestError`, чтобы UI показывал понятный текст, не разбирая разные
 * форматы.
 */

import { REQUEST_TIMEOUT_MS } from "../constants";
import { currentSessionToken } from "../web/session";
import { getInitData } from "../telegram/webapp";

// Базовый URL API (пустая строка => тот же источник, что и фронтенд).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const AUTH_SCHEME = "tma";
const WEB_AUTH_SCHEME = "Bearer";

/** Authorization header value: Telegram initData inside Telegram, otherwise the web
 *  session token; null — neither (the API answers 401). */
export function authorizationHeader(): string | null {
  const initData = getInitData();
  if (initData) {
    return `${AUTH_SCHEME} ${initData}`;
  }
  const token = currentSessionToken();
  return token ? `${WEB_AUTH_SCHEME} ${token}` : null;
}

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
  | "invalid_start_date"
  | "invalid_reminder_time"
  | "invalid_color"
  | "invalid_timezone"
  | "invalid_language"
  | "invalid_theme"
  | "validation_error"
  | "internal_error"
  | "http_error"
  | "not_found"
  | "payload_too_large"
  // Отзывы и блокировка пользователя.
  | "invalid_review"
  | "review_limit"
  | "user_blocked"
  // Админ-панель.
  | "admin_required"
  | "user_not_found"
  | "user_is_admin"
  | "review_not_found"
  | "admin_exists"
  | "admin_not_found"
  | "cannot_remove_self"
  | "invalid_message"
  | "invalid_filter"
  | "invalid_button"
  | "app_url_missing"
  | "invalid_media"
  | "media_too_large"
  | "no_recipients"
  | "admin_chat_unavailable"
  | "broadcast_not_found"
  | "invalid_period"
  | "invalid_cursor"
  | "telegram_rejected"
  | "telegram_busy"
  | "telegram_error"
  // Web app: sessions and logins.
  | "invalid_session"
  | "handoff_invalid"
  | "login_expired"
  | "account_conflict"
  | "telegram_already_linked"
  | "invalid_telegram_login"
  | "web_only"
  | "telegram_only"
  | "push_unavailable"
  | "push_not_delivered";

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
 * сервер не ответил за `timeoutMs` (по умолчанию REQUEST_TIMEOUT_MS): без предела
 * зависший запрос (например, при обрыве туннеля) навсегда оставил бы экран загрузки или
 * заблокированную отметку. Тело — JSON-строка или FormData (загрузка файла).
 */
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const authorization = authorizationHeader();
  const headers: Record<string, string> = {
    ...(authorization ? { Authorization: authorization } : {}),
    // Тип тела — только когда тело есть: у GET без него запрос остаётся «простым». У
    // FormData тип с границей частей ставит сам браузер.
    ...(options.body !== undefined && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
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
