/** Совместные привычки (backend/routers/groups.py). Состояние после действия приложение
 *  берёт из следующего POST /sync (data/groups.ts просит его сразу). */

import { apiRequest } from "./client";

/** Ссылка-приглашение совместной привычки. */
export interface GroupInvite {
  group_id: number;
  /** t.me/<бот>?start=join_<код> — открывает чат с ботом, он предлагает вступить. */
  invite_url: string;
}

/** Ссылка-приглашение привычки (`task` — id на сервере); у обычной привычки появляется
 *  совместная, владелец — я. */
export function inviteToHabit(task: number): Promise<GroupInvite> {
  return apiRequest<GroupInvite>("/groups/invite", {
    method: "POST",
    body: JSON.stringify({ task }),
  });
}

/** Новая ссылка (владелец): прежняя больше не действует. */
export function resetInvite(groupId: number): Promise<GroupInvite> {
  return apiRequest<GroupInvite>(`/groups/${groupId}/reset`, { method: "POST" });
}

/** Выйти: привычка остаётся обычной. */
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
