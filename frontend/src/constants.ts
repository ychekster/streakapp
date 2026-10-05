/**
 * Структурные константы фронтенда (без хардкода «магических» чисел по коду).
 * Размеры/цвета/отступы дизайна живут в CSS-переменных (styles/variables.css);
 * здесь — значения, нужные именно логике на TypeScript.
 */

/** Длина истории выполнения в ответе API: 14 рядов × 26 столбцов. Должна совпадать
 *  с HISTORY_DAYS на бэкенде (backend/constants.py). Экран привычки показывает
 *  её целиком. */
export const HISTORY_DAYS = 364;
export const HISTORY_COLUMNS = 26;

/** Сетка на карточке в списке привычек: последние 8 рядов × 23 столбца истории. */
export const GRID_COLUMNS = 23;
export const GRID_DAYS = 184;

/** Сколько карточек-заглушек показывать во время первичной загрузки. */
export const SKELETON_HABIT_COUNT = 3;

/** Максимальная длина названия привычки по умолчанию (пока не загружены метаданные). */
export const DEFAULT_NAME_MAX_LENGTH = 100;

/** Коды дней недели в порядке недели — как их хранит бэкенд (WEEKDAYS в
 *  backend/constants.py). Подписи дней — в strings.ts. */
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Языки интерфейса; совпадают с LANGUAGES на бэкенде. */
export const LANGUAGES = ["ru", "en"] as const;

/** Язык, если он неизвестен (так же решает бэкенд для нового пользователя). */
export const DEFAULT_LANGUAGE = "ru";

/** Темы оформления: светлая, тёмная, системная (как в системе); совпадают с THEMES
 *  на бэкенде. */
export const THEMES = ["light", "dark", "system"] as const;

/** Тема, пока настройки не загружены и не запомнены: как в системе (так же решает бэкенд
 *  для нового пользователя). */
export const DEFAULT_THEME = "system";

/** Цвета (темы) привычки в порядке выбора. Значения — в CSS (`--palette-*` в
 *  styles/variables.css); ключи совпадают с HABIT_COLORS на бэкенде
 *  (backend/constants.py). */
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

/** Через столько после открытия приложения подгружаются справочники форм (лимит
 *  названия, каталог поясов), мс: не мешают первому экрану, но готовы к форме. */
export const PREFETCH_DELAY_MS = 2_000;

/** Пауза после ввода в поиске часового пояса, после которой уходит запрос, мс. */
export const TIMEZONE_SEARCH_DELAY_MS = 200;

/** Максимальная длина отзыва (диалог «Написать отзыв» в настройках). */
export const REVIEW_MAX_LENGTH = 2000;

/** Время, которое предлагается при включении напоминания. */
export const DEFAULT_REMINDER_TIME = "09:00";
/** Первый день привычки «через день» — не дальше стольких дней от сегодня
 *  (START_DATE_MAX_AHEAD_DAYS в backend/constants.py). */
export const START_DATE_MAX_AHEAD_DAYS = 366;
/** Время напоминания «Пора отметить привычки» при первом включении — вечер, когда
 *  подводят итоги дня. */
export const DEFAULT_CHECKIN_REMINDER_TIME = "21:00";

/* --- Админ-панель --- */

/** Сколько строк списка пользователей и отзывов приходит за раз (бесконечная прокрутка). */
export const ADMIN_PAGE_SIZE = 30;

/** Пауза после ввода в поиске пользователей, после которой уходит запрос, мс. */
export const ADMIN_SEARCH_DELAY_MS = 250;

/** Самый длинный поисковый запрос по пользователям (ADMIN_SEARCH_MAX_LENGTH на бэкенде). */
export const ADMIN_SEARCH_MAX_LENGTH = 100;

/** Периоды аналитики (ANALYTICS_PERIODS на бэкенде): сегодня, 7, 30, 90 дней, всё время;
 *  по умолчанию — месяц. Дни — по Алматы. */
export const ANALYTICS_PERIODS = ["today", "7", "30", "90", "all"] as const;
export const DEFAULT_ANALYTICS_PERIOD = "30";

/** Платформа, на которой человек появился (PLATFORMS на бэкенде). */
export const PLATFORMS = ["telegram", "web"] as const;

