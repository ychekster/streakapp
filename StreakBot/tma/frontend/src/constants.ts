/**
 * Структурные константы фронтенда (без хардкода «магических» чисел по коду).
 * Размеры/цвета/отступы дизайна живут в CSS-переменных (styles/variables.css);
 * здесь — значения, нужные именно логике на TypeScript.
 */

/** Длина истории выполнения в ответе API: 14 рядов × 26 столбцов. Должна совпадать
 *  с HISTORY_DAYS на бэкенде (tma/backend/constants.py). Экран привычки показывает
 *  её целиком. */
export const HISTORY_DAYS = 364;

/** Сетка на карточке в списке привычек: последние 7 рядов × 26 столбцов истории. */
export const GRID_DAYS = 182;

/** Сколько карточек-заглушек показывать во время первичной загрузки. */
export const SKELETON_HABIT_COUNT = 3;

/** Максимальная длина названия привычки по умолчанию (пока не загружены метаданные). */
export const DEFAULT_NAME_MAX_LENGTH = 100;

/** Дни недели на случай, если метаданные ещё не загрузились (совпадают с бэкендом). */
export const FALLBACK_WEEKDAYS = [
  { code: "mon", short: "ПН", full: "Понедельник" },
  { code: "tue", short: "ВТ", full: "Вторник" },
  { code: "wed", short: "СР", full: "Среда" },
  { code: "thu", short: "ЧТ", full: "Четверг" },
  { code: "fri", short: "ПТ", full: "Пятница" },
  { code: "sat", short: "СБ", full: "Суббота" },
  { code: "sun", short: "ВС", full: "Воскресенье" },
] as const;

/** Цвета (темы) привычки в порядке выбора. Значения — в CSS (`--palette-*` в
 *  styles/variables.css); ключи совпадают с HABIT_COLORS на бэкенде
 *  (tma/backend/constants.py). */
export const HABIT_COLORS = [
  "blue",
  "lightblue",
  "teal",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
  "indigo",
  "brown",
  "graphite",
] as const;

/** Цвет новой привычки (им же выглядели все привычки до появления выбора цвета). */
export const DEFAULT_HABIT_COLOR = "blue";

/** Время, которое предлагается при включении напоминания. */
export const DEFAULT_REMINDER_TIME = "09:00";
