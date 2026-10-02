/**
 * Push reminders in the web app (spec §9).
 *
 * Permission is asked only right after the user saves a habit with a reminder — from
 * that tap (`askPermissionFromTap` must be called synchronously in the click handler:
 * Safari requires a user gesture), never on first launch. Once granted, the device
 * subscribes with the server's VAPID key and the subscription is stored for the account;
 * from then on the account's reminders come as push notifications instead of bot
 * messages. On iPhone push works only in the installed (home screen) app — which is the
 * only place the web app runs.
 */

import { track } from "../analytics";
import { fetchWebConfig, savePushSubscription } from "../api/web";

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

/** Subscribe this device and store the subscription for the current account. Safe to
 *  repeat (re-associates the device after a login switch). False — not possible. */
export async function subscribePush(): Promise<boolean> {
  if (pushPermission() !== "granted") {
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
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask for notification permission from a tap and subscribe if granted. Call it
 * synchronously inside the click handler. Resolves with the final permission.
 */
export function askPermissionFromTap(): Promise<NotificationPermission | "unsupported"> {
  if (!pushSupported()) {
    return Promise.resolve("unsupported");
  }
  if (Notification.permission !== "default") {
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
