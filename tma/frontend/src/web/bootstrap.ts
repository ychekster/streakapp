/**
 * Start of the installed web app, before the first screen (spec 4.2, 6.2):
 *
 * 1. finish a login the address brings back: a Google result code (`auth=`), an error
 *    (`auth_error=`), Telegram's web login result (`#tgAuthResult=`), or a bot login
 *    confirmed while the app was in the background;
 * 2. make sure there is a session: the stored one if the server still knows it,
 *    otherwise a new guest account — silently, no sign-up form;
 * 3. clean the address (keeping `pwa=1` and the habit a notification opens) and
 *    re-attach this device's push subscription to the account.
 *
 * What happened with a login is kept for Settings → Account to show (`takeAuthNotice`).
 */

import { trackOnce } from "../analytics";
import { ApiRequestError } from "../api/client";
import { completeLogin, createGuest, fetchAccount } from "../api/web";
import { getSessionToken, setSessionToken } from "../session";
import { applyLinkResult, checkTelegramBotLogin, finishTelegramWebLogin } from "./login";
import { subscribePush } from "./push";

export type AuthNotice = { kind: "linked" } | { kind: "error"; code: string };

let notice: AuthNotice | null = null;

/** Is there a login outcome waiting to be shown (App then opens Settings → Account). */
export function hasAuthNotice(): boolean {
  return notice !== null;
}

/** The login outcome to show once (then forgotten). */
export function takeAuthNotice(): AuthNotice | null {
  const taken = notice;
  notice = null;
  return taken;
}

function errorCode(error: unknown): string {
  return error instanceof ApiRequestError ? error.code : "network_error";
}

async function ensureSession(): Promise<void> {
  if (getSessionToken()) {
    try {
      await fetchAccount();
      return;
    } catch (error) {
      // Only a session the server rejected is dropped; offline — keep it.
      if (!(error instanceof ApiRequestError && error.status === 401)) {
        return;
      }
      setSessionToken(null);
    }
  }
  const session = await createGuest();
  setSessionToken(session.token);
}

/** Address without the login leftovers: `pwa=1` and `habit` stay. */
function cleanAddress(): void {
  const url = new URL(window.location.href);
  for (const key of ["auth", "auth_error", "tglogin", "h", "src"]) {
    url.searchParams.delete(key);
  }
  url.hash = "";
  window.history.replaceState(window.history.state, "", url.toString());
}

let running: Promise<void> | null = null;

/** Run before rendering the web app. Throws only if no session can be had at all
 *  (first launch offline) — the caller shows a retry. Concurrent calls share one run
 *  (two would create two guest accounts). */
export function startWebApp(): Promise<void> {
  if (!running) {
    running = start().catch((error: unknown) => {
      running = null;
      throw error;
    });
  }
  return running;
}

async function start(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const authCode = params.get("auth");
  const authError = params.get("auth_error");
  if (authCode) {
    try {
      applyLinkResult(await completeLogin(authCode));
      notice = { kind: "linked" };
    } catch (error) {
      notice = { kind: "error", code: errorCode(error) };
    }
  } else if (authError) {
    notice = { kind: "error", code: authError };
  }

  await ensureSession();
  trackOnce("first_standalone_launch");

  try {
    if (await finishTelegramWebLogin()) {
      notice = { kind: "linked" };
    }
  } catch (error) {
    notice = { kind: "error", code: errorCode(error) };
  }
  try {
    if (await checkTelegramBotLogin()) {
      notice = { kind: "linked" };
    }
  } catch (error) {
    notice = { kind: "error", code: errorCode(error) };
  }

  cleanAddress();
  void subscribePush();
}
