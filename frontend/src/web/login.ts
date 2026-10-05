/**
 * Linking the web app to Telegram — the only login (spec 6.3–6.5): the app opens the bot
 * with a one-time code (`tg://…`, falling back to t.me), the user confirms there, and the
 * app picks the result up by polling. The code is remembered on the device, so the
 * result is picked up even if the phone closed the app while the user was in Telegram.
 * (Installing from the Mini App logs in by itself — the handoff link, web/bootstrap.ts.)
 *
 * Logging out (Settings → Аккаунт) ends the session on this device and leaves a fresh
 * guest in its place, as on a first launch; the habits stay with the Telegram account.
 */

import { ApiRequestError } from "../api/client";
import {
  createGuest,
  logout,
  pollTelegramLogin,
  startTelegramLogin,
  type LinkResult,
} from "../api/web";
import { setSessionToken } from "./session";
import { pushEndpoint, subscribePush } from "./push";

const PENDING_KEY = "streak:tg-login";
// Telegram app not installed: if the page is still visible this long after `tg://`,
// open the t.me page instead (ms).
const TELEGRAM_APP_FALLBACK_MS = 1500;

interface PendingLogin {
  code: string;
  expires: number;
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

/** Start "log in via Telegram" through the bot and open Telegram. */
export async function beginTelegramBotLogin(): Promise<void> {
  const start = await startTelegramLogin();
  writePending({ code: start.code, expires: Date.now() + start.expires_in * 1000 });
  window.location.href = start.app_url;
  window.setTimeout(() => {
    if (document.visibilityState === "visible") {
      window.location.href = start.web_url;
    }
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
    const answer = await pollTelegramLogin(pending.code);
    if (answer.status !== "done" || !answer.result) {
      return null;
    }
    writePending(null);
    applyLinkResult(answer.result);
    return answer.result;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status !== 0) {
      writePending(null);
    }
    throw error;
  }
}

/** Leave the linked account on this device: its reminders stop coming here, and the app
 *  continues as a new guest (this device's notifications move to it). */
export async function logOut(): Promise<void> {
  // The guest first: if the network fails halfway, the device still has an account.
  const guest = await createGuest();
  await logout(await pushEndpoint());
  writePending(null);
  setSessionToken(guest.token);
  void subscribePush();
}
