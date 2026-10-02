/** Запросы админ-панели (/admin/*) поверх общего HTTP-клиента. Каждый требует прав
 *  администратора — без них API отвечает 403 `admin_required`. */

import { audienceParam } from "../audience";
import { ADMIN_PAGE_SIZE, BROADCAST_UPLOAD_TIMEOUT_MS } from "../constants";
import type {
  AdminEntry,
  AdminReview,
  AdminUserHabits,
  AdminUserProfile,
  AdminUserSummary,
  Analytics,
  Audience,
  Broadcast,
  BroadcastButton,
  Delivery,
  Page,
  ReviewReply,
} from "../types/admin";
import { apiRequest } from "./client";

/** Параметры запроса страницы: курсор из прошлого ответа и необязательный поиск. */
function pageQuery(cursor: string | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ limit: String(ADMIN_PAGE_SIZE), ...extra });
  if (cursor) {
    params.set("cursor", cursor);
  }
  return params.toString();
}

/** Web app funnel step (GET /admin/funnel). */
export interface FunnelStep {
  event: string;
  total: number;
  unique: number;
  by_platform: Record<string, number>;
  by_src: Record<string, number>;
}

/** Web app funnel for the last `days` days (UTC, today included). */
export async function fetchWebFunnel(days: number): Promise<FunnelStep[]> {
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const data = await apiRequest<{ steps: FunnelStep[] }>(
    `/admin/funnel?since=${day(since)}&until=${day(until)}`,
    { method: "GET" },
  );
  return data.steps;
}

export function fetchAnalytics(days: number): Promise<Analytics> {
  return apiRequest<Analytics>(`/admin/analytics?days=${days}`, { method: "GET" });
}

/** Параметры поиска и фильтра пользователей (пустые не передаются). */
function usersQuery(query: string, audience: Audience): Record<string, string> {
  const params: Record<string, string> = {};
  const filter = audienceParam(audience);
  if (query) {
    params.q = query;
  }
  if (filter) {
    params.filter = filter;
  }
  return params;
}

/** Страница пользователей (новые сначала); `query` — имя, @username или id, `audience` —
 *  фильтр. На первой странице — ещё и сколько их всего (`total`). */
export async function fetchUsers(
  query: string,
  audience: Audience,
  cursor: string | null,
): Promise<Page<AdminUserSummary>> {
  const data = await apiRequest<{
    users: AdminUserSummary[];
    next_cursor: string | null;
    total: number | null;
  }>(`/admin/users?${pageQuery(cursor, usersQuery(query, audience))}`, { method: "GET" });
  return { items: data.users, next_cursor: data.next_cursor, total: data.total };
}

/** Сколько пользователей под поиском и фильтром. */
export async function countUsers(query: string, audience: Audience): Promise<number> {
  const params = new URLSearchParams(usersQuery(query, audience));
  const data = await apiRequest<{ count: number }>(`/admin/users/count?${params}`, {
    method: "GET",
  });
  return data.count;
}

export async function fetchUser(telegramId: number): Promise<AdminUserProfile> {
  const data = await apiRequest<{ user: AdminUserProfile }>(`/admin/users/${telegramId}`, {
    method: "GET",
  });
  return data.user;
}

/** Привычки пользователя — те же данные, что видит он сам (только чтение). */
export function fetchUserHabits(telegramId: number): Promise<AdminUserHabits> {
  return apiRequest<AdminUserHabits>(`/admin/users/${telegramId}/habits`, { method: "GET" });
}

/** Заблокировать или разблокировать; вернуть обновлённый профиль. */
export async function setUserBlocked(
  telegramId: number,
  blocked: boolean,
): Promise<AdminUserProfile> {
  const data = await apiRequest<{ user: AdminUserProfile }>(
    `/admin/users/${telegramId}/block`,
    { method: "PUT", body: JSON.stringify({ blocked }) },
  );
  return data.user;
}

export async function deleteUser(telegramId: number): Promise<void> {
  await apiRequest<null>(`/admin/users/${telegramId}`, { method: "DELETE" });
}

/** Личное сообщение от бота. */
export function messageUser(telegramId: number, text: string): Promise<Delivery> {
  return apiRequest<Delivery>(`/admin/users/${telegramId}/message`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/** Страница отзывов всех пользователей (новые сначала). */
export async function fetchReviews(cursor: string | null): Promise<Page<AdminReview>> {
  const data = await apiRequest<{ reviews: AdminReview[]; next_cursor: string | null }>(
    `/admin/reviews?${pageQuery(cursor)}`,
    { method: "GET" },
  );
  return { items: data.reviews, next_cursor: data.next_cursor };
}

export async function fetchReview(reviewId: number): Promise<AdminReview> {
  const data = await apiRequest<{ review: AdminReview }>(`/admin/reviews/${reviewId}`, {
    method: "GET",
  });
  return data.review;
}

/** Ответить на отзыв сообщением бота. */
export function replyToReview(reviewId: number, text: string): Promise<ReviewReply> {
  return apiRequest<ReviewReply>(`/admin/reviews/${reviewId}/reply`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function fetchAdmins(): Promise<AdminEntry[]> {
  const data = await apiRequest<{ admins: AdminEntry[] }>("/admin/admins", { method: "GET" });
  return data.admins;
}

/** Добавить администратора; вернуть обновлённый список. */
export async function addAdmin(telegramId: number): Promise<AdminEntry[]> {
  const data = await apiRequest<{ admins: AdminEntry[] }>("/admin/admins", {
    method: "POST",
    body: JSON.stringify({ telegram_id: telegramId }),
  });
  return data.admins;
}

/** Убрать администратора; вернуть обновлённый список. */
export async function removeAdmin(telegramId: number): Promise<AdminEntry[]> {
  const data = await apiRequest<{ admins: AdminEntry[] }>(`/admin/admins/${telegramId}`, {
    method: "DELETE",
  });
  return data.admins;
}

/** Сколько получателей у рассылки с фильтром сейчас (без автора — ему приходит копия). */
export async function fetchRecipients(audience: Audience): Promise<number> {
  const params = new URLSearchParams({ audience: audienceParam(audience) });
  const data = await apiRequest<{ recipients: number }>(`/admin/broadcasts/recipients?${params}`, {
    method: "GET",
  });
  return data.recipients;
}

/** Поставить рассылку в очередь: текст, фото или видео (с подписью или без) и кнопка под
 *  ним. Копия приходит автору сразу; медиа загружается вместе с запросом, поэтому таймаут
 *  длиннее. */
export async function createBroadcast(
  audience: Audience,
  text: string,
  button: BroadcastButton,
  media: File | null,
): Promise<Broadcast> {
  const form = new FormData();
  form.set("audience", audienceParam(audience));
  form.set("text", text);
  form.set("button", button);
  if (media) {
    form.set("media", media);
  }
  const data = await apiRequest<{ broadcast: Broadcast }>(
    "/admin/broadcasts",
    { method: "POST", body: form },
    BROADCAST_UPLOAD_TIMEOUT_MS,
  );
  return data.broadcast;
}

export async function fetchBroadcast(broadcastId: number): Promise<Broadcast> {
  const data = await apiRequest<{ broadcast: Broadcast }>(`/admin/broadcasts/${broadcastId}`, {
    method: "GET",
  });
  return data.broadcast;
}
