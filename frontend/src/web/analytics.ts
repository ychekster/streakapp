/**
 * Funnel analytics (spec §10): fire-and-forget events to `POST /events`.
 *
 * Every event carries a random device id (`anon_id`, kept before any account exists),
 * the platform (ios/android/desktop), how the page is open (in_app/browser/standalone/
 * telegram) and the install source `src` from the link (threads, bot, settings…). The
 * source is remembered on the device at the first visit, so later steps — and, on
 * Android, the installed app, which shares storage with Chrome — keep it.
 *
 * Failures are swallowed: analytics never blocks or breaks the UI.
 */

import { authorizationHeader } from "../api/client";
import { DEFAULT_SRC } from "../landing/config";
import { browserContext, devicePlatform, isTelegram } from "../platform";
import { openedByLink } from "../telegram/webapp";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const ANON_KEY = "streak:anon";
const SRC_KEY = "streak:src";

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not critical for analytics.
  }
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

/** The device's random analytics id. */
export function anonId(): string {
  const existing = storageGet(ANON_KEY);
  if (existing) {
    return existing;
  }
  const created = randomId();
  storageSet(ANON_KEY, created);
  return created;
}

/** Install source: `src` of the current link, else the one remembered on the device. */
export function installSource(): string {
  const fromLink = new URLSearchParams(window.location.search).get("src");
  if (fromLink) {
    const clean = fromLink.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    if (clean) {
      // First touch wins: a later visit without a source keeps the original one.
      if (!storageGet(SRC_KEY)) {
        storageSet(SRC_KEY, clean);
      }
      return clean;
    }
  }
  return storageGet(SRC_KEY) ?? DEFAULT_SRC;
}

/** Record a funnel step. Never throws, never waits. */
export function track(event: string, props?: Record<string, unknown>): void {
  try {
    const authorization = authorizationHeader();
    void fetch(`${API_BASE_URL}/events`, {
      method: "POST",
      // keepalive: the event survives the page navigating away (escape to Chrome, t.me).
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({
        event,
        anon_id: anonId(),
        platform: devicePlatform(),
        browser_context: browserContext(),
        src: installSource(),
        props: props ?? null,
      }),
    }).catch(() => undefined);
  } catch {
    // Analytics must never break the page.
  }
}

/** Where the app was opened from — `from=` of the address: the bot's buttons and push
 *  notifications put it there (backend/messaging.py, bot/reminders.py). */
const APP_OPEN_ORIGINS = [
  "menu",
  "welcome",
  "reminder",
  "broadcast",
  "push",
  "install_offer",
  "link",
  "icon",
];

let appOpenTracked = false;

/** «Opened the app» for the admin panel's analytics, once per launch: where from (the
 *  address's `from`; without it — the bot's menu button or a direct link in Telegram, the
 *  home screen icon on the web) and which broadcast (`b`). The two parameters are then
 *  dropped from the address, so a reload is not counted as a new open from there. */
export function trackAppOpen(): void {
  if (appOpenTracked) {
    return;
  }
  appOpenTracked = true;
  try {
    const url = new URL(window.location.href);
    const from = url.searchParams.get("from");
    const origin =
      from && APP_OPEN_ORIGINS.includes(from)
        ? from
        : isTelegram()
          ? openedByLink()
            ? "link"
            : "menu"
          : "icon";
    track("app_open", { from: origin, b: url.searchParams.get("b") });
    if (url.searchParams.has("from") || url.searchParams.has("b")) {
      url.searchParams.delete("from");
      url.searchParams.delete("b");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  } catch {
    // Analytics must never break the app.
  }
}

/** A push notification was tapped while the app was already open. */
export function trackPushOpen(): void {
  track("app_open", { from: "push" });
}

/** Link to the bot that keeps the install source: `?start=src_<source>` (the bot remembers
 *  it for a new user, backend/sources.py). Without a real source — the plain link. */
export function botLinkWithSource(botUrl: string): string {
  const source = installSource();
  if (!source || source === DEFAULT_SRC) {
    return botUrl;
  }
  try {
    const url = new URL(botUrl);
    url.searchParams.set("start", `src_${source}`);
    return url.toString();
  } catch {
    return botUrl;
  }
}

/** Record a step only the first time on this device (e.g. first standalone launch). */
export function trackOnce(event: string, props?: Record<string, unknown>): void {
  const key = `streak:event:${event}`;
  if (storageGet(key)) {
    return;
  }
  storageSet(key, "1");
  track(event, props);
}
