/**
 * Оптимистичное переключение отметки привычки за сегодня.
 *
 * По нажатию состояние меняется немедленно (done_today и последняя ячейка года),
 * затем уходит запрос. При успехе привычка заменяется ответом сервера (источник
 * истины), при ошибке — откат к прежнему состоянию и тактильный сигнал об ошибке.
 * Параллельные нажатия по одной привычке игнорируются, пока запрос в полёте.
 */

import { useCallback, useRef } from "react";

import { toggleHabit } from "../api/habits";
import type { Habit } from "../types/habit";
import { hapticImpact, hapticNotification } from "../telegram/webapp";

/** Применить оптимистичное переключение к одной привычке в списке. */
function withToggledHabit(habits: Habit[], taskId: number): Habit[] {
  return habits.map((habit) => {
    if (habit.id !== taskId) {
      return habit;
    }
    const nextDone = !habit.done_today;
    // Последняя ячейка истории — сегодня; синхронизируем её с отметкой.
    const nextHistory = [...habit.history];
    if (nextHistory.length > 0) {
      nextHistory[nextHistory.length - 1] = nextDone;
    }
    // Сегодняшняя отметка добавляет (или убирает) ровно один день к текущей серии и
    // к общему счётчику. Лучшую серию при снятии отметки уточнит ответ сервера.
    const delta = nextDone ? 1 : -1;
    const nextStreak = Math.max(0, habit.current_streak + delta);
    return {
      ...habit,
      done_today: nextDone,
      history: nextHistory,
      current_streak: nextStreak,
      best_streak: Math.max(habit.best_streak, nextStreak),
      total_done: Math.max(0, habit.total_done + delta),
    };
  });
}

/** Заменить привычку в списке (ответом сервера или прежним состоянием при откате). */
function withReplacedHabit(habits: Habit[], updated: Habit): Habit[] {
  return habits.map((habit) => (habit.id === updated.id ? updated : habit));
}

export function useToggle(
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>,
) {
  // id привычек, по которым сейчас выполняется запрос (защита от дабл-тапа).
  const inFlight = useRef<Set<number>>(new Set());

  return useCallback(
    async (taskId: number) => {
      if (inFlight.current.has(taskId)) {
        return;
      }
      inFlight.current.add(taskId);
      hapticImpact("light");

      // Запоминаем прежнее состояние этой привычки для отката и применяем оптимистичное
      // изменение.
      // Присваивается в колбэке — `as`, чтобы TypeScript не сузил тип до undefined.
      let previous = undefined as Habit | undefined;
      setHabits((current) => {
        previous = current.find((habit) => habit.id === taskId);
        return withToggledHabit(current, taskId);
      });

      try {
        const updated = await toggleHabit(taskId);
        setHabits((current) => withReplacedHabit(current, updated));
      } catch {
        // Откат только этой привычки (не всего списка: отметки других привычек, сделанные
        // за время запроса, должны остаться) и сигнал об ошибке.
        const restored = previous;
        if (restored) {
          setHabits((current) => withReplacedHabit(current, restored));
        }
        hapticNotification("error");
      } finally {
        inFlight.current.delete(taskId);
      }
    },
    [setHabits],
  );
}
