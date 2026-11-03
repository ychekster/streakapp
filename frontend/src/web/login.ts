/**
 * Linking the web app to Telegram — the only login (spec 6.3–6.5): the app opens the bot
 * with a one-time code (`tg://…`, falling back to t.me), the user confirms there, and the
 * app picks the result up by polling. The code is remembered on the device, so the
 * result is picked up even if the phone closed the app while the user was in Telegram.
 * (Installing from the Mini App logs in by itself — the handoff link, web/bootstrap.ts.)
 *
 * Logging out (Settings → Аккаунт) ends the session on this device and leaves a fresh
 * guest in its place, as on a first launch; the habits stay with the Telegram account and
 * are removed from the device. («Выйти на всех устройствах» logs out the other devices
 * only — logOutOtherDevices.)
 */

import { ApiRequestError } from "../api/client";
import {
  createGuest,
  logout,
  pollTelegramLogin,
  startTelegramLogin,
  type LinkResult,
} from "../api/web";
import { forgetGroupData } from "../data/groups";
import { dataStore, forgetKeptData } from "../data/store";
import { forgetAccount } from "./account";
import { setSessionToken } from "./session";
import { pushEndpoint, subscribePush } from "./push";

const PENDING_KEY = "streak:tg-login";
// Telegram app not installed: if the page never left the screen this long after `tg://`,
// open the t.me page instead (ms). Long enough for iOS's «Open in Telegram?» question —
// t.me opened behind it would start the bot a second time.
const TELEGRAM_APP_FALLBACK_MS = 3000;
// A code prepared ahead is used only while this much of its life is left (ms).
const PREPARED_MARGIN_MS = 60_000;

interface PendingLogin {
  code: string;
  expires: number;
  appUrl?: string;
  webUrl?: string;
}

function readPending(): PendingLogin | null {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as PendingLogin | null;
    return pending && pending.expires > Date.now() ? pending : null;
  } catch {
    return null;
  }
}

function writePending(pending: PendingLogin | null): void {
  try {
    if (pending) {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } else {
      localStorage.removeItem(PENDING_KEY);
    }
  } catch {
    // Without storage the login still works while the app stays open.
  }
}

/** Use the session a login returned (the account may have switched). */
export function applyLinkResult(result: LinkResult): void {
  if (result.session) {
    setSessionToken(result.session.token);
  }
}

// The login code asked ahead (prepareTelegramBotLogin) and the request for one in flight.
let prepared: PendingLogin | null = null;
let preparing: Promise<PendingLogin> | null = null;
// A press is being handled: more presses meanwhile do nothing.
let opening = false;

function usable(login: PendingLogin | null): login is PendingLogin & { appUrl: string; webUrl: string } {
  return (
    login !== null &&
    login.appUrl !== undefined &&
    login.webUrl !== undefined &&
    login.expires - Date.now() > PREPARED_MARGIN_MS
  );
}

function requestCode(): Promise<PendingLogin> {
  preparing ??= startTelegramLogin()
    .then((start) => {
      prepared = {
        code: start.code,
        expires: Date.now() + start.expires_in * 1000,
        appUrl: start.app_url,
        webUrl: start.web_url,
      };
      return prepared;
    })
    .finally(() => {
      preparing = null;
    });
  return preparing;
}

/** Ask for a login code ahead, so that the press opens Telegram at once (a guest of the
 *  web app: it may press «Войти через Telegram» any moment). Errors are left for the press. */
export function prepareTelegramBotLogin(): void {
  if (!usable(prepared) && !usable(readPending())) {
    requestCode().catch(() => undefined);
  }
}

/** Open the bot with the login code: `tg://`, and t.me only if the page never left the
 *  screen (no Telegram app). */
function openTelegram(login: { appUrl: string; webUrl: string }): void {
  let left = false;
  const leave = (): void => {
    left = true;
  };
  const events = ["visibilitychange", "pagehide", "blur"] as const;
  events.forEach((name) => window.addEventListener(name, leave, { once: true }));
  window.location.href = login.appUrl;
  window.setTimeout(() => {
    events.forEach((name) => window.removeEventListener(name, leave));
    if (!left && document.visibilityState === "visible") {
      window.location.href = login.webUrl;
    }
  }, TELEGRAM_APP_FALLBACK_MS);
}

/**
 * Start "log in via Telegram" through the bot and open Telegram — exactly once however
 * many times it is pressed: presses while it is opening do nothing, and a press after
 * coming back reuses the waiting code (the bot answers a code once, bot/handlers/web_login).
 * A code prepared ahead opens Telegram right in the press, without waiting for the server.
 */
export async function beginTelegramBotLogin(): Promise<void> {
  if (opening) {
    return;
  }
  opening = true;
  let login: PendingLogin;
  try {
    const waiting = readPending();
    login = usable(waiting) ? waiting : usable(prepared) ? prepared : await requestCode();
  } catch (error) {
    opening = false;
    throw error;
  }
  prepared = null;
  writePending(login);
  openTelegram(login as { appUrl: string; webUrl: string });
  // The page is leaving for Telegram; a press a moment later is still the same one.
  window.setTimeout(() => {
    opening = false;
  }, TELEGRAM_APP_FALLBACK_MS);
}

/** Is a bot login waiting for confirmation on this device. */
export function hasPendingTelegramLogin(): boolean {
  return readPending() !== null;
}

/**
 * Check the pending bot login once. Returns the result when the bot confirmed it (the
 * session is applied), null while it is still pending or there is none. A login that
 * can no longer finish is forgotten and its error rethrown.
 */
export async function checkTelegramBotLogin(): Promise<LinkResult | null> {
  const pending = readPending();
  if (!pending) {
    writePending(null);
    return null;
  }
  try {
    // The poll may link the account: the guest's habits move with it, so its unsent
    // changes go first — after a switch the device forgets them.
    await dataStore.sendAll();
    const answer = await pollTelegramLogin(pending.code);
    if (answer.status !== "done" || !answer.result) {
      return null;
    }
    writePending(null);
    prepared = null;
    applyLinkResult(answer.result);
    return answer.result;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status !== 0) {
      writePending(null);
    }
    throw error;
  }
}

/** Logging out was stopped: some changes have not reached the account yet. */
export class UnsentChangesError extends Error {}

/** Leave the linked account on this device: its reminders stop coming here, its habits
 *  are removed from the device, and the app continues as a new guest (this device's
 *  notifications move to it). */
export async function logOut(): Promise<void> {
  // Changes made just before go to the account first — after this the device forgets them.
  if (!(await dataStore.sendAll())) {
    throw new UnsentChangesError();
  }
  // The guest first: if the network fails halfway, the device still has an account.
  const guest = await createGuest();
  await logout(await pushEndpoint());
  writePending(null);
  prepared = null;
  forgetKeptData();
  forgetGroupData();
  forgetAccount();
  setSessionToken(guest.token);
  void subscribePush();
}

/** Log out on every other device: they stop getting the account's reminders; this one
 *  stays logged in and keeps its notifications. */
export async function logOutOtherDevices(): Promise<void> {
  await logout(await pushEndpoint(), true);
}
