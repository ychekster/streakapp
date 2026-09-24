/**
 * Загрузка и хранение списка привычек.
 *
 * Управляет статусом экрана (загрузка / ошибка / готово), хранит данные и даёт
 * перезагрузку. Сам сетап отметки вынесен в useToggle, которому передаётся
 * setHabits — так загрузка и мутации разделены.
 */

import { useCallback, useEffect, useState } from "react";

import { fetchHabits } from "../api/habits";
import type { Habit } from "../types/habit";

export type HabitsStatus = "loading" | "ready" | "error";

interface UseHabitsResult {
  habits: Habit[];
  status: HabitsStatus;
  /** Ошибка загрузки (только при status === "error"). */
  error: unknown;
  /** Прямой доступ к стейту для оптимистичных обновлений (используется useToggle). */
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  /** Перезагрузить список (например, по кнопке «Повторить»). */
  reload: () => void;
  /** Тихо обновить список, без скелетона: после смены пояса или режима «Отмечать за
   *  вчера» сервер считает день отметки иначе. Не вышло — остаётся прежний список. */
  refresh: () => void;
}

export function useHabits(): UseHabitsResult {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [status, setStatus] = useState<HabitsStatus>("loading");
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      setHabits(await fetchHabits());
      setStatus("ready");
    } catch (caught) {
      setError(caught);
      setStatus("error");
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setHabits(await fetchHabits());
      setStatus("ready");
    } catch {
      // Список обновится при следующем открытии приложения.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { habits, status, error, setHabits, reload: () => void load(), refresh };
}
