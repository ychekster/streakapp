/** Точка входа фронтенда: монтирует приложение и подключает глобальные стили.
 *
 * One page, three ways in (spec 4.2):
 *  - inside Telegram — the Mini App, exactly as before;
 *  - launched from the home screen icon (platform.isInstalled) — the web app, after its
 *    session is ready (web/bootstrap.ts);
 *  - anything else (a browser tab, Threads, desktop) — the landing and install flow.
 */

import { lazy, StrictMode, Suspense, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { StatusMessage } from "./components/StatusMessage";
import { captureInstallPrompt } from "./landing/installPrompt";
import { isInstalled, isTelegram } from "./platform";
import { readSavedPreferences, resolveTheme } from "./preferences";
import { installPressFeedback } from "./pressFeedback";
import { STRINGS } from "./strings";
import { applyPlatform, setTelegramColors } from "./telegram/webapp";
import { startsAtOnce, startWebApp } from "./web/bootstrap";
// Порядок важен: сначала дизайн-токены (переменные), затем глобальные стили.
import "./styles/variables.css";
import "./styles/global.css";

// Платформу отмечаем до первой отрисовки: от неё зависит оформление (см. variables.css),
// и иначе Android-клиент на мгновение показал бы вариант для iPhone.
applyPlatform();
// Подсветка нажатий, не срабатывающая при прокрутке (см. pressFeedback.ts).
installPressFeedback();

// The install page is a file of its own: the app (Telegram, installed) never loads it,
// so it starts with less code.
const Landing = lazy(() => import("./landing/Landing").then((module) => ({ default: module.Landing })));

const container = document.getElementById("root");
if (!container) {
  throw new Error("Корневой элемент #root не найден в index.html");
}

type Entry = "telegram" | "web" | "landing";
const entry: Entry = isTelegram() ? "telegram" : isInstalled() ? "web" : "landing";
document.documentElement.dataset.app = entry;

// The web app lives at its own address (VITE_WEB_APP_URL): the home screen icon belongs
// to the site it was added from. The Mini App's address opened in a plain browser goes
// there — same path and parameters — so nobody installs the app from the wrong one.
const webAppUrl = import.meta.env.VITE_WEB_APP_URL?.replace(/\/$/, "");
const elsewhere = entry === "landing" && webAppUrl && new URL(webAppUrl).origin !== window.location.origin;
if (elsewhere) {
  window.location.replace(`${webAppUrl}${window.location.pathname}${window.location.search}`);
}

if (entry !== "telegram" && !elsewhere) {
  // Service worker (sw.ts): app shell cache and push notifications. Never inside
  // Telegram — the Mini App works exactly as before.
  registerSW({ immediate: true });
}
if (entry === "landing" && !elsewhere) {
  captureInstallPrompt();
  // The landing has no settings: light or dark with the system, switching along with it.
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const applySystemTheme = (): void => {
    document.documentElement.dataset.theme = darkQuery.matches ? "dark" : "light";
    // Safari's bars take the page color.
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-background")
      .trim();
    setTelegramColors(background || "#f2f2f7");
  };
  applySystemTheme();
  darkQuery.addEventListener("change", applySystemTheme);
}
if (entry === "web") {
  // The saved theme right away, so the start screen (before App applies the settings)
  // and the status bar strip are already in it.
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(readSavedPreferences().theme, dark);
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-background")
    .trim();
  setTelegramColors(background || "#f2f2f7");
  // Scroll is the app's own: each tab and the screen under a nested one reopen where they
  // were left (App). The browser must not restore its saved position when «Назад» steps
  // back through history (web/WebChrome.tsx) — it would throw the list back to the top.
  window.history.scrollRestoration = "manual";
}

/** The installed web app: make sure there is a session, then the app. */
function WebRoot() {
  // With a session on the device the app opens at once, even without a connection.
  const [state, setState] = useState<"loading" | "ready" | "error">(() =>
    startsAtOnce() ? "ready" : "loading",
  );
  const strings = STRINGS[readSavedPreferences().language];

  const start = useCallback(() => {
    setState((current) => (current === "ready" ? current : "loading"));
    startWebApp()
      .then(() => setState("ready"))
      .catch(() => setState("error"));
  }, []);

  useEffect(start, [start]);

  if (state === "ready") {
    return <App />;
  }
  if (state === "error") {
    return (
      <StatusMessage
        icon="alert"
        title={strings.webStartFailedTitle}
        description={strings.webStartFailedDescription}
        actionLabel={strings.errorRetry}
        onAction={start}
      />
    );
  }
  return <StatusMessage icon="spinner" title={strings.adminLoading} />;
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      {elsewhere ? null : entry === "telegram" ? (
        <App />
      ) : entry === "web" ? (
        <WebRoot />
      ) : (
        <Suspense fallback={null}>
          <Landing />
        </Suspense>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
