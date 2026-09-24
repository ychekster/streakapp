/**
 * Загрузка и сохранение настроек пользователя.
 *
 * Хук живёт в App: от настроек зависят язык и тема всего приложения. `save` применяет
 * изменение сразу — переключатель, язык и тема откликаются без ожидания сервера, а для
 * пояса `preview` подставляет подпись выбранного варианта, — и отправляет его на
 * сервер. Ответ сервера заменяет состояние; при ошибке изменение откатывается, а
 * причина лежит в `saveError` до следующего сохранения. Если пока летел запрос,
 * пользователь изменил что-то ещё, ответ устаревшего запроса не применяется.
 *
 * Изменение, которое сделал не пользователь (пояс устройства при первом запуске),
 * сохраняется с `silent`: если сервер его не принял, оно так же откатывается, но
 * ошибку в настройках не показывает — пользователь ничего не менял.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSettings, updateSettings } from "../api/settings";
import type { Settings, SettingsUpdate } from "../types/settings";

export type SettingsStatus = "loading" | "ready" | "error";

export interface UseSettingsResult {
  settings: Settings | null;
  status: SettingsStatus;
  /** Ошибка загрузки (только при status === "error"). */
  error: unknown;
  /** Ошибка последнего сохранения; сбрасывается, когда начинается следующее. */
  saveError: unknown;
  reload: () => void;
  /** Сохранить изменение; true — сервер его принял. */
  save: (
    patch: SettingsUpdate,
    preview?: Partial<Settings>,
    options?: SaveOptions,
  ) => Promise<boolean>;
}

export interface SaveOptions {
  /** Не показывать ошибку сохранения (изменение сделал не пользователь). */
  silent?: boolean;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<SettingsStatus>("loading");
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  // Номер последнего сохранения: ответы более ранних не применяются.
  const latestSave = useRef(0);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      setSettings(await fetchSettings());
      setStatus("ready");
    } catch (caught) {
      setError(caught);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (
      patch: SettingsUpdate,
      preview: Partial<Settings> = {},
      { silent = false }: SaveOptions = {},
    ): Promise<boolean> => {
      const request = ++latestSave.current;
      setSaveError(null);
      // Снимок для отката и мгновенное применение изменения.
      let previous: Settings | null = null;
      setSettings((current) => {
        previous = current;
        return current && { ...current, ...patch, ...preview };
      });

      try {
        const updated = await updateSettings(patch);
        if (request === latestSave.current) {
          setSettings(updated);
        }
        return true;
      } catch (caught) {
        if (request === latestSave.current) {
          setSettings(previous);
          if (!silent) {
            setSaveError(caught);
          }
        }
        return false;
      }
    },
    [],
  );

  return { settings, status, error, saveError, reload: () => void load(), save };
}
