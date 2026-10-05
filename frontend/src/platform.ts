/**
 * Where the app is running — the single place for these checks (spec 3.1, 4.2, 5).
 *
 * - `appPlatform()` / `usePlatform()`: "telegram" (Mini App, as before) or "web" (the
 *   installed app). Components ask this instead of probing `window.Telegram` themselves.
 * - `isInstalled()`: the access gate of the web app — it runs only when launched from
 *   the home screen icon. Any of: display-mode standalone, iOS `navigator.standalone`,
 *   or `pwa=1` in the address (the manifest's start_url) — so a user who did install is
 *   never locked out because one check misfires.
 * - `devicePlatform()`: ios / android / desktop; `inAppBrowser()`: opened inside
 *   Threads, Instagram, Facebook… (their list lives in landing/config.ts).
 */

import { IN_APP_BROWSERS } from "./landing/config";
import { isTelegramAvailable } from "./telegram/webapp";

export type AppPlatform = "telegram" | "web";
export type DevicePlatform = "ios" | "android" | "desktop";
/** How the page is open: matches `browser_context` of funnel events. */
export type BrowserContext = "telegram" | "standalone" | "in_app" | "browser";

/** The manifest start_url carries it: `/app?pwa=1`. */
export const INSTALLED_PARAM = "pwa";
// Remembered for the tab's lifetime: in-app navigation drops the query string.
const INSTALLED_FLAG = "streak:pwa";

/** Inside the Telegram Mini App (the SDK is there and has signed initData). */
export function isTelegram(): boolean {
  return isTelegramAvailable();
}

/** Launched from the home screen icon (see the module comment). */
export function isInstalled(): boolean {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return true;
    }
    if (window.matchMedia("(display-mode: fullscreen)").matches) {
      return true;
    }
  } catch {
    // Old browser without matchMedia — fall through to the other checks.
  }
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }
  if (new URLSearchParams(window.location.search).get(INSTALLED_PARAM) === "1") {
    try {
      sessionStorage.setItem(INSTALLED_FLAG, "1");
    } catch {
      // Storage unavailable: the address check alone still works on this load.
    }
    return true;
  }
  try {
    return sessionStorage.getItem(INSTALLED_FLAG) === "1";
  } catch {
    return false;
  }
}

/** Telegram Mini App or the installed web app. */
export function appPlatform(): AppPlatform {
  return isTelegram() ? "telegram" : "web";
}

/** Same as appPlatform(); a hook for components (the platform never changes at runtime). */
export function usePlatform(): AppPlatform {
  return appPlatform();
}

/** The phone (or desktop) the page is open on. iPadOS reports itself as a Mac. */
export function devicePlatform(): DevicePlatform {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(agent)) {
    return "ios";
  }
  if (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1) {
    return "ios";
  }
  if (/Android/i.test(agent)) {
    return "android";
  }
  return "desktop";
}

/** Name of the in-app browser the page is open in (threads, instagram…), or null. */
export function inAppBrowser(): string | null {
  const agent = navigator.userAgent;
  const found = IN_APP_BROWSERS.find((browser) => browser.pattern.test(agent));
  return found ? found.name : null;
}

/** How the page is open right now. */
export function browserContext(): BrowserContext {
  if (isTelegram()) {
    return "telegram";
  }
  if (isInstalled()) {
    return "standalone";
  }
  return inAppBrowser() ? "in_app" : "browser";
}
