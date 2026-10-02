/**
 * Logins from the web app and the Mini App (spec 6.3–6.5).
 *
 * - Telegram via the bot: the app opens the bot with a one-time code (`tg://…`, falling
 *   back to t.me), the user confirms there, and the app picks the result up by polling.
 *   The code is remembered on the device, so the result is picked up even if the phone
 *   closed the app while the user was in Telegram.
 * - Telegram's official web login (oauth.telegram.org): a redirect back to the app with
 *   a signed result. Needs the domain set for the bot in BotFather — the bot route
 *   above does not.
 * - Google: a redirect to Google and back (the API links it right away).
 */

import { ApiRequestError } from "../api/client";
import {
  pollTelegramLogin,
  startGoogleLogin,
  startTelegramLogin,
  telegramWidgetLogin,
  type LinkResult,
} from "../api/web";
import { setSessionToken } from "../session";
import { isTelegram } from "../platform";
import { openExternalLink } from "../telegram/webapp";

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

/** Forget a pending bot login (the user cancelled). */
export function cancelTelegramBotLogin(): void {
  writePending(null);
}

/** Address of Telegram's official web login, returning into the installed app. */
export function telegramWebLoginUrl(botId: number): string {
  const origin = window.location.origin;
  const query = new URLSearchParams({
    bot_id: String(botId),
    origin,
    request_access: "write",
    return_to: `${origin}/app?pwa=1&tglogin=1`,
  });
  return `https://oauth.telegram.org/auth?${query.toString()}`;
}

/** Finish Telegram's web login if the address carries its result (`#tgAuthResult=`).
 *  Returns the result, or null when there is none. */
export async function finishTelegramWebLogin(): Promise<LinkResult | null> {
  const match = window.location.hash.match(/tgAuthResult=([^&]+)/);
  if (!match) {
    return null;
  }
  const base64 = decodeURIComponent(match[1]).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  const result = await telegramWidgetLogin(data);
  applyLinkResult(result);
  return result;
}

/** Link Google: the installed app goes to Google and comes back; the Mini App finishes
 *  it in the phone's browser (Google does not allow its login inside Telegram). */
export async function beginGoogleLogin(): Promise<void> {
  const telegram = isTelegram();
  const { url } = await startGoogleLogin(telegram ? "telegram" : "web");
  if (telegram) {
    openExternalLink(url);
  } else {
    window.location.href = url;
  }
}
