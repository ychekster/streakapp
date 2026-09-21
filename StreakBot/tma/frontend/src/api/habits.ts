/** Запросы к API привычек поверх общего HTTP-клиента. */

import type {
  Habit,
  HabitCreate,
  HabitResponse,
  HabitsResponse,
} from "../types/habit";
import { apiRequest } from "./client";

/** Загрузить список привычек пользователя с историей выполнения за год. */
export async function fetchHabits(): Promise<Habit[]> {
  const data = await apiRequest<HabitsResponse>("/tasks", { method: "GET" });
  return data.habits;
}

/** Переключить отметку выполнения задачи за сегодня; вернуть обновлённую привычку. */
export async function toggleHabit(taskId: number): Promise<Habit> {
  const data = await apiRequest<HabitResponse>(`/tasks/${taskId}/toggle`, {
    method: "POST",
  });
  return data.habit;
}

/** Удалить привычку. */
export async function deleteHabit(taskId: number): Promise<void> {
  await apiRequest<null>(`/tasks/${taskId}`, { method: "DELETE" });
}

/** Создать новую привычку; вернуть созданную привычку. */
export async function createHabit(payload: HabitCreate): Promise<Habit> {
  const data = await apiRequest<HabitResponse>("/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.habit;
}
