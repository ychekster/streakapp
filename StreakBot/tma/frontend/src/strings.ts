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

  emptyEmoji: "🌱",
  emptyTitle: "Пока нет привычек",
  emptyDescription: "Добавь первую привычку кнопкой «+» внизу.",

  errorEmoji: "⚠️",
  errorTitle: "Что-то пошло не так",
  errorRetry: "Повторить",
  habitsLoadFailed: "Не удалось загрузить привычки",

  outsideEmoji: "📱",
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
  settingsLoadingEmoji: "⏳",
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
    network_error: "Нет связи с сервером",
    invalid_init_data: "Не удалось подтвердить личность Telegram. Откройте приложение заново.",
    missing_init_data: "Не удалось подтвердить личность Telegram. Откройте приложение заново.",
    task_not_found: "Привычка не найдена — возможно, её уже удалили",
    duplicate_name: "Привычка с таким названием уже есть",
    invalid_name: "Введите название привычки",
    invalid_days: "Выберите хотя бы один день недели",
    invalid_reminder_time: "Укажите время напоминания",
    invalid_timezone: "Не удалось распознать часовой пояс",
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

  emptyEmoji: "🌱",
  emptyTitle: "No habits yet",
  emptyDescription: "Add your first habit with the “+” button below.",

  errorEmoji: "⚠️",
  errorTitle: "Something went wrong",
  errorRetry: "Try Again",
  habitsLoadFailed: "Couldn’t load your habits",

  outsideEmoji: "📱",
  outsideTitle: "Open in Telegram",
  outsideDescription:
    "This mini app runs inside Telegram — open it with the button in the StreakBot chat.",

  tabHabits: "Habits",
  tabSettings: "Settings",
  addHabit: "New Habit",

  settingsTitle: "Settings",
  settingsLoading: "Loading settings…",
  settingsLoadingEmoji: "⏳",
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
    network_error: "No connection to the server",
    invalid_init_data: "Couldn’t verify your Telegram account. Please reopen the app.",
    missing_init_data: "Couldn’t verify your Telegram account. Please reopen the app.",
    task_not_found: "Habit not found — it may have been deleted",
    duplicate_name: "You already have a habit with this name",
    invalid_name: "Enter a habit name",
    invalid_days: "Choose at least one day of the week",
    invalid_reminder_time: "Set a reminder time",
    invalid_timezone: "Couldn’t recognize the time zone",
  },

  privacyPolicy: LEGAL_EN.privacy,
  termsOfUse: LEGAL_EN.terms,
};

/** Строки интерфейса по языкам. */
export const STRINGS: Record<Language, Strings> = { ru: RU, en: EN };
