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

import { authorizationHeader } from "./api/client";
import { DEFAULT_SRC } from "./landing/config";
import { browserContext, devicePlatform } from "./platform";

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

/** Record a step only the first time on this device (e.g. first standalone launch). */
export function trackOnce(event: string, props?: Record<string, unknown>): void {
  const key = `streak:event:${event}`;
  if (storageGet(key)) {
    return;
  }
  storageSet(key, "1");
  track(event, props);
}
