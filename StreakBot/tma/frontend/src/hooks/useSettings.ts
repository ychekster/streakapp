/**
 * Загрузка и сохранение настроек пользователя.
 *
 * `save` применяет частичное обновление: при успехе обновляет состояние и
 * возвращает свежие настройки, при ошибке — пробрасывает её, чтобы экран показал
 * причину рядом с полем (а состояние осталось прежним).
 */

import { useCallback, useEffect, useState } from "react";

import { ApiRequestError } from "../api/client";
import { fetchSettings, updateSettings } from "../api/settings";
import type { Settings, SettingsUpdate } from "../types/settings";

export type SettingsStatus = "loading" | "ready" | "error";

interface UseSettingsResult {
  settings: Settings | null;
  status: SettingsStatus;
  errorMessage: string | null;
  reload: () => void;
  save: (patch: SettingsUpdate) => Promise<Settings>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<SettingsStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const loaded = await fetchSettings();
      setSettings(loaded);
      setStatus("ready");
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError ? error.message : "Не удалось загрузить настройки",
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (patch: SettingsUpdate): Promise<Settings> => {
    const updated = await updateSettings(patch);
    setSettings(updated);
    return updated;
  }, []);

  return { settings, status, errorMessage, reload: () => void load(), save };
}
