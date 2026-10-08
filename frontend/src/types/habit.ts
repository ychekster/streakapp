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
  /** Первый день привычки every_other_day («ГГГГ-ММ-ДД»), дальше — каждый второй, или
   *  monthly — дальше то же число каждого месяца; иначе null. */
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
  /** Первое (самое раннее) напоминание «ЧЧ:ММ» в поясе пользователя; null — без
   *  напоминания. */
  reminder_time: string | null;
  /** Все напоминания «ЧЧ:ММ» по возрастанию; пустой — без напоминания. У привычек,
   *  сохранённых на устройстве до нескольких напоминаний, нет — см. reminderTimesOf. */
  reminder_times: string[];
  /** Цвет (тема) привычки. */
  color: HabitColor;
  /**
   * С какого дня («ГГГГ-ММ-ДД») привычка заморожена; null — не заморожена. Замороженную
   * нельзя отмечать, пропуски не прерывают её серию, напоминания не приходят.
   */
  frozen_since: string | null;
  /** Дни заморозки за те же дни, что `history` (текущая заморозка и прошедшие). */
  frozen_history: boolean[];
  /** Сколько раз в день нужно выполнить привычку (1 — обычная привычка). */
  times_per_day: number;
  /** Сколько раз привычка выполнена в день отметки; день выполнен, когда набрано
   *  `times_per_day`. */
  today_count: number;
  /** «Автоотметка»: без напоминания — выполнена с началом дня, с напоминаниями —
   *  сразу после последнего (отмечает бот). Только у привычек «раз в день». */
  auto_mark: boolean;
}

/** Частота выполнения привычки. */
export type FrequencyType = "daily" | "specific_days" | "every_other_day" | "monthly";

/** Поля формы привычки: создание и изменение (операции create / update в POST /sync,
 *  как тело POST /tasks и PUT /tasks/{id}). */
export interface HabitInput {
  name: string;
  frequency_type: FrequencyType;
  /** Коды дней недели (mon..sun) для specific_days; для остальных игнорируется. */
  days: string[];
  /** Первый день («ГГГГ-ММ-ДД») для every_other_day и monthly; для остальных — null. */
  start_date: string | null;
  /** Первое напоминание «ЧЧ:ММ»; null — без напоминания (его читают старые серверы). */
  reminder_time: string | null;
  /** Все напоминания «ЧЧ:ММ» (до MAX_REMINDERS_PER_HABIT); пустой — без напоминания. Нет
   *  у изменений, сделанных до нескольких напоминаний: тогда одно — `reminder_time`. */
  reminder_times?: string[];
  color: HabitColor;
  /** Сколько раз в день нужно выполнить (1–MAX_TIMES_PER_DAY). */
  times_per_day: number;
  /** «Автоотметка» (экран привычки); при times_per_day > 1 не действует. */
  auto_mark: boolean;
}
