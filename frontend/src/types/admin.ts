/** Типы админ-панели — зеркалят схемы API /admin/* (backend/schemas.py). Моменты
 *  времени — строки ISO 8601 в UTC («…Z»). */

import type {
  ANALYTICS_PERIODS,
  AUDIENCE_FILTERS,
  BROADCAST_BUTTONS,
  PLATFORMS,
} from "../constants";
import type { Habit } from "./habit";

/** Пользователь в строке списка. */
export interface AdminUserRef {
  telegram_id: number;
  first_name: string | null;
  username: string | null;
}

export interface AdminUserSummary extends AdminUserRef {
  created_at: string;
  last_seen_at: string | null;
  /** Заблокирован администратором. */
  blocked: boolean;
  /** Тестовый аккаунт (не входит в аналитику). */
  is_test: boolean;
  /** Открывал Mini App. */
  uses_telegram: boolean;
  /** Заходил в веб-приложение. */
  uses_web: boolean;
}

/** Страница списка; `next_cursor` — для следующей (null — последняя). */
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  /** Всего в списке (под поиском и фильтром) — только на первой странице. */
  total?: number | null;
}

/** Признак фильтра пользователей (AUDIENCE_FILTERS). */
export type AudienceKey = keyof typeof AUDIENCE_FILTERS;

/** Фильтр пользователей: признак → выбранное значение; признака нет — любое. `segment` —
 *  группа людей из аналитики (её id строкой). */
export type Audience = { [K in AudienceKey]?: (typeof AUDIENCE_FILTERS)[K][number] } & {
  segment?: string;
};

/** Кнопка под рассылкой; пустая строка — без кнопки. */
export type BroadcastButton = (typeof BROADCAST_BUTTONS)[number];

export interface AdminReview {
  id: number;
  user: AdminUserRef;
  text: string;
  created_at: string;
  reply_text: string | null;
  replied_at: string | null;
}

export interface AdminUserProfile extends AdminUserRef {
  language: string;
  /** Пояс по-английски: город или «UTC±N»; null — не выбран. */
  timezone: string | null;
  created_at: string;
  /** Впервые открыл приложение; null — только запустил бота. */
  app_opened_at: string | null;
  last_seen_at: string | null;
  /** Заблокирован администратором. */
  blocked_at: string | null;
  /** Заблокировал бота. */
  bot_blocked_at: string | null;
  /** Получает от бота напоминания и рассылки («Уведомления» в Mini App). */
  telegram_notifications: boolean;
  is_admin: boolean;
  /** Активных привычек. */
  habits: number;
  reviews: AdminReview[];
  /* --- Сводка аналитики --- */
  /** Откуда пришёл; «direct» — без метки. */
  source: string;
  source_tag: string | null;
  platform: Platform;
  device: string | null;
  is_test: boolean;
  status: UserStatus;
  /** Активирован; null — окно активации ещё идёт. */
  activated: boolean | null;
  live: boolean;
  current_streak: number;
  best_streak: number;
  /** Сколько разных дней отмечал привычки. */
  checkin_days: number;
  completion_30d: number | null;
  last_checkin: string | null;
  /** Где пользуется: Mini App и веб-приложение, когда был там последний раз. */
  uses_telegram: boolean;
  uses_web: boolean;
  telegram_seen_at: string | null;
  web_seen_at: string | null;
  /** Включены push-уведомления веб-приложения. */
  push: boolean;
}

/** Статус пользователя в аналитике. */
export type UserStatus = "active" | "not_opened" | "churned" | "bot_blocked" | "uninstalled";

/** Привычки пользователя — те же, что он видит сам в приложении. */
export interface AdminUserHabits {
  habits: Habit[];
  /** Режим «Отмечать за вчера» этого пользователя: от него зависит подпись секции
   *  «не запланированы». */
  mark_yesterday: boolean;
}

/** Почему сообщение не доставлено: заблокировал бота или ни разу его не запускал. */
export type UndeliveredReason = "bot_blocked" | "chat_not_found";

export interface Delivery {
  delivered: boolean;
  reason: UndeliveredReason | null;
}

export interface ReviewReply extends Delivery {
  review: AdminReview;
}

export interface AdminEntry extends AdminUserRef {
  added_at: string;
  /** Это вы — себя убрать нельзя. */
  is_self: boolean;
}

export type BroadcastStatus = "pending" | "sending" | "done";

export interface Broadcast {
  id: number;
  /** Фильтр получателей строкой «признак:значение,…»; пустая — все. */
  audience: string;
  button: Exclude<BroadcastButton, ""> | null;
  status: BroadcastStatus;
  /** Получателей на момент создания. */
  total: number;
  sent: number;
  failed: number;
  created_at: string;
  finished_at: string | null;
}

