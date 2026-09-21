/**
 * Структурные константы фронтенда (без хардкода «магических» чисел по коду).
 * Размеры/цвета/отступы дизайна живут в CSS-переменных (styles/variables.css);
 * здесь — значения, нужные именно логике на TypeScript.
 */

/** Длина истории выполнения: 7 рядов × 26 столбцов. Должна совпадать с
 *  GRID_DAYS на бэкенде (tma/backend/constants.py). */
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
