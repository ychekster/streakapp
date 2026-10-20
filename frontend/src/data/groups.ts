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
  inviteOf,
  kickMember,
  leaveGroup,
  resetInvite,
  setGroupNotify,
} from "../api/groups";
import { describeError } from "../errors";
import { appPlatform } from "../platform";
import type { Strings } from "../strings";
import { confirmAction, shareToTelegram, showAlert } from "../telegram/webapp";
import { dataStore } from "./store";

/** The habit's group on the server: a habit created offline is sent first. */
async function groupIdOf(habitId: number): Promise<number> {
  const find = () =>
    dataStore.getState().habits.find((habit) => habit.id === habitId)?.group?.id ?? 0;
  let group = dataStore.serverId(habitId) === null ? 0 : find();
  if (group <= 0) {
    await dataStore.sendAll();
    group = find();
  }
  if (group <= 0) {
    throw new ApiRequestError(0, "network_error", "");
  }
  return group;
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

/** «Пригласить»: the shared habit's link, shared. */
export async function inviteToShared(
  habitId: number,
  habitName: string,
  strings: Strings,
): Promise<void> {
  const invite = await inviteOf(await groupIdOf(habitId));
  await share(invite.invite_url, strings.inviteShareText(habitName), strings);
}

/** A shared-habit action failed: a dialog; without a Telegram login — the offer to log in. */
export async function reportGroupError(
  error: unknown,
  strings: Strings,
  onLinkTelegram: () => void,
): Promise<void> {
  if (error instanceof ApiRequestError && error.code === "group_needs_telegram") {
    const login = await confirmAction({
      title: strings.groupLoginTitle,
      message: strings.groupLoginMessage,
      confirmLabel: strings.groupLoginConfirm,
      cancelLabel: strings.groupDialogCancel,
    });
    if (login) {
      onLinkTelegram();
    }
  } else {
    await showAlert({
      title: strings.groupActionFailed,
      message: describeError(strings, error, strings.groupActionFailed),
    });
  }
}

/** «Сбросить ссылку» (owner): the old link stops working. */
export async function resetSharedLink(groupId: number): Promise<void> {
  await resetInvite(groupId);
}

/** «Выйти из привычки»: the habit is gone (the link brings it back with every check-in). */
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
