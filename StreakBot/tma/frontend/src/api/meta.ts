/** Запросы справочных данных + модульный кеш (данные неизменны за сессию). */

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

/** Уже загруженный каталог поясов на этом языке (или null). */
export function cachedTimezones(language: Language): TimezoneEntry[] | null {
  return timezones.get(language) ?? null;
}

/** Загрузить каталог часовых поясов на языке интерфейса (один раз за сессию на язык). */
export async function loadTimezones(language: Language): Promise<TimezoneEntry[]> {
  const known = timezones.get(language);
  if (known) {
    return known;
  }
  const data = await apiRequest<{ timezones: TimezoneEntry[] }>(
    `/meta/timezones?language=${language}`,
    { method: "GET" },
  );
  timezones.set(language, data.timezones);
  return data.timezones;
}
