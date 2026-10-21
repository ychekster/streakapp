/** Совместные привычки (backend/routers/groups.py). Состояние после действия приложение
 *  берёт из следующего POST /sync (data/groups.ts просит его сразу). */

import type { Habit } from "../types/habit";
import { API_BASE_URL, apiRequest, authorizationHeader } from "./client";

/** Ссылка-приглашение совместной привычки. */
export interface GroupInvite {
  group_id: number;
  /** t.me/<бот>?start=join_<код> — открывает чат с ботом, он предлагает вступить. */
  invite_url: string;
}

/** Ссылка-приглашение совместной привычки (любой участник). */
export function inviteOf(groupId: number): Promise<GroupInvite> {
  return apiRequest<GroupInvite>(`/groups/${groupId}/invite`);
}

/** Новая ссылка (владелец): прежняя больше не действует. */
export function resetInvite(groupId: number): Promise<GroupInvite> {
  return apiRequest<GroupInvite>(`/groups/${groupId}/reset`, { method: "POST" });
}

/** Выйти: привычка остаётся обычной (по ссылке вернётся в группу со всеми отметками). */
export async function leaveGroup(groupId: number): Promise<void> {
  await apiRequest<null>(`/groups/${groupId}/leave`, { method: "POST" });
}

/** Исключить участника (владелец): он попадает в чёрный список. */
export async function kickMember(groupId: number, userId: number): Promise<void> {
  await apiRequest<null>(`/groups/${groupId}/kick`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

/** Убрать из чёрного списка (владелец): по ссылке снова можно вступить. */
export async function unbanMember(groupId: number, userId: number): Promise<void> {
  await apiRequest<null>(`/groups/${groupId}/unban`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

/** Страница участника: его привычка по его отметкам, как обычная (без группы и его
 *  напоминаний). */
export interface MemberHabit {
  habit: Habit;
  /** День отметки участника («ГГГГ-ММ-ДД») — последний день `history`. */
  day: string;
}

/** Привычка участника для его страницы (любой участник, себя тоже). */
export function memberHabitOf(groupId: number, userId: number): Promise<MemberHabit> {
  return apiRequest<MemberHabit>(`/groups/${groupId}/members/${userId}`);
}

/** «Отметки участников». */
export async function setGroupNotify(groupId: number, on: boolean): Promise<void> {
  await apiRequest<null>(`/groups/${groupId}/notify`, {
    method: "POST",
    body: JSON.stringify({ on }),
  });
}

/** Фото участника из Telegram (JPEG) версии `version` (GroupMember.photo); null — фото
 *  нет или не удалось получить. Не через apiRequest: ответ — картинка, а не JSON. */
export async function memberPhoto(
  groupId: number,
  userId: number,
  version: string,
): Promise<Blob | null> {
  const authorization = authorizationHeader();
  const query = new URLSearchParams({ v: version });
  try {
    const response = await fetch(
      `${API_BASE_URL}/groups/${groupId}/members/${userId}/photo?${query}`,
      { headers: authorization ? { Authorization: authorization } : {} },
    );
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}
