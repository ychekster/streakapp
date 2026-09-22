/**
 * Вся копия админ-панели — только на английском (как и сама панель, независимо от языка
 * приложения). Ни одной строки-сообщения прямо в экранах админ-панели: они берут строки
 * отсюда, а ошибки API показывают по коду (describeAdminError).
 */

import { ApiRequestError, type ApiErrorCode } from "./api/client";
import type { UndeliveredReason } from "./types/admin";

export const ADMIN_STRINGS = {
  // --- Нижняя навигация ---
  tabAnalytics: "Analytics",
  tabPeople: "People",
  tabBroadcast: "Broadcast",
  tabSettings: "Settings",

  // --- Общие состояния ---
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

  // --- Аналитика ---
  analyticsTitle: "Analytics",
  analyticsLoadFailed: "Couldn’t load analytics",
  period: "Period",
  periodNames: { 7: "Last 7 Days", 30: "Last 30 Days", 90: "Last 90 Days" } as Record<number, string>,
  periodDays: (days: number) => `Last ${days} Days`,
  usersHeading: "Users",
  statTotalUsers: "Total users",
  statNewWeek: "New · 7 days",
  statNewMonth: "New · 30 days",
  statActiveNow: "Online now",
  chartTotalUsers: "Total users",
  chartTotalUsersNote: (added: number, period: string) =>
    added === 1 ? `+1 new user · ${period}` : `+${added} new users · ${period}`,
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
  habitsBucketUsers: (users: number, habits: number, openEnded: boolean) =>
    `${users === 1 ? "1 user" : `${users} users`} with ${openEnded ? `${habits} or more` : habits} ${
      habits === 1 && !openEnded ? "habit" : "habits"
    }`,
  completionHeading: "Completion",
  chartCompletion: "Daily completion rate",
  chartCompletionNote: (period: string) => `Average · ${period}`,
  completionPoint: (completed: number, scheduled: number) =>
    `${completed} of ${scheduled} scheduled`,
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
  tableShare: "Share",

  // --- Люди ---
  peopleTitle: "People",
  peopleUsers: "Users",
  peopleReviews: "Reviews",

  // --- Пользователи ---
  usersTitle: "Users",
  usersSearch: "Name, @username or ID",
  usersSearchClear: "Clear",
  usersLoadFailed: "Couldn’t load users",
  usersEmpty: "No users yet",
  blockedTag: "Blocked",
  unnamedUser: (telegramId: number) => `User ${telegramId}`,

  // --- Профиль пользователя ---
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
  languageNames: { ru: "Russian", en: "English" } as Record<string, string>,
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

  messageDialogTitle: "Send Message",
  messageDialogMessage: (name: string) => `The bot sends this to ${name} in Telegram.`,
  messagePlaceholder: "Message",
  send: "Send",
  messageSentTitle: "Message Sent",
  messageSentMessage: "It’s in their Telegram chat with the bot.",
  done: "OK",
  messageFailed: "Couldn’t send the message. Please try again.",

  // --- Отзывы ---
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
  replyDialogTitle: "Reply to Review",
  replyDialogMessage: "The bot sends your reply to them in Telegram, quoting their review.",
  replyPlaceholder: "Your reply",
  replySentTitle: "Reply Sent",
  replySentMessage: "It’s in their Telegram chat with the bot.",
  replyFailed: "Couldn’t send the reply. Please try again.",
  sentOn: (date: string) => `Sent ${date}`,

  // --- Рассылка ---
  broadcastTitle: "Broadcast",
  broadcastLoadFailed: "Couldn’t load audiences",
  audienceSection: "Audience",
  sendTo: "Send To",
  segmentNames: {
    all: "All Users",
    active_7d: "Active in Last 7 Days",
    active_30d: "Active in Last 30 Days",
    never_opened: "Never Opened the App",
  } as Record<string, string>,
  recipients: (count: number) =>
    `${count === 1 ? "1 recipient" : `${count.toLocaleString("en-US")} recipients`}. You get a copy first. People who blocked the bot are skipped.`,
  messageSection: "Message",
  broadcastPlaceholder: "Text of the message",
  characters: (count: number, limit: number) =>
    `${count.toLocaleString("en-US")} / ${limit.toLocaleString("en-US")}${
      limit < 4096 ? " · caption" : ""
    }`,
  mediaSection: "Photo or Video",
  addMedia: "Add Photo or Video",
  removeMedia: "Remove",
  mediaFooter: "JPEG, PNG or WebP up to 10 MB, or an MP4 video up to 50 MB. The text becomes its caption.",
  mediaUnsupported: "Choose a JPEG, PNG or WebP photo, or an MP4 video.",
  mediaTooLarge: "This file is too large: photos up to 10 MB, videos up to 50 MB.",
  sendBroadcast: "Send Broadcast",
  sendDialogTitle: "Send Broadcast",
  sendDialogMessage: (count: number, segment: string) =>
    `Send this message to ${count === 1 ? "1 person" : `${count.toLocaleString("en-US")} people`} (${segment})? You’ll get a copy first.`,
  sendDialogConfirm: "Send",
  broadcastFailed: "Couldn’t send the broadcast. Please try again.",
  lastBroadcast: "Last Broadcast",
  broadcastWaiting: "Waiting for the bot to start sending…",
  broadcastProgress: (sent: number, total: number) =>
    `Sending… ${sent.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`,
  broadcastDone: "Sent",
  broadcastResult: (sent: number, failed: number) =>
    `Delivered to ${sent.toLocaleString("en-US")}${
      failed ? ` · ${failed.toLocaleString("en-US")} not delivered` : ""
    }`,
  broadcastProgressLabel: "Broadcast progress",
  broadcastTotal: (total: number) => `${total.toLocaleString("en-US")} total`,

  // --- Настройки админ-панели ---
  settingsTitle: "Settings",
  adminsHeading: "Admins",
  adminsLoadFailed: "Couldn’t load admins",
  adminsFooter: "Admins see Admin Panel in Settings. Tap an admin to remove them.",
  addAdmin: "Add Admin",
  addAdminTitle: "Add Admin",
  addAdminMessage:
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

  // --- Причины недоставки ---
  undelivered: {
    bot_blocked: "Not delivered — this person has blocked the bot.",
    chat_not_found: "Not delivered — this person has never started the bot.",
  } as Record<UndeliveredReason, string>,

  // Ошибки API по кодам; кода нет в списке — текст про само действие.
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
  } as Partial<Record<ApiErrorCode, string>>,
};

/** Текст ошибки для админ-панели: подпись кода ошибки API или `fallback`. */
export function describeAdminError(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    return ADMIN_STRINGS.apiErrors[error.code] ?? fallback;
  }
  return fallback;
}
