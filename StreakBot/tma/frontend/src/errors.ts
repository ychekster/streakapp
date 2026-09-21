/**
 * Текст ошибки для пользователя на языке интерфейса.
 *
 * Сервер отвечает на одном языке, поэтому показывается не его сообщение, а подпись
 * кода ошибки из strings.ts. Кода нет в списке (или это не ошибка API) — `fallback`,
 * текст про само действие («Не удалось сохранить привычку»).
 */

import { ApiRequestError } from "./api/client";
import type { Strings } from "./strings";

export function describeError(strings: Strings, error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    return strings.apiErrors[error.code] ?? fallback;
  }
  return fallback;
}
