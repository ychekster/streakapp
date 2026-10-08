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
  frozenSubheading: "Заморожены",

  emptyTitle: "Нет привычек",
  emptyDescription: "Создайте новую привычку для отслеживания прогресса",

  errorTitle: "Что-то пошло не так",
  errorRetry: "Повторить",
  habitsLoadFailed: "Не удалось загрузить привычки",
  crashDescription: "Приложение столкнулось с ошибкой. Перезапустите его — данные не пострадали.",
  crashReload: "Перезапустить",

  outsideTitle: "Откройте в Telegram",
  outsideDescription:
    "Это мини-приложение работает внутри Telegram — откройте его кнопкой в боте Knot.",

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
  themeNames: { light: "Светлая", dark: "Тёмная", system: "Системная" },
  settingsMarkYesterday: "Отмечать за вчера",
  settingsMarkYesterdayFooter:
    "Отметки ставятся за вчерашний день, а не за сегодняшний. Удобно, если вы подводите итоги дня на следующее утро.",
  settingsReview: "Написать отзыв",
  // Напоминание «Пора отметить привычки»: ряд настроек и его экран.
  settingsCheckinReminder: "Напоминание",
  settingsCheckinReminderOff: "Выкл.",
  checkinReminderTitle: "Напоминание",
  checkinReminderToggle: "Напоминать отмечать",
  checkinReminderTime: "Время",
  // Вход в админ-панель — виден только администраторам.
  settingsAdminPanel: "Админ-панель",

  // --- Web app (PWA): install, account, notifications ---
  settingsInstall: "Добавить на рабочий стол",
  settingsAccount: "Аккаунт",
  settingsAccountGuest: "Не привязан",
  settingsAccountOffline: "Нет связи",
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
  accountLogoutUnsent: "Не все изменения успели сохраниться. Проверьте интернет и попробуйте ещё раз.",
  handoffMergeTitle: "Войти в аккаунт по ссылке?",
  handoffMergeMessage:
    "Привычки с этого телефона перейдут в аккаунт Telegram, из которого открыта ссылка. Если ссылку вам прислал кто-то другой, нажмите «Отмена».",
  handoffMergeConfirm: "Войти",
  handoffMergeCancel: "Отмена",
  accountLogoutEverywhere: "Выйти на всех устройствах",
  accountLogoutEverywhereTitle: "Выйти на всех устройствах?",
  accountLogoutEverywhereMessage:
    "Веб-приложение выйдет из аккаунта на всех устройствах, где вы входили.",
  // Web app: this device stays logged in.
  accountLogoutOthersMessage:
    "Вы выйдете из аккаунта на всех других устройствах. На этом устройстве вход сохранится.",
  accountLinkFailed: "Не удалось привязать Telegram",
  accountCreated: "Дата регистрации",
  accountHabits: "Привычек",
  accountCheckins: "Всего отметок",
  accountBestStreak: "Лучшая серия",
  accountDays: (count: number) => {
    const tens = count % 100;
    const ones = count % 10;
    const word =
      tens >= 11 && tens <= 14 ? "дней" : ones === 1 ? "день" : ones >= 2 && ones <= 4 ? "дня" : "дней";
    return `${count} ${word}`;
  },
  accountDevices: "Устройств с входом",
  accountDevicesFooterWeb: "Телефоны и компьютеры, где выполнен вход в веб-приложение, включая этот.",
  accountDevicesFooterTelegram: "Телефоны и компьютеры, где выполнен вход в веб-приложение.",
  notificationsRow: "Уведомления",
  notificationsDenied:
    "Уведомления запрещены. Разрешите их в настройках телефона: «Настройки» → «Уведомления» → Knot.",
  notificationsDeniedTitle: "Уведомления запрещены",
  notificationsDeniedHint:
    "Телефон больше не спрашивает разрешение. Включите их сами: «Настройки» → «Уведомления» → Knot.",
  notificationsOnFailed: "Не удалось включить уведомления",
  notificationsOffFailed: "Не удалось выключить уведомления",
  notificationsOffTitle: "Выключить уведомления?",
  notificationsOffMessage: "Напоминания о привычках перестанут приходить на этот телефон.",
  notificationsOffConfirm: "Выключить",
  notificationsOffCancel: "Отмена",
  telegramNotificationsOffMessage:
    "Бот перестанет присылать в Telegram напоминания о привычках и новости Knot.",
  installTitle: "Приложение на телефоне",
  installDescription: "Установка откроется в браузере. Привычки останутся те же.",
  installOpen: "Открыть в браузере",
  installFailed: "Не удалось подготовить ссылку. Попробуйте ещё раз.",

  // --- Экран «Написать отзыв» ---
  reviewTitle: "Написать отзыв",
  reviewDescription: "Расскажите, что вам нравится и что можно сделать лучше.",
  reviewPlaceholder: "Ваш отзыв",
  reviewSend: "Отправить",
  // История своих отзывов под полем и ответ администратора в ней.
  reviewHistoryHeading: "Ваши отзывы",
  reviewReplyLabel: "Ответ",
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
  goalEveryOtherDay: "Через день",
  goalMonthly: "Каждый месяц",
  habitSettingsHeading: "Настройки",
  editHabit: "Редактировать привычку",
  freezeHabit: "Заморозить привычку",
  unfreezeHabit: "Разморозить привычку",
  // Бот сам отмечает привычку: без напоминания — с началом дня, с напоминанием — сразу
  // после него.
  autoMarkHabit: "Автоотметка",
  freezeDialogTitle: "Заморозить привычку",
  freezeDialogMessage:
    "Текущая серия сохранится: пропуски не будут её прерывать, а дни заморозки отметятся в истории снежинками. Отмечать привычку и получать напоминания можно будет после разморозки.",
  freezeDialogConfirm: "Заморозить",
  freezeDialogCancel: "Отменить",
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
  checkFrozen: (name: string) => `${name}: заморожено`,
  // Привычка «несколько раз в день»: нажатие считает ещё один раз.
  checkCount: (name: string, count: number, total: number) =>
    `Отметить ещё раз: ${name} (${count} из ${total})`,

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
  formRepeat: "Повтор",
  // Повтор по дням недели: подпись — выбранные дни (weekdayLabel.ts); все — «Каждый день».
  formDaily: "Каждый день",
  formEveryOtherDay: "Через день",
  formMonthly: "Каждый месяц",
  // Первый день привычки «через день» / «каждый месяц»: «Сегодня», «Завтра» или дата.
  formStartDate: "Начало",
  dateToday: "Сегодня",
  dateTomorrow: "Завтра",
  // Цель: сколько раз в день выполнить привычку («1 раз в день», «3 раза в день»,
  // «5 раз в день»), степпер −/+.
  formGoalHeading: "Цель",
  formTimesPerDay: (count: number) => {
    const tens = count % 100;
    const ones = count % 10;
    const word = ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14) ? "раза" : "раз";
    return `${count} ${word} в день`;
  },
  formTimesLess: "Меньше раз в день",
  formTimesMore: "Больше раз в день",
  formReminderHeading: "Напоминание",
  formReminderToggle: "Напоминать",
  formReminderTime: "Время",
  formReminderAdd: "Добавить напоминание",
  formReminderRemove: (time: string) => `Удалить напоминание ${time}`,
  formThemeHeading: "Тема",

  // Дни недели (ключи — WEEKDAYS в constants.ts): в выборе дней, в цели серии
  // («Пн, Ср, Пт») и для скринридеров.
  // Набор дней недели (weekdayLabel.ts): «Будние дни», «Выходные», «Пн, Ср и Пт»; ни
  // одного — «Никогда».
  daysWorkdays: "Будние дни",
  daysWeekends: "Выходные",
  daysNever: "Никогда",
  daysList: (days: string[]) =>
    days.length > 1 ? `${days.slice(0, -1).join(", ")} и ${days[days.length - 1]}` : days.join(""),
  weekdays: {
    mon: { short: "Пн", abbr: "Пн", full: "Понедельник" },
    tue: { short: "Вт", abbr: "Вт", full: "Вторник" },
    wed: { short: "Ср", abbr: "Ср", full: "Среда" },
    thu: { short: "Чт", abbr: "Чт", full: "Четверг" },
    fri: { short: "Пт", abbr: "Пт", full: "Пятница" },
    sat: { short: "Сб", abbr: "Сб", full: "Суббота" },
    sun: { short: "Вс", abbr: "Вс", full: "Воскресенье" },
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
    invalid_start_date: "Выберите дату начала",
    invalid_reminder_time: "Укажите время напоминания",
    invalid_timezone: "Не удалось распознать часовой пояс",
    invalid_review: "Напишите отзыв",
    review_limit: "Сегодня вы уже оставили много отзывов — попробуйте завтра",
    user_blocked: "Доступ к приложению ограничен",
    invalid_session: "Сессия устарела — откройте приложение заново",
    handoff_invalid: "Ссылка устарела — откройте её заново из Telegram",
    stale_init_data: "Закройте и откройте приложение заново — ссылка выдаётся только сразу после открытия",
    login_expired: "Вход устарел — попробуйте ещё раз",
    account_conflict: "Этот вход уже привязан к другому аккаунту Telegram",
    telegram_already_linked: "К аккаунту уже привязан другой Telegram",
    invalid_telegram_login: "Telegram не подтвердил вход. Попробуйте ещё раз.",
    push_unavailable: "Уведомления пока не настроены на сервере",
    push_not_delivered: "Не удалось доставить уведомление. Разрешите уведомления для Knot.",
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
  frozenSubheading: "Frozen",

  emptyTitle: "No habits",
  emptyDescription: "Create a new habit to track your progress",

  errorTitle: "Something went wrong",
  errorRetry: "Try Again",
  habitsLoadFailed: "Couldn’t load your habits",
  crashDescription: "The app ran into an error. Restart it — your data is safe.",
  crashReload: "Restart",

  outsideTitle: "Open in Telegram",
  outsideDescription:
    "This mini app runs inside Telegram — open it with the button in the Knot chat.",

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
  themeNames: { light: "Light", dark: "Dark", system: "System" },
  settingsMarkYesterday: "Mark as Yesterday",
  settingsMarkYesterdayFooter:
    "Habits are marked for the previous day instead of today. Handy if you review your day the next morning.",
  settingsReview: "Write a Review",
  settingsCheckinReminder: "Reminder",
  settingsCheckinReminderOff: "Off",
  checkinReminderTitle: "Reminder",
  checkinReminderToggle: "Remind Me to Check In",
  checkinReminderTime: "Time",
  settingsAdminPanel: "Admin Panel",

  settingsInstall: "Add to Home Screen",
  settingsAccount: "Account",
  settingsAccountGuest: "Not linked",
  settingsAccountOffline: "No connection",
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
  accountLogoutUnsent: "Some changes haven’t been saved yet. Check your connection and try again.",
  handoffMergeTitle: "Log in with this link?",
  handoffMergeMessage:
    "The habits on this phone will move to the Telegram account the link was opened from. If someone else sent you the link, tap Cancel.",
  handoffMergeConfirm: "Log In",
  handoffMergeCancel: "Cancel",
  accountLogoutEverywhere: "Log Out on All Devices",
  accountLogoutEverywhereTitle: "Log out on all devices?",
  accountLogoutEverywhereMessage:
    "The web app will log out on every device where you logged in.",
  accountLogoutOthersMessage:
    "You’ll be logged out on all other devices. This device stays logged in.",
  accountLinkFailed: "Couldn’t link Telegram",
  accountCreated: "Joined",
  accountHabits: "Habits",
  accountCheckins: "Total Check-ins",
  accountBestStreak: "Best Streak",
  accountDays: (count: number) => `${count} ${count === 1 ? "day" : "days"}`,
  accountDevices: "Logged-in Devices",
  accountDevicesFooterWeb: "Phones and computers logged in to the web app, this one included.",
  accountDevicesFooterTelegram: "Phones and computers logged in to the web app.",
  notificationsRow: "Notifications",
  notificationsDenied:
    "Notifications aren’t allowed. Allow them in your phone’s Settings → Notifications → Knot.",
  notificationsDeniedTitle: "Notifications are blocked",
  notificationsDeniedHint:
    "Your phone won’t ask again. Turn them on yourself: Settings → Notifications → Knot.",
  notificationsOnFailed: "Couldn’t turn on notifications",
  notificationsOffFailed: "Couldn’t turn off notifications",
  notificationsOffTitle: "Turn off notifications?",
  notificationsOffMessage: "Habit reminders will stop arriving on this phone.",
  notificationsOffConfirm: "Turn Off",
  notificationsOffCancel: "Cancel",
  telegramNotificationsOffMessage:
    "The bot will stop sending habit reminders and Knot news to Telegram.",
  installTitle: "App on Your Phone",
  installDescription: "The install page opens in your browser. Your habits stay the same.",
  installOpen: "Open in Browser",
  installFailed: "Couldn’t prepare the link. Please try again.",

  reviewTitle: "Write a Review",
  reviewDescription: "Tell us what you like and what could be better.",
  reviewPlaceholder: "Your review",
  reviewSend: "Send",
  reviewHistoryHeading: "Your Reviews",
  reviewReplyLabel: "Reply",
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
  goalEveryOtherDay: "Every Other Day",
  goalMonthly: "Every Month",
  habitSettingsHeading: "Settings",
  editHabit: "Edit Habit",
  freezeHabit: "Freeze Habit",
  unfreezeHabit: "Unfreeze Habit",
  autoMarkHabit: "Auto Check-Off",
  freezeDialogTitle: "Freeze Habit",
  freezeDialogMessage:
    "Your current streak will be kept: missed days won’t break it, and frozen days will show as snowflakes in the history. You can check the habit off and get reminders again after unfreezing it.",
  freezeDialogConfirm: "Freeze",
  freezeDialogCancel: "Cancel",
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
  checkFrozen: (name: string) => `${name}: frozen`,
  checkCount: (name: string, count: number, total: number) =>
    `Mark once more: ${name} (${count} of ${total})`,

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
  formEveryOtherDay: "Every Other Day",
  formMonthly: "Every Month",
  formStartDate: "Starts",
  dateToday: "Today",
  dateTomorrow: "Tomorrow",
  formGoalHeading: "Goal",
  formTimesPerDay: (count: number) =>
    count === 1 ? "Once a day" : count === 2 ? "Twice a day" : `${count} times a day`,
  formTimesLess: "Fewer times a day",
  formTimesMore: "More times a day",
  formReminderHeading: "Reminder",
  formReminderToggle: "Remind Me",
  formReminderTime: "Time",
  formReminderAdd: "Add Reminder",
  formReminderRemove: (time: string) => `Remove reminder ${time}`,
  formThemeHeading: "Color",

  daysWorkdays: "Weekdays",
  daysWeekends: "Weekends",
  daysNever: "Never",
  daysList: (days: string[]) =>
    days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}` : days.join(""),
  weekdays: {
    mon: { short: "Mo", abbr: "Mon", full: "Monday" },
    tue: { short: "Tu", abbr: "Tue", full: "Tuesday" },
    wed: { short: "We", abbr: "Wed", full: "Wednesday" },
    thu: { short: "Th", abbr: "Thu", full: "Thursday" },
    fri: { short: "Fr", abbr: "Fri", full: "Friday" },
    sat: { short: "Sa", abbr: "Sat", full: "Saturday" },
    sun: { short: "Su", abbr: "Sun", full: "Sunday" },
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
    invalid_start_date: "Choose a start date",
    invalid_reminder_time: "Set a reminder time",
    invalid_timezone: "Couldn’t recognize the time zone",
    invalid_review: "Write your review",
    review_limit: "You’ve sent a lot of reviews today — try again tomorrow",
    user_blocked: "Your access to the app has been restricted",
    invalid_session: "Your session has expired — reopen the app",
    handoff_invalid: "This link has expired — open it again from Telegram",
    stale_init_data: "Close and reopen the app — the link is only issued right after opening it",
    login_expired: "The login has expired — please try again",
    account_conflict: "This login is already linked to another Telegram account",
    telegram_already_linked: "Another Telegram account is already linked",
    invalid_telegram_login: "Telegram didn’t confirm the login. Please try again.",
    push_unavailable: "Notifications aren’t set up on the server yet",
    push_not_delivered: "Couldn’t deliver the notification. Allow notifications for Knot.",
  },

  privacyPolicy: LEGAL_EN.privacy,
  termsOfUse: LEGAL_EN.terms,
};

/** Строки интерфейса по языкам. */
export const STRINGS: Record<Language, Strings> = { ru: RU, en: EN };
