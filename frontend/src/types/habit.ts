/** Типы данных привычек — зеркалят схемы ответа API (backend/schemas.py). */

import type { HABIT_COLORS } from "../constants";

/** Цвет (тема) привычки — ключ палитры. */
export type HabitColor = (typeof HABIT_COLORS)[number];

export interface Habit {
  /** Идентификатор задачи. */
  id: number;
  /** Название привычки. */
  name: string;
  /** Отмечена ли задача выполненной сегодня. */
  done_today: boolean;
  /**
   * Запланирована ли задача на сегодня. true — её можно отмечать (интерактивно),
   * false — только просмотр прогресса (кнопка отметки неактивна).
   */
  scheduled_today: boolean;
  /** Частота: каждый день, конкретные дни недели или через день. */
  frequency_type: FrequencyType;
  /** Коды дней недели (mon..sun) для specific_days; для остальных — пустой массив. */
  days: string[];
  /** Первый день привычки every_other_day («ГГГГ-ММ-ДД»), дальше — каждый второй; иначе null. */
  start_date: string | null;
  /**
   * Выполнение за последние HISTORY_DAYS дней (старое → сегодня).
   * true — день выполнен, false — пропущен/нет данных.
   * Индекс 0 — самый старый день, последний элемент — сегодня.
   */
  history: boolean[];
  /**
   * Текущая серия: подряд выполненные дни по сегодня включительно. Неотмеченный
   * сегодняшний день серию не прерывает — день ещё не закончился.
   */
  current_streak: number;
  /** Лучшая серия за всё время. */
  best_streak: number;
  /** Сколько раз привычка выполнена за всё время. */
  total_done: number;
  /** Время напоминания «ЧЧ:ММ» в поясе пользователя; null — без напоминания. */
  reminder_time: string | null;
  /** Цвет (тема) привычки. */
  color: HabitColor;
}

/** Ответ GET /tasks. */
export interface HabitsResponse {
  habits: Habit[];
}

/** Ответ с одной привычкой (создание, изменение, переключение отметки). */
export interface HabitResponse {
  habit: Habit;
}

/** Частота выполнения привычки. */
export type FrequencyType = "daily" | "specific_days" | "every_other_day";

/** Тело запроса POST /tasks (создание) и PUT /tasks/{id} (изменение) — поля формы привычки. */
export interface HabitInput {
  name: string;
  frequency_type: FrequencyType;
  /** Коды дней недели (mon..sun) для specific_days; для остальных игнорируется. */
  days: string[];
  /** Первый день («ГГГГ-ММ-ДД») для every_other_day; для остальных — null. */
  start_date: string | null;
  /** Время напоминания «ЧЧ:ММ»; null — без напоминания. */
  reminder_time: string | null;
  color: HabitColor;
}
