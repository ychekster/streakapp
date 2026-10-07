/**
 * Вся копия админ-панели — на русском и английском, как и у приложения: панель говорит на
 * языке интерфейса (его можно сменить и в её настройках). Ни одной строки-сообщения прямо
 * в экранах админ-панели: они берут строки текущего языка через useAdminStrings(), а
 * ошибки API показывают по коду (describeAdminError).
 */

import { ApiRequestError, type ApiErrorCode } from "../api/client";
import { ANALYTICS_EN, ANALYTICS_RU } from "./analyticsCopy";
import { useLanguage } from "../preferences";
import type { AudienceKey, BroadcastButton, UndeliveredReason } from "../types/admin";
import type { Language } from "../types/settings";

/** Число по-русски: «1 234». */
function ru(value: number): string {
  return value.toLocaleString("ru-RU");
}

/** Число по-английски: «1,234». */
function en(value: number): string {
  return value.toLocaleString("en-US");
}

/** Форма слова после числа по-русски: 1 пользователь, 2 пользователя, 5 пользователей. */
function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const units = count % 10;
  if (units === 1 && tens !== 11) {
    return one;
  }
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) {
    return few;
  }
  return many;
}

const RU = {
  // --- Нижняя навигация ---
  tabAnalytics: "Аналитика",
  tabUsers: "Пользователи",
  tabReviews: "Отзывы",
  tabBroadcast: "Рассылка",
  tabSettings: "Настройки",

  // --- Общие состояния и форматы ---
  loading: "Загрузка…",
  errorTitle: "Что-то пошло не так",
  retry: "Повторить",
  nothingFound: "Ничего не найдено",
  loadMoreFailed: "Не удалось загрузить ещё.",
  cancel: "Отменить",
  never: "Никогда",
  you: "Вы",
  dateAtTime: (date: string, time: string) => `${date}, ${time}`,
  kilobytes: "КБ",
  megabytes: "МБ",

  // --- Аналитика (тексты разделов — analyticsCopy.ts) ---
  an: ANALYTICS_RU,
  webFunnelHeading: "Все события страницы установки",
  webFunnelFooter:
    "Шаги установки и первого запуска веб-приложения за период: сколько раз и (в скобках) с разных устройств. Подробнее — scripts/funnel.py.",
  webFunnelEmpty: "За период событий нет",
  webFunnelLoadFailed: "Не удалось загрузить воронку",
  webFunnelSteps: {
    landing_view: "Открыли страницу",
    desktop_qr_view: "Открыли на компьютере (QR)",
    choose_telegram: "Выбрали Telegram",
    choose_install: "Выбрали «Установить»",
    inapp_escape_attempt: "Переход из Threads/Instagram в браузер",
    inapp_hint_shown: "Подсказка «Открыть в браузере»",
    install_screen_view: "Экран установки",
    install_prompt_shown: "Кнопка установки Android",
    install_prompt_accepted: "Согласились установить",
    install_prompt_dismissed: "Отказались от установки",
    app_installed: "Установили (Android)",
    first_standalone_launch: "Первый запуск с рабочего стола",
    first_habit_created: "Первая привычка",
    first_checkin: "Первая отметка",
    push_permission_granted: "Разрешили уведомления",
    push_permission_denied: "Запретили уведомления",
    account_linked: "Привязали вход",
  } as Record<string, string>,
  today: "Сегодня",
  todaySoFar: "Сегодня, день ещё идёт",
  showTable: "Показать таблицей",
  showChart: "Показать графиком",
  tableDate: "Дата",
  tableValue: "Значение",
  tableUsers: "Пользователей",

  // --- Пользователи ---
  usersTitle: "Пользователи",
  usersSearch: "Имя, @username или ID",
  usersSearchClear: "Очистить",
  usersLoadFailed: "Не удалось загрузить пользователей",
  usersEmpty: "Пока нет пользователей",
  blockedTag: "Заблокирован",
  unnamedUser: (telegramId: number) => `Пользователь ${telegramId}`,
  usersFound: (count: number) =>
    `${ru(count)} ${plural(count, "пользователь", "пользователя", "пользователей")}`,
  usersNoMatches: "Никто не подходит под эти фильтры",

  // --- Фильтры пользователей и получателей рассылки ---
  filters: "Фильтры",
  filtersTitle: "Фильтры",
  filtersFooter:
    "Условия складываются: показываются пользователи, которые подходят под все выбранные сразу.",
  filtersReset: "Сбросить фильтры",
  filtersShow: (count: number | null) => (count === null ? "Показать" : `Показать · ${ru(count)}`),
  filtersCount: (count: number | null) =>
    count === null
      ? "Считаем…"
      : `Подходят: ${ru(count)} ${plural(count, "пользователь", "пользователя", "пользователей")}`,
  removeFilter: (label: string) => `Убрать фильтр «${label}»`,
  filterAny: "Все",
  filterNames: {
    app: "Приложение",
    habits: "Привычки",
    activity: "Активность",
    joined: "Появились",
    platform: "Платформа",
    device: "Телефон",
    source: "Источник",
    activated: "Активация",
    stuck: "Застряли",
    uninstalled: "Удаление",
    reminders: "Напоминания",
    streak: "Серия",
    language: "Язык",
    reviews: "Отзывы",
    bot: "Бот",
    access: "Блокировка",
    test: "Тестовые",
  } as Record<AudienceKey, string>,
  filterValues: {
    app: { opened: "Открывали приложение", never: "Не открывали приложение" },
    habits: { any: "Добавили привычку", none: "Не добавили привычку" },
    activity: {
      "1d": "Заходили за 24 часа",
      "7d": "Заходили за 7 дней",
      "30d": "Заходили за 30 дней",
      inactive_3d: "Не заходят 3+ дня",
      inactive_7d: "Не заходят 7+ дней",
      inactive_14d: "Не заходят 14+ дней",
      inactive_30d: "Не заходят 30+ дней",
    },
    joined: {
      today: "Новые сегодня",
      "1d": "Новые за 24 часа",
      "7d": "Новые за 7 дней",
      "30d": "Новые за 30 дней",
      "90d": "Новые за 90 дней",
    },
    platform: { telegram: "Из Telegram", web: "Из веб-приложения" },
    device: { ios: "iPhone", android: "Android", desktop: "Компьютер" },
    source: {
      threads: "Threads",
      instagram: "Instagram",
      friends: "Друзья",
      direct: "Напрямую",
      other: "Другой источник",
    },
    activated: { yes: "Активированы", no: "Не активированы" },
    stuck: {
      no_open: "Запустили бота, не открыли приложение",
      no_habit: "Открыли, не добавили привычку",
      no_checkin: "Добавили привычку, ни разу не отметили",
      not_activated: "Отмечали, но не активировались",
    },
    uninstalled: { likely: "Вероятно удалили веб-приложение" },
    reminders: { any: "Есть напоминания", none: "Без напоминаний" },
    streak: { "3": "Серия от 3 дней", "7": "Серия от 7 дней", "14": "Серия от 14 дней", "30": "Серия от 30 дней" },
    language: { ru: "Русский язык", en: "Английский язык" },
    reviews: { any: "Оставляли отзыв", none: "Не оставляли отзыв" },
    bot: { ok: "Бот не заблокирован", blocked: "Заблокировали бота" },
    access: { ok: "Не заблокированы админом", blocked: "Заблокированы админом" },
    test: { yes: "Тестовые аккаунты", no: "Без тестовых аккаунтов" },
  } as Record<AudienceKey, Record<string, string>>,

  // --- Профиль пользователя ---
  profileLoadFailed: "Не удалось загрузить пользователя",
  profileHeading: "Профиль",
  profileTelegramId: "Telegram ID",
  profileUsername: "Username",
  profileLanguage: "Язык",
  profileTimezone: "Часовой пояс",
  profileRegistered: "Регистрация",
  profileOpenedApp: "Первое открытие",
  profileLastActive: "Последний визит",
  profileHabits: "Привычки",
  profileNotifications: "Уведомления в Telegram",
  profileNotificationsOn: "Вкл.",
  profileNotificationsOff: "Выкл.",
  profileStatus: "Статус",
  statusActive: "Активен",
  statusBlocked: "Заблокирован",
  statusBotBlocked: "Заблокировал бота",
  statusAdmin: "Администратор",
  languageNames: { ru: "Русский", en: "Английский" } as Record<string, string>,
  notSet: "Не выбран",
  profileReviewsHeading: "Отзывы",
  actionsHeading: "Действия",
  sendMessage: "Написать сообщение",
  blockUser: "Заблокировать",
  unblockUser: "Разблокировать",
  deleteUser: "Удалить пользователя",
  adminNoActions:
    "Администратора нельзя заблокировать или удалить. Сначала заберите права администратора в настройках.",
  blockFailed: "Не удалось изменить блокировку. Попробуйте ещё раз.",

  blockDialogTitle: "Заблокировать",
  blockDialogMessage: (name: string) =>
    `${name} не сможет пользоваться приложением и перестанет получать напоминания и рассылки. Разблокировать можно позже.`,
  blockDialogConfirm: "Заблокировать",
  deleteDialogTitle: "Удалить пользователя",
  deleteDialogMessage: (name: string) =>
    `Привычки, история и отзывы пользователя ${name} удалятся навсегда. Если пользователь снова откроет приложение, всё начнётся с чистого листа.`,
  deleteDialogConfirm: "Удалить",
  deleteFailed: "Не удалось удалить пользователя. Попробуйте ещё раз.",

  messageTitle: "Сообщение",
  messageDescription: (name: string) => `Бот пришлёт его пользователю ${name} в Telegram.`,
  messagePlaceholder: "Сообщение",
  send: "Отправить",
  messageSentTitle: "Сообщение отправлено",
  messageSentMessage: "Оно в чате пользователя с ботом.",
  done: "Готово",
  messageFailed: "Не удалось отправить сообщение. Попробуйте ещё раз.",

  // --- Привычки пользователя (тот же список, что видит он сам) ---
  habitsTitle: "Привычки",
  habitsLoadFailed: "Не удалось загрузить привычки",
  habitsEmpty: "Нет привычек",
  habitsEmptyDescription: "У этого пользователя пока нет привычек",

  // --- Отзывы ---
  reviewsTitle: "Отзывы",
  reviewsLoadFailed: "Не удалось загрузить отзывы",
  reviewsEmpty: "Пока нет отзывов",
  replied: "Есть ответ",
  reviewTitle: "Отзыв",
  reviewLoadFailed: "Не удалось загрузить отзыв",
  reviewAuthorHeading: "От кого",
  reviewHeading: "Отзыв",
  reviewReplyHeading: "Ваш ответ",
  reply: "Ответить",
  replyAgain: "Ответить ещё раз",
  replyTitle: "Ответ на отзыв",
  replyDescription: "Бот пришлёт ответ автору в Telegram вместе с цитатой отзыва.",
  replyPlaceholder: "Ваш ответ",
  replySentTitle: "Ответ отправлен",
  replySentMessage: "Он в чате автора с ботом.",
  replyFailed: "Не удалось отправить ответ. Попробуйте ещё раз.",
  sentOn: (date: string) => `Отправлено ${date}`,

  // --- Рассылка ---
  broadcastTitle: "Рассылка",
  audienceSection: "Кому",
  audienceAll: "всем пользователям",
  recipientsCounting: "Считаем получателей…",
  recipientsFailed: "Не удалось посчитать получателей.",
  recipients: (count: number) =>
    `${ru(count)} ${plural(count, "получатель", "получателя", "получателей")}. Условия складываются. Копия придёт вам первой, заблокировавшим бота рассылка не отправляется.`,
  messageSection: "Сообщение",
  broadcastPlaceholder: "Текст сообщения",
  characters: (count: number, limit: number, caption: boolean) =>
    `${ru(count)} / ${ru(limit)}${caption ? " · подпись" : ""}`,
  mediaSection: "Фото или видео",
  addMedia: "Добавить фото или видео",
  removeMedia: "Убрать",
  mediaFooter: "Фото JPEG, PNG или WebP до 10 МБ либо видео MP4 до 50 МБ. Текст станет подписью.",
  mediaUnsupported: "Выберите фото JPEG, PNG или WebP либо видео MP4.",
  mediaTooLarge: "Файл слишком большой: фото — до 10 МБ, видео — до 50 МБ.",
  buttonSection: "Кнопка",
  buttonRow: "Под сообщением",
  buttonNames: {
    "": "Без кнопки",
    open_app: "Открыть приложение",
    review: "Написать отзыв",
    new_habit: "Добавить привычку",
  } as Record<BroadcastButton, string>,
  buttonFooters: {
    "": "Можно добавить кнопку, которая открывает приложение.",
    open_app: "Открывает приложение. Подпись — на языке получателя.",
    review: "Открывает приложение сразу на экране отзыва. Подпись — на языке получателя.",
    new_habit:
      "Открывает приложение сразу на форме новой привычки. Подпись — на языке получателя.",
  } as Record<BroadcastButton, string>,
  sendBroadcast: "Отправить рассылку",
  sendDialogTitle: "Отправить рассылку",
  sendDialogMessage: (count: number, audience: string) =>
    `Отправить сообщение ${ru(count)} ${plural(count, "получателю", "получателям", "получателям")} (${audience})? Копия придёт вам первой.`,
  sendDialogConfirm: "Отправить",
  broadcastFailed: "Не удалось отправить рассылку. Попробуйте ещё раз.",
  lastBroadcast: "Последняя рассылка",
  broadcastWaiting: "Ждём, когда бот начнёт рассылку…",
  broadcastProgress: (sent: number, total: number) => `Отправка… ${ru(sent)} из ${ru(total)}`,
  broadcastDone: "Разослано",
  broadcastResult: (sent: number, failed: number) =>
    `Доставлено: ${ru(sent)}${failed ? ` · не доставлено: ${ru(failed)}` : ""}`,
  broadcastProgressLabel: "Ход рассылки",
  broadcastTotal: (total: number) => `всего ${ru(total)}`,

  // --- Настройки админ-панели ---
  settingsTitle: "Настройки",
  adminsHeading: "Администраторы",
  adminsLoadFailed: "Не удалось загрузить администраторов",
  adminsFooter:
    "Администраторы видят «Админ-панель» в настройках. Нажмите на администратора, чтобы забрать права.",
  addAdmin: "Добавить администратора",
  addAdminTitle: "Новый администратор",
  addAdminDescription:
    "Введите Telegram ID пользователя. «Админ-панель» появится в его настройках при следующем открытии приложения.",
  addAdminPlaceholder: "Telegram ID",
  add: "Добавить",
  addAdminFailed: "Не удалось добавить администратора. Попробуйте ещё раз.",
  addAdminInvalid: "Введите Telegram ID — только цифры.",
  removeAdminTitle: "Забрать права",
  removeAdminMessage: (name: string) => `${name} больше не сможет открыть админ-панель.`,
  removeAdminConfirm: "Забрать",
  removeAdminFailed: "Не удалось забрать права. Попробуйте ещё раз.",
  returnToApp: "Вернуться в приложение",

  // --- Причины недоставки ---
  undelivered: {
    bot_blocked: "Не доставлено — пользователь заблокировал бота.",
    chat_not_found: "Не доставлено — пользователь ни разу не запускал бота.",
  } as Record<UndeliveredReason, string>,

  // Ошибки API по кодам; кода нет в списке — текст про само действие.
  apiErrors: {
    network_error: "Нет связи с сервером",
    invalid_init_data: "Не удалось подтвердить личность Telegram. Откройте приложение заново.",
    missing_init_data: "Не удалось подтвердить личность Telegram. Откройте приложение заново.",
    rate_limited: "Слишком много действий подряд — подождите пару секунд",
    admin_required: "Вы больше не администратор",
    user_not_found: "Этого пользователя больше нет",
    user_is_admin: "Администратора нельзя заблокировать или удалить",
    review_not_found: "Этого отзыва больше нет",
    admin_exists: "Этот пользователь уже администратор",
    admin_not_found: "Этот пользователь уже не администратор",
    cannot_remove_self: "Себя убрать нельзя — попросите другого администратора",
    invalid_message: "Введите сообщение (до 4 096 символов, подпись — до 1 024)",
    invalid_filter: "Такого фильтра нет — обновите приложение",
    invalid_button: "Такой кнопки нет — обновите приложение",
    app_url_missing: "На сервере не задан адрес приложения — кнопку не добавить",
    invalid_period: "Такого периода нет — обновите приложение",
    invalid_metric: "Эту цифру нельзя открыть списком — обновите приложение",
    invalid_config: "Дней с отметками не может быть больше, чем дней в окне",
    segment_not_found: "Эта группа больше не существует",
    invalid_media: "Telegram не сможет отправить этот файл — нужен JPEG, PNG, WebP или MP4",
    media_too_large: "Файл слишком большой: фото — до 10 МБ, видео — до 50 МБ",
    payload_too_large: "Файл слишком большой: фото — до 10 МБ, видео — до 50 МБ",
    no_recipients: "Под эти фильтры никто не подходит",
    admin_chat_unavailable: "Сначала запустите бота — копия каждой рассылки приходит вам",
    telegram_rejected: "Telegram не принял это сообщение",
    telegram_busy: "Telegram просит подождать — попробуйте через минуту",
    telegram_error: "Не удалось связаться с Telegram — попробуйте ещё раз",
  } as Partial<Record<ApiErrorCode, string>>,
};