/* --- Аналитика (/admin/analytics/*): доли — от 0 до 1, дни — «ГГГГ-ММ-ДД» по Алматы --- */

/** Период аналитики (ANALYTICS_PERIODS). */
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];
/** Раздел аналитики. */
export type AnalyticsSection =
  | "overview"
  | "summary"
  | "funnel"
  | "retention"
  | "churn"
  | "habits"
  | "sources"
  | "messaging";
/** Платформа: где человек появился. */
export type Platform = (typeof PLATFORMS)[number];

/** Фильтр сверху экрана аналитики. */
export interface AnalyticsFilter {
  period: AnalyticsPeriod;
  /** null — все платформы. */
  platform: Platform | null;
  /** Точное имя источника; null — все, «direct» — без метки. */
  source: string | null;
}

/** Группы людей «Обзора» (backend/analytics/overview.py, OVERVIEW_GROUPS). */
export type OverviewGroup =
  | "alive"
  | "newcomers"
  | "stopped"
  | "new_today"
  | "new_yesterday"
  | "new_week"
  | "new_month"
  | "all"
  | "telegram"
  | "web"
  | "both"
  | "bot_only"
  | "telegram_week"
  | "web_week"
  | "web_logged_in"
  | "web_guests"
  | "online"
  | "active_today"
  | "active_week"
  | "active_month"
  | "checked_today"
  | "gone"
  | "with_habits"
  | "without_habits";

/** GET /admin/analytics/overview — главный экран аналитики (без фильтра). */
export interface AnalyticsOverview {
  generated_at: string;
  /** Сколько людей в каждой группе. */
  counts: Record<OverviewGroup, number>;
  /** Привычек сейчас у всех пользователей. */
  habits: number;
  /** Живых неделю назад и на каждый из последних 30 дней. */
  alive_week_ago: number;
  alive_by_day: DayValue[];
  /** Последние 30 дней. */
  new_by_day: { date: string; telegram: number; web: number }[];
  activity_by_day: { date: string; opened: number; checked: number }[];
}

/** Цифра и она же за прошлый такой же период (null — у «всего времени» его нет). */
export interface Metric {
  value: number | null;
  previous: number | null;
}

export interface DayValue {
  date: string;
  value: number | null;
}

export interface AnalyticsMeta {
  period: AnalyticsPeriod;
  start: string | null;
  end: string;
  generated_at: string;
  /** С какого момента собираются новые данные (null — с самого начала). */
  tracking_since: string | null;
  /** Источники, которые встречались (для фильтра). */
  sources: string[];
  activation_window_days: number;
  activation_min_days: number;
}

export type ChangeKind = "new_users" | "activation" | "blocked" | "live" | "d7" | "inactive";

export interface ChangeItem {
  kind: ChangeKind;
  current: number;
  previous: number;
  source: string | null;
}

export interface AnalyticsSummary {
  meta: AnalyticsMeta;
  live: Metric;
  live_weeks: DayValue[];
  new_users: Metric;
  activation: Metric;
  activation_pending: number;
  d7: Metric;
  d7_cohort: number;
  today: {
    opened: number;
    checked_in: number;
    online: number;
    opened_yesterday: number;
    checked_in_yesterday: number;
  };
  blocked_bot: Metric;
  became_inactive: Metric;
  uninstalled: Metric;
  changes: ChangeItem[];
}

export interface FunnelStep {
  key: string;
  users: number;
  from_previous: number | null;
  from_start: number | null;
  median_minutes_to_next: number | null;
  /** Можно ли открыть людей шага (у шагов страницы установки людей нет). */
  people: boolean;
}

export interface FunnelReport {
  platform: Platform;
  steps: FunnelStep[];
  by_source: { source: string; steps: number[] }[];
}

export interface AnalyticsFunnel {
  meta: AnalyticsMeta;
  funnels: FunnelReport[];
}

/** Число людей в группе (корзине) по ключу. */
export interface Bucket {
  key: string;
  users: number;
}

export type RetentionBasis = "open" | "checkin";
export type RetentionCompare = "none" | "platform" | "source";

export interface AnalyticsRetention {
  meta: AnalyticsMeta;
  basis: RetentionBasis;
  weeks: { start: string; size: number; cells: (number | null)[] }[];
  curves: { key: string; size: number; points: (number | null)[] }[];
  d1: Metric;
  d7: Metric;
  d30: Metric;
  leave: Bucket[];
  still_active: number;
}

