/** Запрос справочных данных форм + модульный кеш (метаданные неизменны за сессию). */

import type { Meta } from "../types/meta";
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
