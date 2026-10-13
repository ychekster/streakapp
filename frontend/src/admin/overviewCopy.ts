/**
 * Тексты главного экрана аналитики («Обзор») и профиля пользователя (ru и en) — часть
 * строк панели: `useAdminStrings().ov` (см. adminStrings.ts). Подписи — короткие, без
 * пояснений: экран должен читаться с одного взгляда.
 */

import type { AnalyticsSection, OverviewGroup } from "../types/admin";

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

export const OVERVIEW_RU = {
  // --- Обзор ---
  joinedHeading: "Пришли",
  today: "Сегодня",
  yesterday: "Вчера",
  week: "7 дней",
  month: "30 дней",
  totalUsers: "Всего пользователей",
  newChart: "Новые по дням",
  last30: "за 30 дней",

  whereHeading: "Где пользуются",
  telegram: "Telegram",
  web: "Веб-приложение",
  both: "И там, и там",
  botOnly: "Только запустили бота",
  webHeading: "Веб-приложение",
  webLoggedIn: "Вошли через Telegram",
  webGuests: "Без входа",

  activeHeading: "Заходят",
  online: "Сейчас",
  activeToday: "Сегодня",
  activeWeek: "7 дней",
  activeMonth: "30 дней",
  weekTelegram: "За неделю в Telegram",
  weekWeb: "За неделю в веб-приложении",
  checkedToday: "Отметили привычки сегодня",
  gone: "Не заходят больше 2 недель",
  activityChart: "Заходили по дням",

  habitsHeading: "Привычки",
  withHabits: "С привычками",
  withoutHabits: "Без привычек",
  habitsTotal: "Привычек всего",
  ofAll: (share: string) => `${share} от всех`,

  moreHeading: "Подробная аналитика",
  more: {
    summary: "Ключевые метрики",
    funnel: "Воронка",
    retention: "Удержание",
    churn: "Отток и возвраты",
    habits: "Какие привычки заводят",
    sources: "Откуда приходят",
    messaging: "Напоминания и рассылки",
  } as Partial<Record<AnalyticsSection, string>>,

  /** Заголовок списка людей за цифрой. */
  people: {
    new_today: "Пришли сегодня",
    new_yesterday: "Пришли вчера",
    new_week: "Пришли за 7 дней",
    new_month: "Пришли за 30 дней",
    all: "Все пользователи",
    telegram: "Пользуются в Telegram",
    web: "Пользуются веб-приложением",
    both: "Пользуются и там, и там",
    bot_only: "Только запустили бота",
    telegram_week: "Были в Telegram за неделю",
    web_week: "Были в веб-приложении за неделю",
    web_logged_in: "Вошли в веб-приложение через Telegram",
    web_guests: "Веб-приложение без входа",
    online: "Сейчас в приложении",
    active_today: "Заходили сегодня",
    active_week: "Заходили за 7 дней",
    active_month: "Заходили за 30 дней",
    checked_today: "Отметили привычки сегодня",
    gone: "Не заходят больше 2 недель",
    with_habits: "С привычками",
    without_habits: "Без привычек",
  } as Record<OverviewGroup, string>,

  // --- Профиль ---
  profileId: "ID",
  profileUsername: "Username",
  profileJoined: "Пришёл",
  profileSource: "Откуда",
  profileLastSeen: "Последний раз",
  whereUses: "Где пользуется",
  notUsed: "Не заходил",
  webLogin: "Вход в веб-приложение",
  webLoginTelegram: "Через Telegram",
  webLoginGuest: "Без входа",
  pushNotifications: "Push-уведомления",
  telegramNotifications: "Уведомления в Telegram",
  on: "Включены",
  off: "Выключены",
  botBlocked: "Заблокировал бота",
  device: "Устройство",
  habitsHeading2: (count: number) =>
    `${count} ${plural(count, "привычка", "привычки", "привычек")}`,
  noHabits: "Привычек нет",
  streakDays: (days: number) => `${days} ${plural(days, "день", "дня", "дней")} подряд`,
  openHabits: "Как у него в приложении",
  testAccount: "Не учитывать в аналитике",
  details: "Подробнее о пользователе",
  detailsTitle: "Подробнее",
  activityHeading: "Активность",
  settingsHeading: "Настройки",
  history: "История действий",
};

export type OverviewCopy = typeof OVERVIEW_RU;

export const OVERVIEW_EN: OverviewCopy = {
  joinedHeading: "Joined",
  today: "Today",
  yesterday: "Yesterday",
  week: "7 days",
  month: "30 days",
  totalUsers: "Total users",
  newChart: "New users by day",
  last30: "in 30 days",

  whereHeading: "Where they use it",
  telegram: "Telegram",
  web: "Web app",
  both: "Both",
  botOnly: "Only started the bot",
  webHeading: "Web app",
  webLoggedIn: "Logged in with Telegram",
  webGuests: "Not logged in",

  activeHeading: "Coming back",
  online: "Right now",
  activeToday: "Today",
  activeWeek: "7 days",
  activeMonth: "30 days",
  weekTelegram: "This week in Telegram",
  weekWeb: "This week in the web app",
  checkedToday: "Checked off habits today",
  gone: "Away for over 2 weeks",
  activityChart: "Visitors by day",

  habitsHeading: "Habits",
  withHabits: "With habits",
  withoutHabits: "No habits",
  habitsTotal: "Habits in total",
  ofAll: (share: string) => `${share} of all`,

  moreHeading: "Detailed analytics",
  more: {
    summary: "Key metrics",
    funnel: "Funnel",
    retention: "Retention",
    churn: "Churn and returns",
    habits: "What habits people add",
    sources: "Where people come from",
    messaging: "Reminders and broadcasts",
  },

  people: {
    new_today: "Joined today",
    new_yesterday: "Joined yesterday",
    new_week: "Joined in 7 days",
    new_month: "Joined in 30 days",
    all: "All users",
    telegram: "Use it in Telegram",
    web: "Use the web app",
    both: "Use both",
    bot_only: "Only started the bot",
    telegram_week: "In Telegram this week",
    web_week: "In the web app this week",
    web_logged_in: "Logged in to the web app with Telegram",
    web_guests: "Web app, not logged in",
    online: "In the app right now",
    active_today: "Visited today",
    active_week: "Visited in 7 days",
    active_month: "Visited in 30 days",
    checked_today: "Checked off habits today",
    gone: "Away for over 2 weeks",
    with_habits: "With habits",
    without_habits: "No habits",
  },

  profileId: "ID",
  profileUsername: "Username",
  profileJoined: "Joined",
  profileSource: "Came from",
  profileLastSeen: "Last seen",
  whereUses: "Where they use it",
  notUsed: "Never",
  webLogin: "Web app login",
  webLoginTelegram: "With Telegram",
  webLoginGuest: "Not logged in",
  pushNotifications: "Push notifications",
  telegramNotifications: "Telegram notifications",
  on: "On",
  off: "Off",
  botBlocked: "Blocked the bot",
  device: "Device",
  habitsHeading2: (count: number) => `${count} ${count === 1 ? "habit" : "habits"}`,
  noHabits: "No habits",
  streakDays: (days: number) => `${days}-day streak`,
  openHabits: "As they see it in the app",
  testAccount: "Exclude from analytics",
  details: "More about this user",
  detailsTitle: "Details",
  activityHeading: "Activity",
  settingsHeading: "Settings",
  history: "Activity history",
};
