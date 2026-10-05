/**
 * Настройки пользователя.
 *
 * Хук живёт в App: от настроек зависят язык и тема всего приложения. Настройки хранятся
 * на устройстве (data/store.ts): `save` применяет изменение сразу — переключатель, язык
 * и тема откликаются без ожидания сервера, а для пояса `preview` подставляет подпись
 * выбранного варианта, — и изменение уходит на сервер вместе с остальными. Если сервер
 * его не принял, настройки возвращаются к его состоянию, а причина лежит в `saveError`
 * до следующего сохранения.
 *
 * Изменение, которое сделал не пользователь (пояс устройства при первом запуске),
 * сохраняется с `silent`: если сервер его не принял, ошибка в настройках не
 * показывается — пользователь ничего не менял.
 */

import { dataStore, type DataStatus } from "../data/store";
import type { Settings, SettingsUpdate } from "../types/settings";
import { useAppData } from "./useAppData";

export type SettingsStatus = DataStatus;

export interface UseSettingsResult {
  settings: Settings | null;
  status: SettingsStatus;
  /** Ошибка загрузки (только при status === "error"). */
  error: unknown;
  /** Ошибка последнего сохранения; сбрасывается, когда начинается следующее. */
  saveError: unknown;
  reload: () => void;
  /** Сохранить изменение (применяется сразу). */
  save: (patch: SettingsUpdate, preview?: Partial<Settings>, options?: SaveOptions) => void;
}

export interface SaveOptions {
  /** Не показывать ошибку сохранения (изменение сделал не пользователь). */
  silent?: boolean;
}

function save(
  patch: SettingsUpdate,
  preview?: Partial<Settings>,
  { silent = false }: SaveOptions = {},
): void {
  dataStore.saveSettings(patch, preview, silent);
}

export function useSettings(): UseSettingsResult {
  const { settings, status, error, saveError } = useAppData();
  return { settings, status, error, saveError, reload: dataStore.retry, save };
}
