/** Точка входа фронтенда: монтирует приложение и подключает глобальные стили.
 *
 * One page, three ways in (spec 4.2):
 *  - inside Telegram — the Mini App, exactly as before;
 *  - launched from the home screen icon (platform.isInstalled) — the web app, after its
 *    session is ready (web/bootstrap.ts);
 *  - anything else (a browser tab, Threads, desktop) — the landing and install flow.
 */

import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { StatusMessage } from "./components/StatusMessage";
import { captureInstallPrompt } from "./landing/installPrompt";
import { Landing } from "./landing/Landing";
import { isInstalled, isTelegram } from "./platform";
import { readSavedPreferences } from "./preferences";
import { installPressFeedback } from "./pressFeedback";
import { STRINGS } from "./strings";
import { applyPlatform } from "./telegram/webapp";
import { startWebApp } from "./web/bootstrap";
// Порядок важен: сначала дизайн-токены (переменные), затем глобальные стили.
import "./styles/variables.css";
import "./styles/global.css";

// Платформу отмечаем до первой отрисовки: от неё зависит оформление (см. variables.css),
// и иначе Android-клиент на мгновение показал бы вариант для iPhone.
applyPlatform();
// Подсветка нажатий, не срабатывающая при прокрутке (см. pressFeedback.ts).
installPressFeedback();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Корневой элемент #root не найден в index.html");
}

type Entry = "telegram" | "web" | "landing";
const entry: Entry = isTelegram() ? "telegram" : isInstalled() ? "web" : "landing";
document.documentElement.dataset.app = entry;

if (entry !== "telegram") {
  // Service worker (sw.ts): app shell cache and push notifications. Never inside
  // Telegram — the Mini App works exactly as before.
  registerSW({ immediate: true });
}
if (entry === "landing") {
  captureInstallPrompt();
}
if (entry === "web") {
  // Scroll is the app's own: each tab and the screen under a nested one reopen where they
  // were left (App). The browser must not restore its saved position when «Назад» steps
  // back through history (web/WebChrome.tsx) — it would throw the list back to the top.
  window.history.scrollRestoration = "manual";
}

/** The installed web app: make sure there is a session, then the app. */
function WebRoot() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const strings = STRINGS[readSavedPreferences().language];

  const start = useCallback(() => {
    setState("loading");
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
      {entry === "telegram" ? <App /> : entry === "web" ? <WebRoot /> : <Landing />}
    </ErrorBoundary>
  </StrictMode>,
);
