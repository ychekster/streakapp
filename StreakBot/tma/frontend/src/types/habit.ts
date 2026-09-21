/** Типы данных привычек — зеркалят схемы ответа API (tma/backend/schemas.py). */

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
  /** Частота: каждый день или конкретные дни недели. */
  frequency_type: FrequencyType;
  /** Коды дней недели (mon..sun) для specific_days; для daily — пустой массив. */
  days: string[];
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
}

/** Ответ GET /tasks. */
export interface HabitsResponse {
  habits: Habit[];
}

/** Ответ с одной привычкой (создание POST /tasks, переключение .../toggle). */
export interface HabitResponse {
  habit: Habit;
}

/** Частота выполнения привычки. */
export type FrequencyType = "daily" | "specific_days";

/** Тело запроса POST /tasks — создание привычки. */
export interface HabitCreate {
  name: string;
  frequency_type: FrequencyType;
  /** Коды дней недели (mon..sun) для specific_days; для daily игнорируется. */
  days: string[];
}
