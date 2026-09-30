/** Типы админ-панели — зеркалят схемы API /admin/* (tma/backend/schemas.py). Моменты
 *  времени — строки ISO 8601 в UTC («…Z»). */

import type { AUDIENCE_FILTERS, BROADCAST_BUTTONS } from "../constants";
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

/** Фильтр пользователей: признак → выбранное значение; признака нет — любое. */
export type Audience = { [K in AudienceKey]?: (typeof AUDIENCE_FILTERS)[K][number] };

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
  is_admin: boolean;
  /** Активных привычек. */
  habits: number;
  reviews: AdminReview[];
}

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

export interface AnalyticsDay {
  /** «ГГГГ-ММ-ДД», UTC. */
  date: string;
  new_users: number;
  total_users: number;
  active_users: number;
  scheduled: number;
  completed: number;
  /** completed / scheduled; null — ничего не запланировано. */
  completion_rate: number | null;
}

export interface HabitsBucket {
  habits: number;
  users: number;
  /** «N и больше». */
  open_ended: boolean;
}

export interface Analytics {
  period_days: number;
  generated_at: string;
  users: {
    total: number;
    opened_app: number;
    never_opened: number;
    blocked_bot: number;
    blocked: number;
    active_now: number;
  };
  /** Новые за период: запустили бота → из них открыли приложение → из них добавили
   *  хотя бы одну привычку. */
  funnel: { started_bot: number; opened_app: number; added_habit: number };
  /** Все пользователи без пересечений. */
  audience: { uses_app: number; never_opened: number; blocked_bot: number };
  activity: { dau: number; wau: number; mau: number };
  habits: { average: number; total: number; distribution: HabitsBucket[] };
  completion_rate: number | null;
  days: AnalyticsDay[];
}
