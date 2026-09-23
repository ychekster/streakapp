/** Запросы админ-панели (/admin/*) поверх общего HTTP-клиента. Каждый требует прав
 *  администратора — без них API отвечает 403 `admin_required`. */

import { ADMIN_PAGE_SIZE, BROADCAST_UPLOAD_TIMEOUT_MS } from "../constants";
import type {
  AdminEntry,
  AdminReview,
  AdminUserHabits,
  AdminUserProfile,
  AdminUserSummary,
  Analytics,
  Broadcast,
  BroadcastSegment,
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

export function fetchAnalytics(days: number): Promise<Analytics> {
  return apiRequest<Analytics>(`/admin/analytics?days=${days}`, { method: "GET" });
}

/** Страница пользователей (новые сначала); `query` — имя, @username или id. */
export async function fetchUsers(
  query: string,
  cursor: string | null,
): Promise<Page<AdminUserSummary>> {
  const data = await apiRequest<{ users: AdminUserSummary[]; next_cursor: string | null }>(
    `/admin/users?${pageQuery(cursor, query ? { q: query } : {})}`,
    { method: "GET" },
  );
  return { items: data.users, next_cursor: data.next_cursor };
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

export async function fetchSegments(): Promise<BroadcastSegment[]> {
  const data = await apiRequest<{ segments: BroadcastSegment[] }>("/admin/broadcasts/segments", {
    method: "GET",
  });
  return data.segments;
}

/** Поставить рассылку в очередь: текст, фото или видео (с подписью или без). Копия
 *  приходит автору сразу; медиа загружается вместе с запросом, поэтому таймаут длиннее. */
export async function createBroadcast(
  segment: string,
  text: string,
  media: File | null,
): Promise<Broadcast> {
  const form = new FormData();
  form.set("segment", segment);
  form.set("text", text);
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
