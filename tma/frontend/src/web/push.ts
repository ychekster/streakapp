/**
 * Push reminders in the web app (spec §9).
 *
 * Permission is asked when the user creates their first habit, turns a reminder on (a
 * habit's or «Напоминать отмечать» — this also undoes «off» in Settings), or turns
 * «Уведомления» on in Settings — from that tap (`askPermissionFromTap` must be called synchronously in the
 * click handler: Safari requires a user gesture), never on first launch. Once granted,
 * the device subscribes with the server's VAPID key and the subscription is stored for
 * the account; from then on the account's reminders come as push notifications instead
 * of bot messages. On iPhone push works only in the installed (home screen) app — which
 * is the only place the web app runs.
 *
 * Turning notifications off in Settings drops the subscription and is remembered on the
 * device: nothing re-subscribes it (launch, new habits) until the user turns them on.
 */

import { track } from "../analytics";
import { fetchWebConfig, removePushSubscription, savePushSubscription } from "../api/web";

// The user turned notifications off in Settings (this device).
const OPTED_OUT_KEY = "streak:push-off";

function optedOut(): boolean {
  try {
    return localStorage.getItem(OPTED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function setOptedOut(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(OPTED_OUT_KEY, "1");
    } else {
      localStorage.removeItem(OPTED_OUT_KEY);
    }
  } catch {
    // Without storage the choice lasts until the app closes.
  }
}

/** Can this browser do push at all. */
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Current permission, or "unsupported". */
export function pushPermission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

/** base64url → bytes (applicationServerKey). */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

// Last known state of this device's notifications in this run (null — not known yet).
let lastEnabled: boolean | null = null;

/** Subscribe this device and store the subscription for the current account. Safe to
 *  repeat (re-associates the device after a login switch). False — not possible. */
export async function subscribePush(): Promise<boolean> {
  if (pushPermission() !== "granted" || optedOut()) {
    return false;
  }
  try {
    const config = await fetchWebConfig();
    if (!config.vapid_public_key) {
      return false;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(config.vapid_public_key),
      }));
    await savePushSubscription(subscription.toJSON());
    lastEnabled = true;
    return true;
  } catch {
    return false;
  }
}


/** Best guess right now, without waiting — for the switch's first frame, so it does not
 *  animate from «off» every time Settings opens. */
export function pushEnabledGuess(): boolean {
  return lastEnabled ?? (pushPermission() === "granted" && !optedOut());
}

/** Notifications are on for this device: allowed, not turned off, and subscribed. */
export async function pushEnabled(): Promise<boolean> {
  if (pushPermission() !== "granted" || optedOut()) {
    lastEnabled = false;
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    lastEnabled = (await registration.pushManager.getSubscription()) !== null;
  } catch {
    lastEnabled = false;
  }
  return lastEnabled;
}

/** Ask from a tap that is not about notifications (saving a habit): not if the user
 *  turned them off in Settings. Resolves with the permission. */
export function askPermissionUnlessOff(): Promise<NotificationPermission | "unsupported"> {
  return optedOut() ? Promise.resolve(pushPermission()) : askPermissionFromTap();
}

/**
 * A reminder was just turned on (a habit's or «Напоминать отмечать»), so notifications
 * must work: undo «off» in Settings, ask for permission if it was never asked, subscribe.
 * Call it synchronously inside the click handler. Resolves with the permission; "denied"
 * — refused earlier, only the phone's settings can allow them now (no prompt is shown).
 */
export function enablePushForReminder(): Promise<NotificationPermission | "unsupported"> {
  setOptedOut(false);
  return askPermissionFromTap().then(async (permission) => {
    if (permission === "granted") {
      await subscribePush();
    }
    return permission;
  });
}

/**
 * Turn notifications on from a tap (Settings): ask for permission if needed and
 * subscribe. Call it synchronously inside the click handler. True — they are on.
 */
export function enablePushFromTap(): Promise<boolean> {
  setOptedOut(false);
  return askPermissionFromTap(true).then((permission) =>
    permission === "granted" ? subscribePush() : false,
  );
}

/** This device's push subscription address, or null — none. */
export async function pushEndpoint(): Promise<string | null> {
  if (!pushSupported()) {
    return null;
  }
  try {
    // Not `ready`: without a service worker it would wait forever.
    const registration = await navigator.serviceWorker.getRegistration();
    return (await registration?.pushManager.getSubscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

/** Turn notifications off for this device and remember the choice. Throws if the
 *  server could not be told (then nothing changes). */
export async function disablePush(): Promise<void> {
  if (pushSupported()) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe().catch(() => false);
    }
  }
  setOptedOut(true);
  lastEnabled = false;
}

/**
 * Ask for notification permission from a tap and subscribe if granted. Call it
 * synchronously inside the click handler. Resolves with the final permission.
 * `again` — ask even after a refusal (the Settings switch): browsers that allow asking
 * again show the prompt; iPhone answers «denied» at once — only the phone's settings can
 * change it then.
 */
export function askPermissionFromTap(again = false): Promise<NotificationPermission | "unsupported"> {
  if (!pushSupported()) {
    return Promise.resolve("unsupported");
  }
  if (Notification.permission === "granted" || (Notification.permission === "denied" && !again)) {
    return Promise.resolve(Notification.permission);
  }
  // Called right now, inside the gesture; the rest may await.
  const request = Notification.requestPermission();
  return request.then(async (permission) => {
    if (permission === "granted") {
      track("push_permission_granted");
      await subscribePush();
    } else if (permission === "denied") {
      track("push_permission_denied");
    }
    return permission;
  });
}