export interface AnalyticsChurn {
  meta: AnalyticsMeta;
  blocked: Metric;
  blocked_days: DayValue[];
  blocked_had_habit: number;
  blocked_activated: number;
  inactive_total: number;
  became_inactive: Metric;
  inactive_buckets: Bucket[];
  uninstalled_total: number;
  uninstalled: Metric;
  returned: Metric;
  return_reasons: Bucket[];
  groups: Bucket[];
}

export interface NamedCount {
  key: string;
  name: string;
  users: number;
  habits: number;
}

export interface AnalyticsHabits {
  meta: AnalyticsMeta;
  average: number | null;
  with_habits: number;
  without_habits: number;
  per_user: Bucket[];
  top_names: NamedCount[];
  frequency: Bucket[];
  total_habits: number;
  with_reminder: number;
  reminder_hours: number[];
  deleted: Metric;
  deleted_median_days: number | null;
  deleted_first_week: number | null;
  deleted_top: NamedCount[];
  streaks_current: Bucket[];
  streaks_best: Bucket[];
  streak_7: number;
  streak_30: number;
  streak_100: number;
  longest_streak: number;
  completion: Metric;
  completion_days: DayValue[];
  /** Пн…Вс. */
  completion_weekdays: (number | null)[];
  checkin_hours: number[];
  features: NamedCount[];
  app_users: number;
}

export interface SourceRow {
  source: string;
  tag: string | null;
  new_users: number;
  opened_rate: number | null;
  activated_rate: number | null;
  d7_rate: number | null;
  live: number;
}

export interface AnalyticsSources {
  meta: AnalyticsMeta;
  rows: SourceRow[];
  platforms: Bucket[];
  devices: Bucket[];
  languages: Bucket[];
  timezones: NamedCount[];
  web_users: number;
  web_linked: number;
  cohort: number;
}

export interface BroadcastStats {
  id: number;
  created_at: string;
  text: string | null;
  media_type: string | null;
  audience: string;
  button: string | null;
  total: number;
  sent: number;
  failed: number;
  /** Есть данные о получателях (рассылка после начала сбора). */
  tracked: boolean;
  opened_24h: number;
  opened_72h: number;
  checked_72h: number;
  blocked_24h: number;
  button_opens: number;
}

export interface AnalyticsMessaging {
  meta: AnalyticsMeta;
  reminders_telegram: number;
  reminders_push: number;
  reminders_failed: number;
  reminders_followed: number | null;
  reminder_opens: number;
  reminder_open_users: number;
  push_opens: number;
  with_reminders: number;
  without_reminders: number;
  live_with: number | null;
  live_without: number | null;
  d7_with: number | null;
  d7_without: number | null;
  broadcasts: BroadcastStats[];
  prompt_shown: number;
  prompt_accepted: number;
  prompt_installed: number;
}

/** Ответ раздела аналитики по его имени. */
export interface AnalyticsSections {
  overview: AnalyticsOverview;
  summary: AnalyticsSummary;
  funnel: AnalyticsFunnel;
  retention: AnalyticsRetention;
  churn: AnalyticsChurn;
  habits: AnalyticsHabits;
  sources: AnalyticsSources;
  messaging: AnalyticsMessaging;
}

/** GET /admin/analytics/overview/{group} — подробности цифры «Обзора»: из чего
 *  складывается группа (backend/analytics/overview.py, group_details). */
export interface AnalyticsOverviewGroup {
  group: OverviewGroup;
  users: number;
  all_users: number;
  /** Что на графике; null — графика нет. */
  trend_kind: "alive" | "new" | "total" | "opened" | "checked" | null;
  /** Последние 30 дней. */
  trend: DayValue[];
  /** Только у живых: стали живыми и перестали за неделю. */
  moves: { joined: number; left: number } | null;
  platforms: Bucket[];
  /** Источник → людей, по убыванию. */
  sources: Bucket[];
  joined: Bucket[];
  habits: Bucket[];
  last_seen: Bucket[];
  checked: Bucket[];
}

/** Какие люди стоят за цифрой (POST /admin/segments, backend/analytics/people.py). */
export interface PeopleQuery {
  metric: string;
  arg?: string;
  basis?: RetentionBasis;
  /** Что это за люди — заголовок списка и группы в рассылке. */
  title: string;
}

/** Группа людей из аналитики. */
export interface Segment {
  id: number;
  title: string;
  count: number;
}

/** Пороги активации и данные генератора ссылок. */
export interface AnalyticsConfig {
  activation_window_days: number;
  activation_min_days: number;
  bot_username: string | null;
  web_url: string;
  sources: string[];
}

/** Запись ленты действий в профиле. */
export interface TimelineItem {
  at: string;
  kind: string;
  detail: string | null;
  habit: string | null;
}

export interface TimelinePage {
  items: TimelineItem[];
  next_offset: number | null;
}
