/**
 * Shared habits from the habit screen: invite, reset the link, leave, remove someone (into
 * the blacklist) and take them off it, «Отметки участников». Unlike habit changes these need the server right away (the API,
 * api/groups.ts); after each, the state is asked for at once (POST /sync), so the screen
 * shows the result.
 *
 * Inviting shares the link the way the platform does it: in Telegram — its share window
 * (pick a chat); in the web app — the system share sheet, or the link is copied. The link
 * is loaded in advance when the habit screen opens (prefetchInvite), so the share window
 * opens right on the tap — without waiting for the server (and Safari still counts it as
 * the user's tap).
 *
 * Members' Telegram photos are kept on the device and loaded ahead (preloadMemberPhotos);
 * members' pages (their habit by their own marks) — in memory, loaded ahead too
 * (preloadMemberHabits).
 */

import { ApiRequestError } from "../api/client";
import {
  inviteOf,
  kickMember,
  leaveGroup,
  memberHabitOf,
  memberPhoto,
  type MemberHabit,
  resetInvite,
  setGroupNotify,
  unbanMember,
} from "../api/groups";
import { describeError } from "../errors";
import { appPlatform, devicePlatform } from "../platform";
import { clearPressFeedback, onNextTap } from "../pressFeedback";
import { dimScreen } from "../web/dimScreen";
import type { Strings } from "../strings";
import type { Habit } from "../types/habit";
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
  // The tapped row does not light up behind the share window (pressFeedback.ts).
  clearPressFeedback();
  if (appPlatform() === "telegram") {
    shareToTelegram(url, text);
    return;
  }
  if (typeof navigator.share === "function") {
    // As in Telegram, the app dims behind the share sheet (iPhone; Android's sheet dims it
    // itself). The tap that closes it lights nothing and takes the dimming away — the
    // iPhone does not always say the sheet is closed.
    const undim = devicePlatform() === "ios" ? dimScreen() : () => undefined;
    const forgetTap = onNextTap(undim);
    const release = (): void => {
      forgetTap();
      undim();
    };
    try {
      await navigator.share({ text, url });
      return;
    } catch (error) {
      // Closed by the user — nothing to do; otherwise copy the link instead.
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    } finally {
      release();
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

/** «Выйти из привычки»: the habit stays as an ordinary one (the link brings it back into
 *  the group with every check-in). */
export async function leaveShared(groupId: number): Promise<void> {
  await dataStore.sendAll();
  await leaveGroup(groupId);
  dataStore.refresh();
}

/** Remove someone (owner): they go into the blacklist. */
export async function removeFromShared(groupId: number, userId: number): Promise<void> {
  await kickMember(groupId, userId);
  dataStore.refresh();
}

/** Take someone off the blacklist (owner): the link works for them again. */
export async function unbanFromShared(groupId: number, userId: number): Promise<void> {
  await unbanMember(groupId, userId);
  dataStore.refresh();
}

/** «Отметки участников» on or off. */
export async function notifyShared(groupId: number, on: boolean): Promise<void> {
  await setGroupNotify(groupId, on);
  dataStore.refresh();
}

/*
 * Member pages: each member's habit by their own marks (GET /groups/{id}/members/{user}).
 * Loaded ahead, as soon as the habits arrive (preloadMemberHabits), and again when they
 * may have changed, so a member's page opens complete at once. Others' — when the group's
 * answer from the server changes (their marks, the schedule); mine — when my marks change,
 * once they have reached the server. Kept in memory only.
 */

/** Member habits by "<group>:<user>". */
const memberHabits = new Map<string, MemberHabit>();
/** The latest request per member: an older answer arriving later is dropped. */
const memberRequests = new Map<string, number>();
let memberRequestCount = 0;
const memberListeners = new Set<() => void>();
/** What the member pages of each shared habit were last loaded for (habit id →). */
const loadedFor = new Map<number, { others: string; mine: string }>();

function memberKey(groupId: number, userId: number): string {
  return `${groupId}:${userId}`;
}

function fetchMember(groupId: number, userId: number): Promise<MemberHabit> {
  const key = memberKey(groupId, userId);
  memberRequestCount += 1;
  const ticket = memberRequestCount;
  memberRequests.set(key, ticket);
  return memberHabitOf(groupId, userId).then((loaded) => {
    if (memberRequests.get(key) !== ticket) {
      return memberHabits.get(key) ?? loaded;
    }
    memberHabits.set(key, loaded);
    memberListeners.forEach((listener) => listener());
    return loaded;
  });
}

function refetchMember(groupId: number, userId: number): void {
  fetchMember(groupId, userId).catch(() => undefined);
}

/** A member's habit if it is already loaded; null — not yet. */
export function knownMemberHabit(groupId: number, userId: number): MemberHabit | null {
  return memberHabits.get(memberKey(groupId, userId)) ?? null;
}

/** Follow loaded member habits (useSyncExternalStore). */
export function subscribeMemberHabits(listener: () => void): () => void {
  memberListeners.add(listener);
  return () => memberListeners.delete(listener);
}

/** A member's habit — the loaded one, or from the server now (the page opens with it). */
export function loadMemberHabit(groupId: number, userId: number): Promise<MemberHabit> {
  const known = knownMemberHabit(groupId, userId);
  return known ? Promise.resolve(known) : fetchMember(groupId, userId);
}

/** Load the member pages of every shared habit ahead, and again when they may have changed. */
export function preloadMemberHabits(habits: readonly Habit[]): void {
  for (const habit of habits) {
    const group = habit.group;
    if (!group || group.id <= 0) {
      continue;
    }
    const schedule = [
      habit.frequency_type,
      habit.days,
      habit.start_date,
      habit.times_per_day,
      habit.schedule_history,
    ];
    // From the server only: changes when someone else marks or the owner edits.
    const others = JSON.stringify([
      schedule,
      group.members.filter((member) => !member.is_me),
      group.others_history,
      group.others_units,
    ]);
    // My marks and freezes — changed on the device first.
    const mine = JSON.stringify([
      schedule,
      habit.done_today,
      habit.today_count,
      habit.history_counts,
      habit.frozen_history,
      habit.next_day_done,
    ]);
    const last = loadedFor.get(habit.id);
    loadedFor.set(habit.id, { others, mine });
    if (last?.others !== others) {
      for (const member of group.members) {
        if (!member.is_me) {
          refetchMember(group.id, member.user_id);
        }
      }
    }
    const me = group.members.find((member) => member.is_me);
    if (me && last?.mine !== mine) {
      // Asked for once my changes are on the server, or it would answer with the old ones.
      void dataStore.settled().then((sent) => {
        if (sent && loadedFor.get(habit.id)?.mine === mine) {
          refetchMember(group.id, me.user_id);
        }
      });
    }
  }
}

/*
 * Members' Telegram photos. The server tells each member's photo version (GroupMember.photo,
 * it changes with the photo; the bot checks Telegram every few hours). A photo is kept on
 * the device by that version (Cache Storage — survives restarts), so it is downloaded only
 * when it is new. They are loaded as soon as the habits arrive (preloadMemberPhotos), not
 * when the habit screen opens, so the screen shows them at once.
 */

const PHOTO_CACHE = "member-photos-v1";

/** Ready photos: "<user>:<version>" → an object URL of a decoded image. */
const readyPhotos = new Map<string, string>();
/** Photos being loaded (or found missing — null). */
const loadingPhotos = new Map<string, Promise<string | null>>();

function photoKey(userId: number, version: string): string {
  return `${userId}:${version}`;
}

/** The Cache Storage key of a photo (never fetched — only a name for the device copy). */
function photoCacheUrl(userId: number, version: string): string {
  return `${location.origin}/member-photos/${userId}/${encodeURIComponent(version)}`;
}

async function openPhotoCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(PHOTO_CACHE);
  } catch {
    return null;
  }
}

