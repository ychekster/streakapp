/**
 * Вся пользовательская копия интерфейса в одном месте — на русском и английском.
 * Ни одной строки-сообщения прямо в компонентах: они берут строки текущего языка
 * через useStrings() (preferences.ts). Длинные тексты политики конфиденциальности и
 * условий использования — в legal.ts.
 */

import type { ApiErrorCode } from "./api/client";
import { LEGAL_EN, LEGAL_RU } from "./legal";
import type { Language } from "./types/settings";

/** Названия языков в меню выбора — каждое на своём языке. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ru: "Русский",
  en: "English",
};

const RU = {
  screenTitle: "Привычки",
  // Приглушённый подзаголовок второй секции: привычки, не запланированные на день
  // отметки (сегодня, а в режиме «Отмечать за вчера» — вчера).
  otherSubheadingToday: "Не запланированы на сегодня",
  otherSubheadingYesterday: "Не запланированы на вчера",

  emptyTitle: "Нет привычек",
  emptyDescription: "Создайте новую привычку для отслеживания прогресса",

  errorTitle: "Что-то пошло не так",
  errorRetry: "Повторить",
  habitsLoadFailed: "Не удалось загрузить привычки",
  crashDescription: "Приложение столкнулось с ошибкой. Перезапустите его — данные не пострадали.",
  crashReload: "Перезапустить",

  outsideTitle: "Откройте в Telegram",
  outsideDescription:
    "Это мини-приложение работает внутри Telegram — откройте его кнопкой в боте StreakBot.",

  // --- Нижняя навигация ---
  tabHabits: "Привычки",
  tabSettings: "Настройки",
  addHabit: "Новая привычка",

  // --- Настройки ---
  settingsTitle: "Настройки",
  settingsLoading: "Загрузка настроек…",
  // Админ-панель ещё загружается (обычно она загружена заранее — см. App.tsx).
  adminLoading: "Загрузка…",
  settingsLoadFailed: "Не удалось загрузить настройки",
  settingsSaveFailed: "Не удалось сохранить настройку",
  settingsTimezone: "Часовой пояс",
  settingsTimezoneNone: "Не выбран",
  settingsLanguage: "Язык",
  settingsTheme: "Тема",
  themeNames: { light: "Светлая", dark: "Тёмная", system: "Адаптивная" },
  settingsMarkYesterday: "Отмечать за вчера",
  settingsMarkYesterdayFooter:
    "Отметки ставятся за вчерашний день, а не за сегодняшний. Удобно, если вы подводите итоги дня на следующее утро.",
  settingsReview: "Написать отзыв",
  // Вход в админ-панель — виден только администраторам.
  settingsAdminPanel: "Админ-панель",

  // --- Web app (PWA): install, account, notifications ---
  settingsInstall: "Добавить на рабочий стол",
  settingsAccount: "Аккаунт",
  settingsAccountGuest: "Не привязан",
  settingsAccountFooter:
    "Привяжите Telegram, чтобы не потерять привычки: они будут и здесь, и в Telegram-боте, и на новом телефоне.",
  settingsAttention: "Требует внимания",
  webBack: "Назад",
  webStartFailedTitle: "Не удалось запустить",
  webStartFailedDescription: "Проверьте интернет и попробуйте ещё раз.",
  accountTitle: "Аккаунт",
  accountFooter: "Те же привычки — в Telegram-боте и на любом телефоне, где вы войдёте через Telegram.",
  accountLogout: "Выйти из аккаунта",
  accountLogoutTitle: "Выйти из аккаунта?",
  accountLogoutMessage: "Привычки останутся в вашем Telegram — войдите снова, и они вернутся.",
  accountLogoutConfirm: "Выйти",
  accountLogoutCancel: "Отмена",
  accountActionFailed: "Что-то пошло не так. Попробуйте ещё раз чуть позже.",
  accountLogoutFailed: "Не удалось выйти",
  accountLinkFailed: "Не удалось привязать Telegram",
  notificationsRow: "Уведомления",
  notificationsDenied:
    "Уведомления запрещены. Разрешите их в настройках телефона: «Настройки» → «Уведомления» → StreakApp.",
  notificationsDeniedTitle: "Уведомления запрещены",
  notificationsDeniedHint:
    "Телефон больше не спрашивает разрешение. Включите их сами: «Настройки» → «Уведомления» → StreakApp.",
  notificationsOnFailed: "Не удалось включить уведомления",
  notificationsOffFailed: "Не удалось выключить уведомления",
  notificationsOffTitle: "Выключить уведомления?",
  notificationsOffMessage: "Напоминания о привычках перестанут приходить на этот телефон.",
  notificationsOffConfirm: "Выключить",
  notificationsOffCancel: "Отмена",
  installTitle: "Приложение на телефоне",
  installDescription:
    "Откроем страницу установки в браузере телефона — пара касаний, и иконка StreakApp будет на рабочем столе. Привычки останутся те же.",
  installOpen: "Открыть в браузере",
  installPreparing: "Готовим ссылку…",
  installFailed: "Не удалось подготовить ссылку. Попробуйте ещё раз.",

  // --- Экран «Написать отзыв» ---
  reviewTitle: "Написать отзыв",
  reviewDescription: "Расскажите, что вам нравится и что можно сделать лучше.",
  reviewPlaceholder: "Ваш отзыв",
  reviewSend: "Отправить",
  reviewThanksTitle: "Спасибо за отзыв!",
  reviewThanksMessage: "Он поможет сделать приложение лучше.",
  reviewThanksDone: "Готово",
  reviewFailed: "Не удалось отправить отзыв. Попробуйте ещё раз.",

  // --- Выбор часового пояса ---
  timezoneTitle: "Часовой пояс",
  timezoneSearch: "Поиск",
  timezoneSearchClear: "Очистить",
  timezoneLoading: "Загрузка часовых поясов…",
  timezonesLoadFailed: "Не удалось загрузить часовые пояса",
  timezoneNothingFound: "Ничего не найдено",

  // --- Экран привычки ---
  openHabit: "Открыть привычку",
  // Число дней совпадает с HISTORY_DAYS (constants.ts).
  habitHistoryHeading: "Последние 364 дня",
  habitHistoryLabel: "История выполнения",
  habitMainHeading: "Основное",
  statCurrentStreak: "Текущая серия",
  statBestStreak: "Лучшая серия",
  statTotalDone: "Всего выполнено",
  statStreakGoal: "Цель серии",
  goalDaily: "Ежедневно",
  goalWorkdays: "Будни",
  goalWeekends: "Выходные",
  habitSettingsHeading: "Настройки",
  editHabit: "Редактировать привычку",
  deleteHabit: "Удалить привычку",
  deleteDialogTitle: "Удалить привычку",
  deleteDialogMessage: "Вы уверены, что хотите навсегда удалить эту привычку?",
  deleteDialogCancel: "Отменить",
  deleteDialogConfirm: "Удалить",
  deleteFailed: "Не удалось удалить привычку. Попробуйте ещё раз.",

  // --- Кнопка отметки (подписи для скринридеров) ---
  checkMark: (name: string) => `Отметить выполнено: ${name}`,
  checkUnmark: (name: string) => `Снять отметку: ${name}`,
  checkDone: (name: string) => `${name}: выполнено`,
  checkNotScheduled: (name: string) => `${name}: не запланировано`,

  // --- Создание и редактирование привычки ---
  formCreateTitle: "Новая привычка",
  formEditTitle: "Редактирование",
  formCreateSubmit: "Создать привычку",
  formEditSubmit: "Сохранить",
  formCreateFailed: "Не удалось создать привычку",
  formEditFailed: "Не удалось сохранить привычку",
  formInfoHeading: "Информация",
  formNamePlaceholder: "Название",
  formFrequencyHeading: "Частота",
  formRepeat: "Повторять",
  formDaily: "Каждый день",
  formSpecificDays: "По дням",
  formReminderHeading: "Напоминание",
  formReminderToggle: "Напоминать",
  formReminderTime: "Время",
  formThemeHeading: "Тема",

  // Дни недели (ключи — WEEKDAYS в constants.ts): в выборе дней, в цели серии
  // («Пн, Ср, Пт») и для скринридеров.
  weekdays: {
    mon: { short: "ПН", abbr: "Пн", full: "Понедельник" },
    tue: { short: "ВТ", abbr: "Вт", full: "Вторник" },
    wed: { short: "СР", abbr: "Ср", full: "Среда" },
    thu: { short: "ЧТ", abbr: "Чт", full: "Четверг" },
    fri: { short: "ПТ", abbr: "Пт", full: "Пятница" },
    sat: { short: "СБ", abbr: "Сб", full: "Суббота" },
    sun: { short: "ВС", abbr: "Вс", full: "Воскресенье" },
  },
  // Подписи цветов для скринридеров (ключи — HABIT_COLORS в constants.ts).
  colorNames: {
    blue: "Синий",
    lightblue: "Голубой",
    teal: "Бирюзовый",
    green: "Зелёный",
    yellow: "Жёлтый",
    orange: "Оранжевый",
    red: "Красный",
    pink: "Розовый",
    purple: "Фиолетовый",
    indigo: "Индиго",
    brown: "Коричневый",
    graphite: "Графитовый",
  },

  // Ошибки API по кодам (см. errors.ts). Кода нет в списке — показывается текст,
  // который подходит к действию («Не удалось сохранить привычку» и т.п.).
  apiErrors: {
    network_error: "Нет подключения к интернету. Проверьте связь и попробуйте ещё раз.",
    invalid_init_data: "Не удалось подтвердить личность Telegram. Откройте приложение заново.",
    missing_init_data: "Не удалось подтвердить личность Telegram. Откройте приложение заново.",
    task_not_found: "Привычка не найдена — возможно, её уже удалили",
    duplicate_name: "Привычка с таким названием уже есть",
    habit_limit: "Достигнут предел числа привычек — удалите ненужную, чтобы добавить новую",
    rate_limited: "Слишком много действий подряд — подождите пару секунд",
    invalid_name: "Введите название привычки",
    invalid_days: "Выберите хотя бы один день недели",
    invalid_reminder_time: "Укажите время напоминания",
    invalid_timezone: "Не удалось распознать часовой пояс",
    invalid_review: "Напишите отзыв",
    review_limit: "Сегодня вы уже оставили много отзывов — попробуйте завтра",
    user_blocked: "Доступ к приложению ограничен",
    invalid_session: "Сессия устарела — откройте приложение заново",
    handoff_invalid: "Ссылка устарела — откройте её заново из Telegram",
    login_expired: "Вход устарел — попробуйте ещё раз",
    last_login: "Нельзя отвязать единственный способ входа",
    account_conflict: "Этот вход уже привязан к другому аккаунту Telegram",
    telegram_already_linked: "К аккаунту уже привязан другой Telegram",
    provider_already_linked: "К аккаунту уже привязан другой аккаунт Google",
    invalid_telegram_login: "Telegram не подтвердил вход. Попробуйте ещё раз.",
    google_unavailable: "Вход через Google пока не настроен",
    push_unavailable: "Уведомления пока не настроены на сервере",
    push_not_delivered: "Не удалось доставить уведомление. Разрешите уведомления для StreakApp.",
  } as Partial<Record<ApiErrorCode, string>>,

  // --- Документы ---
  privacyPolicy: LEGAL_RU.privacy,
  termsOfUse: LEGAL_RU.terms,
};

export type Strings = typeof RU;

const EN: Strings = {
  screenTitle: "Habits",
  otherSubheadingToday: "Not scheduled for today",
  otherSubheadingYesterday: "Not scheduled for yesterday",

  emptyTitle: "No habits",
  emptyDescription: "Create a new habit to track your progress",

  errorTitle: "Something went wrong",
  errorRetry: "Try Again",
  habitsLoadFailed: "Couldn’t load your habits",
  crashDescription: "The app ran into an error. Restart it — your data is safe.",
  crashReload: "Restart",

  outsideTitle: "Open in Telegram",
  outsideDescription:
    "This mini app runs inside Telegram — open it with the button in the StreakBot chat.",

  tabHabits: "Habits",
  tabSettings: "Settings",
  addHabit: "New Habit",

  settingsTitle: "Settings",
  settingsLoading: "Loading settings…",
  adminLoading: "Loading…",
  settingsLoadFailed: "Couldn’t load settings",
  settingsSaveFailed: "Couldn’t save the setting",
  settingsTimezone: "Time Zone",
  settingsTimezoneNone: "Not Set",
  settingsLanguage: "Language",
  settingsTheme: "Theme",
  themeNames: { light: "Light", dark: "Dark", system: "Adaptive" },
  settingsMarkYesterday: "Mark as Yesterday",
  settingsMarkYesterdayFooter:
    "Habits are marked for the previous day instead of today. Handy if you review your day the next morning.",
  settingsReview: "Write a Review",
  settingsAdminPanel: "Admin Panel",

  settingsInstall: "Add to Home Screen",
  settingsAccount: "Account",
  settingsAccountGuest: "Not linked",
  settingsAccountFooter:
    "Link Telegram so you don’t lose your habits: they’ll be here, in the Telegram bot and on a new phone.",
  settingsAttention: "Needs attention",
  webBack: "Back",
  webStartFailedTitle: "Couldn’t start",
  webStartFailedDescription: "Check your connection and try again.",
  accountTitle: "Account",
  accountFooter: "The same habits are in the Telegram bot and on any phone where you log in with Telegram.",
  accountLogout: "Log Out",
  accountLogoutTitle: "Log out?",
  accountLogoutMessage: "Your habits stay with your Telegram — log in again to get them back.",
  accountLogoutConfirm: "Log Out",
  accountLogoutCancel: "Cancel",
  accountActionFailed: "Something went wrong. Please try again a bit later.",
  accountLogoutFailed: "Couldn’t log out",
  accountLinkFailed: "Couldn’t link Telegram",
  notificationsRow: "Notifications",
  notificationsDenied:
    "Notifications aren’t allowed. Allow them in your phone’s Settings → Notifications → StreakApp.",
  notificationsDeniedTitle: "Notifications are blocked",
  notificationsDeniedHint:
    "Your phone won’t ask again. Turn them on yourself: Settings → Notifications → StreakApp.",
  notificationsOnFailed: "Couldn’t turn on notifications",
  notificationsOffFailed: "Couldn’t turn off notifications",
  notificationsOffTitle: "Turn off notifications?",
  notificationsOffMessage: "Habit reminders will stop arriving on this phone.",
  notificationsOffConfirm: "Turn Off",
  notificationsOffCancel: "Cancel",
  installTitle: "App on Your Phone",
  installDescription:
    "We’ll open the install page in your phone’s browser — a couple of taps and the StreakApp icon is on your home screen. Your habits stay the same.",
  installOpen: "Open in Browser",
  installPreparing: "Preparing the link…",
  installFailed: "Couldn’t prepare the link. Please try again.",

  reviewTitle: "Write a Review",
  reviewDescription: "Tell us what you like and what could be better.",
  reviewPlaceholder: "Your review",
  reviewSend: "Send",
  reviewThanksTitle: "Thanks for your review!",
  reviewThanksMessage: "It helps us make the app better.",
  reviewThanksDone: "Done",
  reviewFailed: "Couldn’t send your review. Please try again.",

  timezoneTitle: "Time Zone",
  timezoneSearch: "Search",
  timezoneSearchClear: "Clear",
  timezoneLoading: "Loading time zones…",
  timezonesLoadFailed: "Couldn’t load time zones",
  timezoneNothingFound: "No Results",

  openHabit: "Open habit",
  habitHistoryHeading: "Last 364 days",
  habitHistoryLabel: "Completion history",
  habitMainHeading: "Overview",
  statCurrentStreak: "Current streak",
  statBestStreak: "Best streak",
  statTotalDone: "Total completed",
  statStreakGoal: "Streak goal",
  goalDaily: "Daily",
  goalWorkdays: "Weekdays",
  goalWeekends: "Weekends",
  habitSettingsHeading: "Settings",
  editHabit: "Edit Habit",
  deleteHabit: "Delete Habit",
  deleteDialogTitle: "Delete Habit",
  deleteDialogMessage: "Are you sure you want to permanently delete this habit?",
  deleteDialogCancel: "Cancel",
  deleteDialogConfirm: "Delete",
  deleteFailed: "Couldn’t delete the habit. Please try again.",

  checkMark: (name: string) => `Mark as done: ${name}`,
  checkUnmark: (name: string) => `Unmark: ${name}`,
  checkDone: (name: string) => `${name}: done`,
  checkNotScheduled: (name: string) => `${name}: not scheduled`,

  formCreateTitle: "New Habit",
  formEditTitle: "Edit Habit",
  formCreateSubmit: "Create Habit",
  formEditSubmit: "Save",
  formCreateFailed: "Couldn’t create the habit",
  formEditFailed: "Couldn’t save the habit",
  formInfoHeading: "Details",
  formNamePlaceholder: "Name",
  formFrequencyHeading: "Frequency",
  formRepeat: "Repeat",
  formDaily: "Every Day",
  formSpecificDays: "Specific Days",
  formReminderHeading: "Reminder",
  formReminderToggle: "Remind Me",
  formReminderTime: "Time",
  formThemeHeading: "Color",

  weekdays: {
    mon: { short: "MO", abbr: "Mon", full: "Monday" },
    tue: { short: "TU", abbr: "Tue", full: "Tuesday" },
    wed: { short: "WE", abbr: "Wed", full: "Wednesday" },
    thu: { short: "TH", abbr: "Thu", full: "Thursday" },
    fri: { short: "FR", abbr: "Fri", full: "Friday" },
    sat: { short: "SA", abbr: "Sat", full: "Saturday" },
    sun: { short: "SU", abbr: "Sun", full: "Sunday" },
  },
  colorNames: {
    blue: "Blue",
    lightblue: "Light Blue",
    teal: "Teal",
    green: "Green",
    yellow: "Yellow",
    orange: "Orange",
    red: "Red",
    pink: "Pink",
    purple: "Purple",
    indigo: "Indigo",
    brown: "Brown",
    graphite: "Graphite",
  },

  apiErrors: {
    network_error: "No internet connection. Check your connection and try again.",
    invalid_init_data: "Couldn’t verify your Telegram account. Please reopen the app.",
    missing_init_data: "Couldn’t verify your Telegram account. Please reopen the app.",
    task_not_found: "Habit not found — it may have been deleted",
    duplicate_name: "You already have a habit with this name",
    habit_limit: "You’ve reached the habit limit — delete one to add a new one",
    rate_limited: "Too many actions in a row — wait a couple of seconds",
    invalid_name: "Enter a habit name",
    invalid_days: "Choose at least one day of the week",
    invalid_reminder_time: "Set a reminder time",
    invalid_timezone: "Couldn’t recognize the time zone",
    invalid_review: "Write your review",
    review_limit: "You’ve sent a lot of reviews today — try again tomorrow",
    user_blocked: "Your access to the app has been restricted",
    invalid_session: "Your session has expired — reopen the app",
    handoff_invalid: "This link has expired — open it again from Telegram",
    login_expired: "The login has expired — please try again",
    last_login: "You can’t unlink your only login",
    account_conflict: "This login is already linked to another Telegram account",
    telegram_already_linked: "Another Telegram account is already linked",
    provider_already_linked: "Another Google account is already linked",
    invalid_telegram_login: "Telegram didn’t confirm the login. Please try again.",
    google_unavailable: "Google login isn’t set up yet",
    push_unavailable: "Notifications aren’t set up on the server yet",
    push_not_delivered: "Couldn’t deliver the notification. Allow notifications for StreakApp.",
  },

  privacyPolicy: LEGAL_EN.privacy,
  termsOfUse: LEGAL_EN.terms,
};

/** Строки интерфейса по языкам. */
export const STRINGS: Record<Language, Strings> = { ru: RU, en: EN };
