/**
 * Фильтр пользователей админ-панели — кого показать в списке пользователей и кому
 * отправить рассылку. Признаки и значения — AUDIENCE_FILTERS (как на бэкенде), условия
 * разных признаков складываются через «и». В запросе фильтр — строка
 * «признак:значение» через запятую (backend/audience.py). Признак «segment» — группа
 * людей из аналитики (её id) — идёт последним; его подпись — название группы
 * (`segmentTitle`, запоминается, когда группу создают).
 */

import { AUDIENCE_FILTERS } from "../constants";
import type { Audience, AudienceKey } from "../types/admin";

/** Все признаки — в порядке AUDIENCE_FILTERS (так они и показываются). */
export const AUDIENCE_KEYS = Object.keys(AUDIENCE_FILTERS) as AudienceKey[];

/** Выбранные условия фильтра по порядку признаков: [признак, значение]. */
export function audienceEntries(audience: Audience): [AudienceKey, string][] {
  return AUDIENCE_KEYS.flatMap((key) => {
    const value = audience[key];
    return value ? [[key, value] as [AudienceKey, string]] : [];
  });
}

/** Фильтр строкой для запроса: «app:opened,habits:any»; пустой — пустая строка. */
export function audienceParam(audience: Audience): string {
  const parts = audienceEntries(audience).map(([key, value]) => `${key}:${value}`);
  if (audience.segment) {
    parts.push(`segment:${audience.segment}`);
  }
  return parts.join(",");
}

/** Названия групп из аналитики, созданных в этом сеансе: id → название. */
const segmentTitles = new Map<string, string>();

export function rememberSegment(id: number, title: string): void {
  segmentTitles.set(String(id), title);
}

export function segmentTitle(id: string): string | null {
  return segmentTitles.get(id) ?? null;
}

/** Фильтр без группы из аналитики. */
export function withoutSegment(audience: Audience): Audience {
  const next = { ...audience };
  delete next.segment;
  return next;
}

/** Фильтр с условием признака `key` (value пустое — условие снято). */
export function withFilter(audience: Audience, key: AudienceKey, value: string): Audience {
  const next = { ...audience } as Record<AudienceKey, string | undefined>;
  if (value) {
    next[key] = value;
  } else {
    delete next[key];
  }
  return next as Audience;
}
