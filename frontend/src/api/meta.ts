/** Запросы справочных данных + модульный кеш (данные неизменны за сессию). Каталог
 *  поясов ещё и хранится на устройстве: экран выбора пояса открывается сразу, в том
 *  числе без связи, а устаревший каталог (смещения меняются с летним временем) тихо
 *  обновляется. */

import type { Language } from "../types/settings";
import type { Meta, TimezoneEntry } from "../types/meta";
import { apiRequest } from "./client";

let cached: Meta | null = null;
let inFlight: Promise<Meta> | null = null;

/** Загрузить метаданные форм один раз за сессию (повторные вызовы берут из кеша). */
export function loadMeta(): Promise<Meta> {
  if (cached) {
    return Promise.resolve(cached);
  }
  if (!inFlight) {
    inFlight = apiRequest<Meta>("/meta", { method: "GET" })
      .then((meta) => {
        cached = meta;
        return meta;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// Каталоги поясов по языкам: названия городов и стран зависят от языка интерфейса.
const timezones = new Map<Language, TimezoneEntry[]>();
const timezonesInFlight = new Map<Language, Promise<TimezoneEntry[]>>();

const TIMEZONES_KEY = "streak:timezones:";
// Сохранённый каталог старше этого обновляется (смещения меняются с летним временем), мс.
const TIMEZONES_FRESH_MS = 12 * 60 * 60 * 1000;

interface KeptTimezones {
  saved: number;
  timezones: TimezoneEntry[];
}

function readKeptTimezones(language: Language): KeptTimezones | null {
  try {
    const kept = JSON.parse(localStorage.getItem(TIMEZONES_KEY + language) ?? "null") as KeptTimezones | null;
    return kept && Array.isArray(kept.timezones) && typeof kept.saved === "number" ? kept : null;
  } catch {
    return null;
  }
}

function fetchTimezones(language: Language): Promise<TimezoneEntry[]> {
  let request = timezonesInFlight.get(language);
  if (!request) {
    request = apiRequest<{ timezones: TimezoneEntry[] }>(`/meta/timezones?language=${language}`, {
      method: "GET",
    })
      .then((data) => {
        timezones.set(language, data.timezones);
        try {
          localStorage.setItem(
            TIMEZONES_KEY + language,
            JSON.stringify({ saved: Date.now(), timezones: data.timezones }),
          );
        } catch {
          // Не сохранился — в следующий раз загрузится снова.
        }
        return data.timezones;
      })
      .finally(() => timezonesInFlight.delete(language));
    timezonesInFlight.set(language, request);
  }
  return request;
}

/** Уже известный каталог поясов на этом языке — загруженный или сохранённый (или null).
 *  Сохранённый давно — тихо обновляется. */
export function cachedTimezones(language: Language): TimezoneEntry[] | null {
  const known = timezones.get(language);
  if (known) {
    return known;
  }
  const kept = readKeptTimezones(language);
  if (!kept) {
    return null;
  }
  timezones.set(language, kept.timezones);
  if (Date.now() - kept.saved > TIMEZONES_FRESH_MS) {
    fetchTimezones(language).catch(() => undefined);
  }
  return kept.timezones;
}

/** Загрузить каталог часовых поясов на языке интерфейса (один раз за сессию на язык). */
export async function loadTimezones(language: Language): Promise<TimezoneEntry[]> {
  return cachedTimezones(language) ?? fetchTimezones(language);
}

// Результаты поиска поясов по «языку и запросу»: повтор запроса (стёр букву и набрал
// снова) не ходит на сервер.
const searches = new Map<string, TimezoneEntry[]>();

function searchKey(language: Language, query: string): string {
  return `${language}\n${query}`;
}

/** Уже полученные результаты поиска на этом языке по этому запросу (или null). */
export function cachedTimezoneSearch(language: Language, query: string): TimezoneEntry[] | null {
  return searches.get(searchKey(language, query)) ?? null;
}

/** Найти города (и их пояса) по названию, стране или смещению. */
export async function searchTimezones(
  language: Language,
  query: string,
): Promise<TimezoneEntry[]> {
  const params = new URLSearchParams({ language, q: query });
  const data = await apiRequest<{ timezones: TimezoneEntry[] }>(`/meta/timezones?${params}`, {
    method: "GET",
  });
  searches.set(searchKey(language, query), data.timezones);
  return data.timezones;
}
