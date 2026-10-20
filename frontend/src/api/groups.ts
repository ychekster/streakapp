/** Совместные привычки (backend/routers/groups.py). Состояние после действия приложение
 *  берёт из следующего POST /sync (data/groups.ts просит его сразу). */

import { apiRequest } from "./client";

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

/** Выйти: привычка пропадает (по ссылке вернётся со всеми отметками). */
export async function leaveGroup(groupId: number): Promise<void> {
  await apiRequest<null>(`/groups/${groupId}/leave`, { method: "POST" });
}

/** Исключить участника (владелец). */
export async function kickMember(groupId: number, userId: number): Promise<void> {
  await apiRequest<null>(`/groups/${groupId}/kick`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

/** «Отметки участников». */
export async function setGroupNotify(groupId: number, on: boolean): Promise<void> {
  await apiRequest<null>(`/groups/${groupId}/notify`, {
    method: "POST",
    body: JSON.stringify({ on }),
  });
}