export type AdminStrings = typeof RU;

const EN: AdminStrings = {
  tabAnalytics: "Analytics",
  tabUsers: "Users",
  tabReviews: "Reviews",
  tabBroadcast: "Broadcast",
  tabSettings: "Settings",

  loading: "Loading…",
  errorTitle: "Something went wrong",
  retry: "Try Again",
  nothingFound: "No Results",
  loadMoreFailed: "Couldn’t load more.",
  cancel: "Cancel",
  never: "Never",
  you: "You",
  dateAtTime: (date: string, time: string) => `${date} at ${time}`,
  kilobytes: "KB",
  megabytes: "MB",

  an: ANALYTICS_EN,
  webFunnelHeading: "All install page events",
  webFunnelFooter:
    "Install and first-launch steps of the web app for the period: times and (in brackets) distinct devices. More — scripts/funnel.py.",
  webFunnelEmpty: "No events in this period",
  webFunnelLoadFailed: "Couldn’t load the funnel",
  webFunnelSteps: {
    landing_view: "Opened the page",
    desktop_qr_view: "Opened on a computer (QR)",
    choose_telegram: "Chose Telegram",
    choose_install: "Chose “Install”",
    inapp_escape_attempt: "Jump from Threads/Instagram to browser",
    inapp_hint_shown: "“Open in browser” hint",
    install_screen_view: "Install screen",
    install_prompt_shown: "Android install button",
    install_prompt_accepted: "Accepted install",
    install_prompt_dismissed: "Dismissed install",
    app_installed: "Installed (Android)",
    first_standalone_launch: "First launch from home screen",
    first_habit_created: "First habit",
    first_checkin: "First check-in",
    push_permission_granted: "Allowed notifications",
    push_permission_denied: "Denied notifications",
    account_linked: "Linked a login",
  },
  today: "Today",
  todaySoFar: "Today so far",
  showTable: "Show as table",
  showChart: "Show as chart",
  tableDate: "Date",
  tableValue: "Value",
  tableUsers: "Users",

  usersTitle: "Users",
  usersSearch: "Name, @username or ID",
  usersSearchClear: "Clear",
  usersLoadFailed: "Couldn’t load users",
  usersEmpty: "No users yet",
  blockedTag: "Blocked",
  unnamedUser: (telegramId: number) => `User ${telegramId}`,
  usersFound: (count: number) => `${en(count)} ${count === 1 ? "user" : "users"}`,
  usersNoMatches: "No one matches these filters",

  filters: "Filters",
  filtersTitle: "Filters",
  filtersFooter: "Conditions combine: you see users who match all of the selected ones.",
  filtersReset: "Reset Filters",
  filtersShow: (count: number | null) => (count === null ? "Show" : `Show · ${en(count)}`),
  filtersCount: (count: number | null) =>
    count === null ? "Counting…" : `${en(count)} ${count === 1 ? "user matches" : "users match"}`,
  removeFilter: (label: string) => `Remove filter “${label}”`,
  filterAny: "Any",
  filterNames: {
    app: "App",
    habits: "Habits",
    activity: "Activity",
    joined: "Joined",
    platform: "Platform",
    device: "Phone",
    source: "Source",
    activated: "Activation",
    stuck: "Stuck",
    uninstalled: "Uninstall",
    reminders: "Reminders",
    streak: "Streak",
    language: "Language",
    reviews: "Reviews",
    bot: "Bot",
    access: "Access",
    test: "Test",
  },
  filterValues: {
    app: { opened: "Opened the app", never: "Never opened the app" },
    habits: { any: "Added a habit", none: "No habits added" },
    activity: {
      "1d": "Active in 24 hours",
      "7d": "Active in 7 days",
      "30d": "Active in 30 days",
      inactive_3d: "Away 3+ days",
      inactive_7d: "Away 7+ days",
      inactive_14d: "Away 14+ days",
      inactive_30d: "Away 30+ days",
    },
    joined: {
      today: "New today",
      "1d": "New in 24 hours",
      "7d": "New in 7 days",
      "30d": "New in 30 days",
      "90d": "New in 90 days",
    },
    platform: { telegram: "From Telegram", web: "From the web app" },
    device: { ios: "iPhone", android: "Android", desktop: "Computer" },
    source: {
      threads: "Threads",
      instagram: "Instagram",
      friends: "Friends",
      direct: "Direct",
      other: "Other source",
    },
    activated: { yes: "Activated", no: "Not activated" },
    stuck: {
      no_open: "Started the bot, never opened the app",
      no_habit: "Opened, no habit added",
      no_checkin: "Added a habit, never checked off",
      not_activated: "Checked off but not activated",
    },
    uninstalled: { likely: "Likely uninstalled the web app" },
    reminders: { any: "Have reminders", none: "No reminders" },
    streak: { "3": "Streak 3+ days", "7": "Streak 7+ days", "14": "Streak 14+ days", "30": "Streak 30+ days" },
    language: { ru: "Russian", en: "English" },
    reviews: { any: "Left a review", none: "No reviews" },
    bot: { ok: "Bot not blocked", blocked: "Blocked the bot" },
    access: { ok: "Not blocked by admin", blocked: "Blocked by admin" },
    test: { yes: "Test accounts", no: "No test accounts" },
  },

  profileLoadFailed: "Couldn’t load this user",
  profileHeading: "Profile",
  profileTelegramId: "Telegram ID",
  profileUsername: "Username",
  profileLanguage: "Language",
  profileTimezone: "Time Zone",
  profileRegistered: "Registered",
  profileOpenedApp: "Opened the App",
  profileLastActive: "Last Active",
  profileHabits: "Habits",
  profileNotifications: "Telegram Notifications",
  profileNotificationsOn: "On",
  profileNotificationsOff: "Off",
  profileStatus: "Status",
  statusActive: "Active",
  statusBlocked: "Blocked",
  statusBotBlocked: "Blocked the bot",
  statusAdmin: "Admin",
  languageNames: { ru: "Russian", en: "English" },
  notSet: "Not Set",
  profileReviewsHeading: "Reviews",
  actionsHeading: "Actions",
  sendMessage: "Send Message",
  blockUser: "Block User",
  unblockUser: "Unblock User",
  deleteUser: "Delete User",
  adminNoActions: "Admins can’t be blocked or deleted. Remove their admin rights in Settings first.",
  blockFailed: "Couldn’t update the block. Please try again.",

  blockDialogTitle: "Block User",
  blockDialogMessage: (name: string) =>
    `${name} won’t be able to use the app and won’t get reminders or broadcasts. You can unblock them later.`,
  blockDialogConfirm: "Block",
  deleteDialogTitle: "Delete User",
  deleteDialogMessage: (name: string) =>
    `This permanently deletes ${name}’s habits, history and reviews. If they open the app again, they’ll start from scratch.`,
  deleteDialogConfirm: "Delete",
  deleteFailed: "Couldn’t delete the user. Please try again.",

  messageTitle: "Send Message",
  messageDescription: (name: string) => `The bot sends this to ${name} in Telegram.`,
  messagePlaceholder: "Message",
  send: "Send",
  messageSentTitle: "Message Sent",
  messageSentMessage: "It’s in their Telegram chat with the bot.",
  done: "Done",
  messageFailed: "Couldn’t send the message. Please try again.",

  habitsTitle: "Habits",
  habitsLoadFailed: "Couldn’t load their habits",
  habitsEmpty: "No Habits",
  habitsEmptyDescription: "This user hasn’t created any habits yet",

  reviewsTitle: "Reviews",
  reviewsLoadFailed: "Couldn’t load reviews",
  reviewsEmpty: "No reviews yet",
  replied: "Replied",
  reviewTitle: "Review",
  reviewLoadFailed: "Couldn’t load this review",
  reviewAuthorHeading: "From",
  reviewHeading: "Review",
  reviewReplyHeading: "Your Reply",
  reply: "Reply",
  replyAgain: "Send Another Reply",
  replyTitle: "Reply to Review",
  replyDescription: "The bot sends your reply to them in Telegram, quoting their review.",
  replyPlaceholder: "Your reply",
  replySentTitle: "Reply Sent",
  replySentMessage: "It’s in their Telegram chat with the bot.",
  replyFailed: "Couldn’t send the reply. Please try again.",
  sentOn: (date: string) => `Sent ${date}`,

  broadcastTitle: "Broadcast",
  audienceSection: "Recipients",
  audienceAll: "all users",
  recipientsCounting: "Counting recipients…",
  recipientsFailed: "Couldn’t count recipients.",
  recipients: (count: number) =>
    `${en(count)} ${count === 1 ? "recipient" : "recipients"}. Conditions combine. You get a copy first. People who blocked the bot are skipped.`,
  messageSection: "Message",
  broadcastPlaceholder: "Text of the message",
  characters: (count: number, limit: number, caption: boolean) =>
    `${en(count)} / ${en(limit)}${caption ? " · caption" : ""}`,
  mediaSection: "Photo or Video",
  addMedia: "Add Photo or Video",
  removeMedia: "Remove",
  mediaFooter: "JPEG, PNG or WebP up to 10 MB, or an MP4 video up to 50 MB. The text becomes its caption.",
  mediaUnsupported: "Choose a JPEG, PNG or WebP photo, or an MP4 video.",
  mediaTooLarge: "This file is too large: photos up to 10 MB, videos up to 50 MB.",
  buttonSection: "Button",
  buttonRow: "Below the Message",
  buttonNames: {
    "": "None",
    open_app: "Open App",
    review: "Write a Review",
    new_habit: "Add a Habit",
  },
  buttonFooters: {
    "": "You can add a button that opens the app.",
    open_app: "Opens the app. The label is in the recipient’s language.",
    review: "Opens the app right on the review screen. The label is in the recipient’s language.",
    new_habit:
      "Opens the app right on the new habit form. The label is in the recipient’s language.",
  },
  sendBroadcast: "Send Broadcast",
  sendDialogTitle: "Send Broadcast",
  sendDialogMessage: (count: number, audience: string) =>
    `Send this message to ${en(count)} ${count === 1 ? "person" : "people"} (${audience})? You’ll get a copy first.`,
  sendDialogConfirm: "Send",
  broadcastFailed: "Couldn’t send the broadcast. Please try again.",
  lastBroadcast: "Last Broadcast",
  broadcastWaiting: "Waiting for the bot to start sending…",
  broadcastProgress: (sent: number, total: number) => `Sending… ${en(sent)} of ${en(total)}`,
  broadcastDone: "Sent",
  broadcastResult: (sent: number, failed: number) =>
    `Delivered to ${en(sent)}${failed ? ` · ${en(failed)} not delivered` : ""}`,
  broadcastProgressLabel: "Broadcast progress",
  broadcastTotal: (total: number) => `${en(total)} total`,

  settingsTitle: "Settings",
  adminsHeading: "Admins",
  adminsLoadFailed: "Couldn’t load admins",
  adminsFooter: "Admins see Admin Panel in Settings. Tap an admin to remove them.",
  addAdmin: "Add Admin",
  addAdminTitle: "Add Admin",
  addAdminDescription:
    "Enter their Telegram ID. They’ll see Admin Panel in Settings the next time they open the app.",
  addAdminPlaceholder: "Telegram ID",
  add: "Add",
  addAdminFailed: "Couldn’t add the admin. Please try again.",
  addAdminInvalid: "Enter a Telegram ID — digits only.",
  removeAdminTitle: "Remove Admin",
  removeAdminMessage: (name: string) => `${name} will lose access to the admin panel.`,
  removeAdminConfirm: "Remove",
  removeAdminFailed: "Couldn’t remove the admin. Please try again.",
  returnToApp: "Return to App",

  undelivered: {
    bot_blocked: "Not delivered — this person has blocked the bot.",
    chat_not_found: "Not delivered — this person has never started the bot.",
  },

  apiErrors: {
    network_error: "No connection to the server",
    invalid_init_data: "Couldn’t verify your Telegram account. Please reopen the app.",
    missing_init_data: "Couldn’t verify your Telegram account. Please reopen the app.",
    rate_limited: "Too many actions in a row — wait a couple of seconds",
    admin_required: "You’re no longer an admin",
    user_not_found: "This user no longer exists",
    user_is_admin: "Admins can’t be blocked or deleted",
    review_not_found: "This review no longer exists",
    admin_exists: "They’re already an admin",
    admin_not_found: "They’re no longer an admin",
    cannot_remove_self: "You can’t remove yourself — ask another admin",
    invalid_message: "Enter a message (up to 4,096 characters, or 1,024 for a caption)",
    invalid_filter: "This filter doesn’t exist — please update the app",
    invalid_button: "This button doesn’t exist — please update the app",
    app_url_missing: "The server has no app address set — can’t add a button",
    invalid_period: "This period doesn’t exist — please update the app",
    invalid_metric: "This number can’t be opened as a list — please update the app",
    invalid_config: "Days with check-ins can’t exceed the window",
    segment_not_found: "This group no longer exists",
    invalid_media: "Telegram can’t send this file — use a JPEG, PNG, WebP or MP4",
    media_too_large: "This file is too large: photos up to 10 MB, videos up to 50 MB",
    payload_too_large: "This file is too large: photos up to 10 MB, videos up to 50 MB",
    no_recipients: "No one matches these filters",
    admin_chat_unavailable: "Start the bot first — you get a copy of every broadcast",
    telegram_rejected: "Telegram didn’t accept this message",
    telegram_busy: "Telegram asked us to slow down — try again in a minute",
    telegram_error: "Couldn’t reach Telegram — try again",
  },
};

/** Строки админ-панели по языкам. */
export const ADMIN_STRINGS: Record<Language, AdminStrings> = { ru: RU, en: EN };

/** Строки админ-панели на текущем языке интерфейса. */
export function useAdminStrings(): AdminStrings {
  return ADMIN_STRINGS[useLanguage()];
}

/** Текст ошибки для админ-панели: подпись кода ошибки API или `fallback`. */
export function describeAdminError(
  strings: AdminStrings,
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ApiRequestError) {
    return strings.apiErrors[error.code] ?? fallback;
  }
  return fallback;
}
