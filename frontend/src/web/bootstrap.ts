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
 *
 * A device that already has a session and has nothing to log in with starts at once —
 * the app opens on the data kept on the device (data/store.ts), with or without a
 * connection — and the session is checked in the background. If the server no longer
 * knows it, a guest takes its place and SESSION_CHANGED_EVENT tells the app to reload.
 */

import { trackOnce } from "./analytics";
import { ApiRequestError } from "../api/client";
import { createGuest, fetchAccount } from "../api/web";
import { getSessionToken, setSessionToken } from "./session";
import { applyLinkResult, checkTelegramBotLogin, hasPendingTelegramLogin } from "./login";
import { redeemHandoffLink } from "./handoff";
import { readSavedPreferences } from "../preferences";
import { STRINGS } from "../strings";
import { subscribePush } from "./push";

// The last handoff token tried on this device (the start address keeps it for good).
const HANDOFF_TRIED_KEY = "streak:handoff-tried";

/** The session was replaced in the background (see the header comment). */
export const SESSION_CHANGED_EVENT = "app:session-changed";

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

/** The start address's handoff token, unless it was tried already. */
function untriedHandoff(): string | null {
  const token = new URLSearchParams(window.location.search).get("h");
  try {
    return token && token !== localStorage.getItem(HANDOFF_TRIED_KEY) ? token : null;
  } catch {
    // Without storage: tried on every launch, the server just refuses a spent token.
    return token;
  }
}

/** Log in with the handoff token of the start address, once per token. */
async function redeemStartHandoff(): Promise<void> {
  const token = untriedHandoff();
  if (!token) {
    return;
  }
  try {
    localStorage.setItem(HANDOFF_TRIED_KEY, token);
  } catch {
    // See untriedHandoff.
  }
  try {
    const strings = STRINGS[readSavedPreferences().language];
    const result = await redeemHandoffLink(token, {
      title: strings.handoffMergeTitle,
      message: strings.handoffMergeMessage,
      confirmLabel: strings.handoffMergeConfirm,
      cancelLabel: strings.handoffMergeCancel,
    });
    if (result) {
      applyLinkResult(result);
    }
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

/** The device has a session and nothing to log in with: the app can open right away
 *  (startWebApp then only checks the session in the background). */
export function startsAtOnce(): boolean {
  return getSessionToken() !== null && !untriedHandoff() && !hasPendingTelegramLogin();
}

/** Run before rendering the web app. Throws only if no session can be had at all
 *  (first launch offline) — the caller shows a retry. Concurrent calls share one run
 *  (two would create two guest accounts). */
export function startWebApp(): Promise<void> {
  if (!running) {
    running = (startsAtOnce() ? startAtOnce() : start()).catch((error: unknown) => {
      running = null;
      throw error;
    });
  }
  return running;
}

/** A device with a session: open the app now, check the session meanwhile. */
async function startAtOnce(): Promise<void> {
  trackOnce("first_standalone_launch");
  cleanAddress();
  void checkSession();
}

async function checkSession(): Promise<void> {
  try {
    await fetchAccount();
  } catch (error) {
    // Only a session the server rejected is replaced; offline — keep it.
    if (error instanceof ApiRequestError && error.status === 401) {
      try {
        setSessionToken((await createGuest()).token);
        window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
      } catch {
        // Next launch tries again.
      }
    }
    return;
  }
  void subscribePush();
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
