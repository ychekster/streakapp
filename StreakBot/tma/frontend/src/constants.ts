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

/** Коды дней недели в порядке недели — как их хранит бэкенд (WEEKDAYS в
 *  tma/backend/constants.py). Подписи дней — в strings.ts. */
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Языки интерфейса; совпадают с LANGUAGES на бэкенде. */
export const LANGUAGES = ["ru", "en"] as const;

/** Язык, если он неизвестен (так же решает бэкенд для нового пользователя). */
export const DEFAULT_LANGUAGE = "ru";

/** Темы оформления: светлая, тёмная, адаптивная (как в системе); совпадают с THEMES
 *  на бэкенде. */
export const THEMES = ["light", "dark", "system"] as const;

/** Тема, пока настройки не загружены и не запомнены (так приложение выглядело всегда). */
export const DEFAULT_THEME = "light";

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

/** Сколько ждать ответа API, мс; дольше — ошибка сети (см. api/client.ts). */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Пауза после ввода в поиске часового пояса, после которой уходит запрос, мс. */
export const TIMEZONE_SEARCH_DELAY_MS = 200;

/** Максимальная длина отзыва (диалог «Написать отзыв» в настройках). */
export const REVIEW_MAX_LENGTH = 2000;

/** Время, которое предлагается при включении напоминания. */
export const DEFAULT_REMINDER_TIME = "09:00";

/* --- Админ-панель --- */

/** Сколько строк списка пользователей и отзывов приходит за раз (бесконечная прокрутка). */
export const ADMIN_PAGE_SIZE = 30;

/** Пауза после ввода в поиске пользователей, после которой уходит запрос, мс. */
export const ADMIN_SEARCH_DELAY_MS = 250;

/** Самый длинный поисковый запрос по пользователям (ADMIN_SEARCH_MAX_LENGTH на бэкенде). */
export const ADMIN_SEARCH_MAX_LENGTH = 100;

/** Периоды графиков аналитики, дней (ANALYTICS_PERIODS на бэкенде); по умолчанию — месяц. */
export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export const DEFAULT_ANALYTICS_PERIOD = 30;

/** Пределы Bot API: текст сообщения и подпись к фото или видео (как на бэкенде). */
export const MESSAGE_MAX_LENGTH = 4096;
export const CAPTION_MAX_LENGTH = 1024;

/** Медиа рассылки: типы файлов и пределы загрузки Bot API (фото — 10 МБ, видео — 50 МБ). */
export const BROADCAST_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const BROADCAST_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const BROADCAST_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const BROADCAST_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** Сколько ждать ответа на создание рассылки, мс: видео до 50 МБ грузится сначала на
 *  сервер, потом в Telegram. */
export const BROADCAST_UPLOAD_TIMEOUT_MS = 300_000;

/** Как часто обновлять ход рассылки, пока она идёт, мс. */
export const BROADCAST_POLL_MS = 2000;

/** «Сейчас в приложении» — был запрос за последние столько минут (ACTIVE_NOW_MINUTES). */
export const ACTIVE_NOW_MINUTES = 5;