/** Keep the photo on the device; the user's older versions go. */
async function storePhoto(userId: number, version: string, blob: Blob): Promise<void> {
  const cache = await openPhotoCache();
  if (!cache) {
    return;
  }
  try {
    const prefix = `${location.origin}/member-photos/${userId}/`;
    const current = photoCacheUrl(userId, version);
    for (const request of await cache.keys()) {
      if (request.url.startsWith(prefix) && request.url !== current) {
        await cache.delete(request);
      }
    }
    await cache.put(current, new Response(blob, { headers: { "Content-Type": blob.type } }));
  } catch {
    // No room or no storage — it is downloaded again next time.
  }
}

async function loadPhoto(groupId: number, userId: number, version: string): Promise<string | null> {
  const cache = await openPhotoCache();
  let blob: Blob | null = null;
  try {
    blob = (await (await cache?.match(photoCacheUrl(userId, version)))?.blob()) ?? null;
  } catch {
    blob = null;
  }
  if (!blob && groupId > 0) {
    blob = await memberPhoto(groupId, userId, version);
    if (blob) {
      void storePhoto(userId, version, blob);
    }
  }
  if (!blob) {
    return null;
  }
  const url = URL.createObjectURL(blob);
  // Decoded before it is shown: the avatar appears whole, without a blank frame.
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
  } catch {
    // Shown as is.
  }
  return url;
}

/** A member's photo if it is ready (shown at once); null — not yet or none. */
export function readyMemberPhoto(userId: number, version: string | null | undefined): string | null {
  return version ? (readyPhotos.get(photoKey(userId, version)) ?? null) : null;
}

/** A member's photo as an image URL; null — no photo or it could not be loaded (the letter
 *  is drawn). A failed download is tried again next time. */
export function memberPhotoUrl(
  groupId: number,
  userId: number,
  version: string | null | undefined,
): Promise<string | null> {
  if (!version) {
    return Promise.resolve(null);
  }
  const key = photoKey(userId, version);
  const ready = readyPhotos.get(key);
  if (ready) {
    return Promise.resolve(ready);
  }
  const known = loadingPhotos.get(key);
  if (known) {
    return known;
  }
  const loading = loadPhoto(groupId, userId, version).then((url) => {
    loadingPhotos.delete(key);
    if (url) {
      readyPhotos.set(key, url);
    }
    return url;
  });
  loadingPhotos.set(key, loading);
  return loading;
}

/** Load every shared habit's member photos ahead of the habit screen. */
export function preloadMemberPhotos(habits: readonly Habit[]): void {
  for (const habit of habits) {
    for (const member of habit.group?.members ?? []) {
      void memberPhotoUrl(habit.group?.id ?? 0, member.user_id, member.photo);
    }
    for (const member of habit.group?.banned ?? []) {
      void memberPhotoUrl(habit.group?.id ?? 0, member.user_id, member.photo);
    }
  }
}
