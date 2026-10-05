/**
 * Start of the installed web app, before the first screen (spec 4.2, 6.2):
 *
 * 1. installed from the Mini App: the start address carries its single-use handoff token
 *    (`h=`, see landing/Landing.tsx) — log into that Telegram account right away. On
 *    iPhone the home screen app does not share Safari's storage, so this is the only way
 *    the session gets there; a token already spent is remembered and not tried again;
 * 2. make sure there is a session: the stored one if the server still knows it,
 *    otherwise a new guest account — silently, no sign-up form;
 * 3. pick up a bot login confirmed while the app was closed;
 * 4. clean the address (keeping `pwa=1` and the habit a notification opens) and
 *    re-attach this device's push subscription to the account.
 *
 * What happened with a bot login is kept for Settings to show (`authNotice`).
 */

import { trackOnce } from "./analytics";
import { ApiRequestError } from "../api/client";
import { createGuest, fetchAccount, redeemHandoff } from "../api/web";
import { getSessionToken, setSessionToken } from "./session";
import { applyLinkResult, checkTelegramBotLogin } from "./login";
import { subscribePush } from "./push";

// The last handoff token tried on this device (the start address keeps it for good).
const HANDOFF_TRIED_KEY = "streak:handoff-tried";

export type AuthNotice = { kind: "linked" } | { kind: "error"; code: string };

let notice: AuthNotice | null = null;

/** The outcome of a bot login picked up at start (App then opens Settings), or null. */
export function authNotice(): AuthNotice | null {
  return notice;
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

/** Log in with the handoff token of the start address, once per token. */
async function redeemStartHandoff(): Promise<void> {
  const token = new URLSearchParams(window.location.search).get("h");
  let tried: string | null = null;
  try {
    tried = localStorage.getItem(HANDOFF_TRIED_KEY);
    if (token) {
      localStorage.setItem(HANDOFF_TRIED_KEY, token);
    }
  } catch {
    // Without storage: tried on every launch, the server just refuses a spent token.
  }
  if (!token || token === tried) {
    return;
  }
  try {
    applyLinkResult(await redeemHandoff(token));
  } catch {
    // Expired or already used (e.g. redeemed by the browser on Android): carry on.
  }
}

/** Address without the login leftovers: `pwa=1` and `habit` stay. */
function cleanAddress(): void {
  const url = new URL(window.location.href);
  for (const key of ["h", "src"]) {
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
  await redeemStartHandoff();
  await ensureSession();
  trackOnce("first_standalone_launch");

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
