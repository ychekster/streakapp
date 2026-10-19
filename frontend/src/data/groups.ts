/**
 * Shared habits from the habit screen: invite, reset the link, leave, remove someone,
 * «Отметки участников». Unlike habit changes these need the server right away (the API,
 * api/groups.ts); after each, the state is asked for at once (POST /sync), so the screen
 * shows the result.
 *
 * Inviting shares the link the way the platform does it: in Telegram — its share window
 * (pick a chat); in the web app — the system share sheet, or the link is copied.
 */

import { ApiRequestError } from "../api/client";
import {
  inviteToHabit,
  kickMember,
  leaveGroup,
  resetInvite,
  setGroupNotify,
} from "../api/groups";
import { appPlatform } from "../platform";
import type { Strings } from "../strings";
import { shareToTelegram, showAlert } from "../telegram/webapp";
import { dataStore } from "./store";

/** The habit's id on the server: a habit created offline is sent first. */
async function serverIdOf(habitId: number): Promise<number> {
  let task = dataStore.serverId(habitId);
  if (task === null) {
    await dataStore.sendAll();
    task = dataStore.serverId(habitId);
  }
  if (task === null) {
    throw new ApiRequestError(0, "network_error", "");
  }
  return task;
}

/** Share the invitation link: Telegram's share window, the system share sheet or a copy. */
async function share(url: string, text: string, strings: Strings): Promise<void> {
  if (appPlatform() === "telegram") {
    shareToTelegram(url, text);
    return;
  }
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text, url });
      return;
    } catch (error) {
      // Closed by the user — nothing to do; otherwise copy the link instead.
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt(strings.inviteCopiedTitle, url);
    return;
  }
  await showAlert({ title: strings.inviteCopiedTitle, message: strings.inviteCopiedMessage });
}

/** «Пригласить»: the habit's link (an ordinary habit becomes shareable), shared. */
export async function inviteToShared(
  habitId: number,
  habitName: string,
  strings: Strings,
): Promise<void> {
  const invite = await inviteToHabit(await serverIdOf(habitId));
  dataStore.refresh();
  await share(invite.invite_url, strings.inviteShareText(habitName), strings);
}

/** «Сбросить ссылку» (owner): the old link stops working. */
export async function resetSharedLink(groupId: number): Promise<void> {
  await resetInvite(groupId);
}

/** «Выйти из привычки»: it stays an ordinary habit. */
export async function leaveShared(groupId: number): Promise<void> {
  await dataStore.sendAll();
  await leaveGroup(groupId);
  dataStore.refresh();
}

/** Remove someone (owner). */
export async function removeFromShared(groupId: number, userId: number): Promise<void> {
  await kickMember(groupId, userId);
  dataStore.refresh();
}

/** «Отметки участников» on or off. */
export async function notifyShared(groupId: number, on: boolean): Promise<void> {
  await setGroupNotify(groupId, on);
  dataStore.refresh();
}
