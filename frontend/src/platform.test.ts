// @vitest-environment jsdom
/**
 * Access gate of the web app (spec 4.2) and environment detection (spec 3.1).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { browserContext, devicePlatform, inAppBrowser, isInstalled, isTelegram } from "./platform";

const UA = {
  threadsIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 350.0.0.25.84 (iPhone15,2; iOS 18_1; ru_RU)",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0.0.0.90 Android",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
};

function setUserAgent(agent: string): void {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agent);
}

function setStandalone(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches && query === "(display-mode: standalone)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function setAddress(path: string): void {
  window.history.replaceState(null, "", path);
}

beforeEach(() => {
  sessionStorage.clear();
  setStandalone(false);
  setAddress("/");
  delete (window as { Telegram?: unknown }).Telegram;
  delete (navigator as { standalone?: boolean }).standalone;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("access gate", () => {
  it("a normal browser tab is not the installed app — even on /app", () => {
    setAddress("/app");
    expect(isInstalled()).toBe(false);
    expect(browserContext()).toBe("browser");
  });

  it("display-mode standalone opens the app", () => {
    setStandalone(true);
    expect(isInstalled()).toBe(true);
    expect(browserContext()).toBe("standalone");
  });

  it("iOS navigator.standalone opens the app", () => {
    (navigator as { standalone?: boolean }).standalone = true;
    expect(isInstalled()).toBe(true);
  });

  it("pwa=1 from the manifest start_url opens the app and survives in-app navigation", () => {
    setAddress("/app?pwa=1");
    expect(isInstalled()).toBe(true);
    setAddress("/app");
    expect(isInstalled()).toBe(true);
  });

  it("inside Telegram is the Mini App, not the web app", () => {
    (window as { Telegram?: unknown }).Telegram = { WebApp: { initData: "query_id=1&hash=x" } };
    expect(isTelegram()).toBe(true);
    expect(browserContext()).toBe("telegram");
  });

  it("Telegram SDK without initData (plain browser) is not Telegram", () => {
    (window as { Telegram?: unknown }).Telegram = { WebApp: { initData: "" } };
    expect(isTelegram()).toBe(false);
  });
});

describe("environment detection", () => {
  it("detects Threads on iPhone", () => {
    setUserAgent(UA.threadsIos);
    expect(devicePlatform()).toBe("ios");
    expect(inAppBrowser()).toBe("threads");
    expect(browserContext()).toBe("in_app");
  });

  it("detects Instagram on Android", () => {
    setUserAgent(UA.instagramAndroid);
    expect(devicePlatform()).toBe("android");
    expect(inAppBrowser()).toBe("instagram");
  });

  it("normal browsers are not in-app", () => {
    setUserAgent(UA.chromeAndroid);
    expect(inAppBrowser()).toBeNull();
    setUserAgent(UA.safariIos);
    expect(inAppBrowser()).toBeNull();
    expect(devicePlatform()).toBe("ios");
  });

  it("desktop", () => {
    setUserAgent(UA.desktop);
    expect(devicePlatform()).toBe("desktop");
  });
});
