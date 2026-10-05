/**
 * Список привычек и статус экрана (загрузка / ошибка / готово).
 *
 * Привычки хранятся на устройстве (data/store.ts): экран открывается сразу на них, без
 * сети, а сервер догоняет в фоне. Загрузка и ошибка бывают только при самом первом
 * запуске, пока на устройстве ещё ничего нет.
 */

import { dataStore, type DataStatus } from "../data/store";
import type { Habit } from "../types/habit";
import { useAppData } from "./useAppData";

export type HabitsStatus = DataStatus;

interface UseHabitsResult {
  habits: Habit[];
  status: HabitsStatus;
  /** Ошибка загрузки (только при status === "error"). */
  error: unknown;
  /** Загрузить снова (кнопка «Повторить»). */
  reload: () => void;
  /** Тихо спросить у сервера свежее состояние (уведомление открыло привычку). */
  refresh: () => void;
}

export function useHabits(): UseHabitsResult {
  const { habits, status, error } = useAppData();
  return { habits, status, error, reload: dataStore.retry, refresh: dataStore.refresh };
}
