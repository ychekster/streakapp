/**
 * Вся копия админ-панели — на русском и английском, как и у приложения: панель говорит на
 * языке интерфейса (его можно сменить и в её настройках). Ни одной строки-сообщения прямо
 * в экранах админ-панели: они берут строки текущего языка через useAdminStrings(), а
 * ошибки API показывают по коду (describeAdminError).
 */

import { ApiRequestError, type ApiErrorCode } from "./api/client";
import { useLanguage } from "./preferences";
import type { UndeliveredReason } from "./types/admin";
import type { Language } from "./types/settings";

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
  loadingEmoji: "⏳",
  loading: "Загрузка…",
  errorEmoji: "⚠️",
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

  // --- Аналитика ---
  analyticsTitle: "Аналитика",
  analyticsLoadFailed: "Не удалось загрузить аналитику",
  period: "Период",
  periodNames: {
    7: "Последние 7 дней",
    30: "Последние 30 дней",
    90: "Последние 90 дней",
  } as Record<number, string>,
  periodDays: (days: number) => `Последние ${days} ${plural(days, "день", "дня", "дней")}`,
  usersHeading: "Пользователи",
  statTotalUsers: "Всего пользователей",
  statNewWeek: "Новые · 7 дней",
  statNewMonth: "Новые · 30 дней",
  statActiveNow: "Сейчас в приложении",
  chartTotalUsers: "Всего пользователей",
  chartTotalUsersNote: (added: number, period: string) =>
    `+${ru(added)} ${plural(added, "новый пользователь", "новых пользователя", "новых пользователей")} · ${period}`,
  activityHeading: "Активность",
  statDau: "За день (DAU)",
  statWau: "За неделю (WAU)",
  statMau: "За месяц (MAU)",
  statStickiness: "Возвращаемость (DAU/MAU)",
  chartDau: "Активные за день",
  chartDauNote: (period: string) => `В среднем за день · ${period}`,
  audienceHeading: "Аудитория",
  chartAudience: "Все пользователи",
  audienceUsesApp: "Пользуются приложением",
  audienceNeverOpened: "Не открывали приложение",
  audienceBlockedBot: "Заблокировали бота",
  audienceFooter:
    "«Заблокировали бота» — в том числе те, кто не открывал приложение. Им не приходят напоминания и рассылки.",
  habitsHeading: "Привычки",
  statAverageHabits: "Привычек на пользователя",
  statTotalHabits: "Активных привычек",
  chartHabits: "Пользователи по числу привычек",
  chartHabitsNote: "Открывавшие приложение",
  habitsBucket: (habits: number, openEnded: boolean) => (openEnded ? `${habits}+` : String(habits)),
  habitsBucketUsers: (users: number, habits: number, openEnded: boolean) => {
    const who = `${ru(users)} ${plural(users, "пользователь", "пользователя", "пользователей")}`;
    if (openEnded) {
      return `${who} с ${habits} и более привычками`;
    }
    if (habits === 0) {
      return `${who} без привычек`;
    }
    return `${who} с ${habits} ${plural(habits, "привычкой", "привычками", "привычками")}`;
  },
  completionHeading: "Выполнение",
  chartCompletion: "Доля выполнения по дням",
  chartCompletionNote: (period: string) => `В среднем · ${period}`,
  completionPoint: (completed: number, scheduled: number) =>
    `${ru(completed)} из ${ru(scheduled)} запланированных`,
  nothingScheduled: "Ничего не запланировано",
  today: "Сегодня",
  todaySoFar: "Сегодня, день ещё идёт",
  showTable: "Показать таблицей",
  showChart: "Показать графиком",
  tableDate: "Дата",
  tableValue: "Значение",
  tableHabits: "Привычек",
  tableUsers: "Пользователей",
  tableGroup: "Группа",

  // --- Пользователи ---
  usersTitle: "Пользователи",
  usersSearch: "Имя, @username или ID",
  usersSearchClear: "Очистить",
  usersLoadFailed: "Не удалось загрузить пользователей",
  usersEmpty: "Пока нет пользователей",
  blockedTag: "Заблокирован",
  unnamedUser: (telegramId: number) => `Пользователь ${telegramId}`,

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
  sentEmoji: "✅",
  messageSentTitle: "Сообщение отправлено",
  messageSentMessage: "Оно в чате пользователя с ботом.",
  done: "Готово",
  messageFailed: "Не удалось отправить сообщение. Попробуйте ещё раз.",

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
  broadcastLoadFailed: "Не удалось загрузить получателей",
  audienceSection: "Аудитория",
  sendTo: "Кому",
  segmentNames: {
    all: "Все пользователи",
    active_7d: "Активные за 7 дней",
    active_30d: "Активные за 30 дней",
    never_opened: "Не открывали приложение",
  } as Record<string, string>,
  recipients: (count: number) =>
    `${ru(count)} ${plural(count, "получатель", "получателя", "получателей")}. Копия придёт вам первой, заблокировавшим бота рассылка не отправляется.`,
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
  sendBroadcast: "Отправить рассылку",
  sendDialogTitle: "Отправить рассылку",
  sendDialogMessage: (count: number, segment: string) =>
    `Отправить сообщение ${ru(count)} ${plural(count, "получателю", "получателям", "получателям")} («${segment}»)? Копия придёт вам первой.`,
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
    invalid_segment: "Выберите, кому отправить рассылку",
    invalid_media: "Telegram не сможет отправить этот файл — нужен JPEG, PNG, WebP или MP4",
    media_too_large: "Файл слишком большой: фото — до 10 МБ, видео — до 50 МБ",
    payload_too_large: "Файл слишком большой: фото — до 10 МБ, видео — до 50 МБ",
    no_recipients: "В этой аудитории пока никого нет",
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

  loadingEmoji: "⏳",
  loading: "Loading…",
  errorEmoji: "⚠️",
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

  analyticsTitle: "Analytics",
  analyticsLoadFailed: "Couldn’t load analytics",
  period: "Period",
  periodNames: { 7: "Last 7 Days", 30: "Last 30 Days", 90: "Last 90 Days" },
  periodDays: (days: number) => `Last ${days} Days`,
  usersHeading: "Users",
  statTotalUsers: "Total users",
  statNewWeek: "New · 7 days",
  statNewMonth: "New · 30 days",
  statActiveNow: "Online now",
  chartTotalUsers: "Total users",
  chartTotalUsersNote: (added: number, period: string) =>
    `+${en(added)} new ${added === 1 ? "user" : "users"} · ${period}`,
  activityHeading: "Activity",
  statDau: "Daily active",
  statWau: "Weekly active",
  statMau: "Monthly active",
  statStickiness: "Stickiness (DAU/MAU)",
  chartDau: "Daily active users",
  chartDauNote: (period: string) => `Daily average · ${period}`,
  audienceHeading: "Audience",
  chartAudience: "All users",
  audienceUsesApp: "Use the app",
  audienceNeverOpened: "Haven’t opened the app",
  audienceBlockedBot: "Blocked the bot",
  audienceFooter:
    "“Blocked the bot” includes people who never opened the app. They don’t get reminders or broadcasts.",
  habitsHeading: "Habits",
  statAverageHabits: "Avg habits per user",
  statTotalHabits: "Active habits",
  chartHabits: "Users by number of habits",
  chartHabitsNote: "People who opened the app",
  habitsBucket: (habits: number, openEnded: boolean) => (openEnded ? `${habits}+` : String(habits)),
  habitsBucketUsers: (users: number, habits: number, openEnded: boolean) => {
    const who = `${en(users)} ${users === 1 ? "user" : "users"}`;
    if (openEnded) {
      return `${who} with ${habits} or more habits`;
    }
    if (habits === 0) {
      return `${who} with no habits`;
    }
    return `${who} with ${habits} ${habits === 1 ? "habit" : "habits"}`;
  },
  completionHeading: "Completion",
  chartCompletion: "Daily completion rate",
  chartCompletionNote: (period: string) => `Average · ${period}`,
  completionPoint: (completed: number, scheduled: number) =>
    `${en(completed)} of ${en(scheduled)} scheduled`,
  nothingScheduled: "Nothing scheduled",
  today: "Today",
  todaySoFar: "Today so far",
  showTable: "Show as table",
  showChart: "Show as chart",
  tableDate: "Date",
  tableValue: "Value",
  tableHabits: "Habits",
  tableUsers: "Users",
  tableGroup: "Group",

  usersTitle: "Users",
  usersSearch: "Name, @username or ID",
  usersSearchClear: "Clear",
  usersLoadFailed: "Couldn’t load users",
  usersEmpty: "No users yet",
  blockedTag: "Blocked",
  unnamedUser: (telegramId: number) => `User ${telegramId}`,

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
  sentEmoji: "✅",
  messageSentTitle: "Message Sent",
  messageSentMessage: "It’s in their Telegram chat with the bot.",
  done: "Done",
  messageFailed: "Couldn’t send the message. Please try again.",

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
  broadcastLoadFailed: "Couldn’t load audiences",
  audienceSection: "Audience",
  sendTo: "Send To",
  segmentNames: {
    all: "All Users",
    active_7d: "Active in Last 7 Days",
    active_30d: "Active in Last 30 Days",
    never_opened: "Never Opened the App",
  },
  recipients: (count: number) =>
    `${en(count)} ${count === 1 ? "recipient" : "recipients"}. You get a copy first. People who blocked the bot are skipped.`,
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
  sendBroadcast: "Send Broadcast",
  sendDialogTitle: "Send Broadcast",
  sendDialogMessage: (count: number, segment: string) =>
    `Send this message to ${en(count)} ${count === 1 ? "person" : "people"} (${segment})? You’ll get a copy first.`,
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
    invalid_segment: "Choose who gets the broadcast",
    invalid_media: "Telegram can’t send this file — use a JPEG, PNG, WebP or MP4",
    media_too_large: "This file is too large: photos up to 10 MB, videos up to 50 MB",
    payload_too_large: "This file is too large: photos up to 10 MB, videos up to 50 MB",
    no_recipients: "Nobody is in this audience yet",
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
