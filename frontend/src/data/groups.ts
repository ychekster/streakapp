/**
 * Shared habits from the habit screen: invite, reset the link, leave, remove someone,
 * «Отметки участников». Unlike habit changes these need the server right away (the API,
 * api/groups.ts); after each, the state is asked for at once (POST /sync), so the screen
 * shows the result.
 *
 * Inviting shares the link the way the platform does it: in Telegram — its share window
 * (pick a chat); in the web app — the system share sheet, or the link is copied. The link
 * is loaded in advance when the habit screen opens (prefetchInvite), so the share window
 * opens right on the tap — without waiting for the server (and Safari still counts it as
 * the user's tap).
 *
 * Members' Telegram photos are loaded once per app run (memberPhotoUrl).
 */

import { ApiRequestError } from "../api/client";
import {
  inviteOf,
  kickMember,
  leaveGroup,
  memberPhoto,
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

/** Invitation links by group id, loaded in advance. */
const inviteLinks = new Map<number, string>();

/** Load the group's invitation link ahead of «Добавить участника». A group not yet on the
 *  server (created offline) or no connection — it is loaded on the tap instead. */
export function prefetchInvite(groupId: number): void {
  if (groupId <= 0 || inviteLinks.has(groupId)) {
    return;
  }
  inviteOf(groupId).then(
    (invite) => inviteLinks.set(groupId, invite.invite_url),
    () => undefined,
  );
}

/** «Добавить участника»: the shared habit's link, shared. */
export async function inviteToShared(
  habitId: number,
  habitName: string,
  strings: Strings,
): Promise<void> {
  const groupId = await groupIdOf(habitId);
  let url = inviteLinks.get(groupId);
  if (url === undefined) {
    url = (await inviteOf(groupId)).invite_url;
    inviteLinks.set(groupId, url);
  }
  await share(url, strings.inviteShareText(habitName), strings);
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
  const invite = await resetInvite(groupId);
  inviteLinks.set(groupId, invite.invite_url);
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

/** Photos by user id: an object URL, or null — no photo (the letter is drawn instead). */
const photos = new Map<number, Promise<string | null>>();

/** A member's Telegram photo as an image URL; asked for once per app run. A group not yet
 *  on the server (created offline) has no photos to ask for. */
export function memberPhotoUrl(groupId: number, userId: number): Promise<string | null> {
  const known = photos.get(userId);
  if (known) {
    return known;
  }
  if (groupId <= 0) {
    return Promise.resolve(null);
  }
  const loading = memberPhoto(groupId, userId).then((blob) =>
    blob ? URL.createObjectURL(blob) : null,
  );
  photos.set(userId, loading);
  return loading;
}
