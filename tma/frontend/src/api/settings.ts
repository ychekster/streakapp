/** Запросы к API настроек пользователя. */

import type { Settings, SettingsUpdate } from "../types/settings";
import { apiRequest } from "./client";

/** Загрузить текущие настройки пользователя. */
export async function fetchSettings(): Promise<Settings> {
  return apiRequest<Settings>("/settings", { method: "GET" });
}

/** Обновить настройки (частично) и вернуть актуальное состояние. */
export async function updateSettings(patch: SettingsUpdate): Promise<Settings> {
  return apiRequest<Settings>("/settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