/** Готовые источники генератора ссылок (SOURCE_PRESETS на бэкенде) и пределы метки:
 *  источник — латиница и цифры, подпись (номер поста) — ещё «_» и «-». У веб-ссылки метка
 *  «источник_подпись» целиком — не длиннее SOURCE_LINK_MAX_LENGTH (её так хранит лендинг). */
export const SOURCE_PRESETS = ["threads", "instagram", "friends"] as const;
export const SOURCE_MAX_LENGTH = 16;
export const SOURCE_LINK_MAX_LENGTH = 32;

/** Окно активации — не длиннее стольких дней (ACTIVATION_WINDOW_MAX_DAYS на бэкенде). */
export const ACTIVATION_WINDOW_MAX_DAYS = 14;

/** Фильтры пользователей — в списке пользователей и в получателях рассылки
 *  (AUDIENCE_FILTERS на бэкенде): признак → его значения, в том же порядке. Условия разных
 *  признаков складываются через «и». Ещё есть признак «segment» — группа людей из
 *  аналитики (значение — её id), он не перечисляется. */
export const AUDIENCE_FILTERS = {
  app: ["opened", "never"],
  habits: ["any", "none"],
  activity: [
    "1d",
    "7d",
    "30d",
    "inactive_3d",
    "inactive_7d",
    "inactive_14d",
    "inactive_30d",
  ],
  joined: ["today", "1d", "7d", "30d", "90d"],
  platform: ["telegram", "web"],
  device: ["ios", "android", "desktop"],
  source: ["threads", "instagram", "friends", "direct", "other"],
  activated: ["yes", "no"],
  stuck: ["no_open", "no_habit", "no_checkin", "not_activated"],
  uninstalled: ["likely"],
  reminders: ["any", "none"],
  streak: ["3", "7", "14", "30"],
  language: ["ru", "en"],
  reviews: ["any", "none"],
  bot: ["ok", "blocked"],
  access: ["ok", "blocked"],
  test: ["yes", "no"],
} as const;

/** Признаки фильтра рассылки: заблокировавшие бота и заблокированные администратором
 *  рассылок не получают никогда (BROADCAST_EXCLUDED_FILTERS на бэкенде). */
export const BROADCAST_FILTER_KEYS = [
  "app",
  "habits",
  "activity",
  "joined",
  "platform",
  "device",
  "source",
  "activated",
  "stuck",
  "uninstalled",
  "reminders",
  "streak",
  "language",
  "reviews",
] as const;

/** Пауза после смены фильтра, после которой пересчитывается число пользователей, мс. */
export const AUDIENCE_COUNT_DELAY_MS = 150;

/** Кнопка под рассылкой (BROADCAST_BUTTONS на бэкенде); пустая строка — без кнопки. */
export const BROADCAST_BUTTONS = ["", "open_app", "review", "new_habit"] as const;

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

// --------------------------------------------------------------------------- //
//  Web app (PWA)
// --------------------------------------------------------------------------- //

/** "Log in via Telegram" through the bot: how often the app asks whether the bot has
 *  confirmed it (ms) — while the code lives (web/login.ts). */
export const TELEGRAM_LOGIN_POLL_MS = 2_000;

/** Handoff link for «Установить на рабочий стол» in the Mini App is fetched ahead of the
 *  tap (so the tap opens the browser at once) and refreshed when older than this (ms). */
export const HANDOFF_REFRESH_MS = 10 * 60_000;

// --------------------------------------------------------------------------- //
//  Changes kept on the device (data/store.ts)
// --------------------------------------------------------------------------- //

/** Changes are sent this long after the first unsent one (ms): quick taps go together. */
export const SYNC_DELAY_MS = 1_500;

/** Operations per POST /sync — at most SYNC_MAX_OPS on the backend (more go in the next). */
export const SYNC_BATCH_SIZE = 100;

/** Pauses before retrying a sync that failed (ms): network down, server busy. */
export const SYNC_RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

/** Coming back to the app asks the server for news (other devices, the bot) — not more
 *  often than this (ms). */
export const SYNC_REFRESH_MIN_MS = 15_000;

/** Active habits per user (MAX_HABITS_PER_USER on the backend): the form checks it on
 *  the device, the server checks it again. */
export const MAX_HABITS_PER_USER = 50;
