/**
 * Landing and install flow of the web app (spec §2–3): one link for everyone, exactly
 * one relevant screen at a time.
 *
 *   desktop                → «StreakApp живёт в телефоне» + QR code to this link
 *   phone, `/`             → «Открыть в Telegram» / «Установить приложение»
 *   «Установить», in-app   → jump to the system browser on `/install` (Android: Chrome
 *                            intent; iPhone: x-safari-https), else a hint + copy link
 *   `/install`, Android    → native install button, or manual steps
 *   `/install`, iPhone     → video slot + numbered steps, arrow to Safari's button
 *   installed (Android)    → «Готово! Откройте StreakApp с рабочего стола»
 *   `/linked`              → Google linked from Telegram: «вернитесь в Telegram»
 *
 * A Telegram user arrives with a single-use handoff token (`h`). It is redeemed only in
 * a real browser (never inside Threads/Instagram — it would be spent there) and carried
 * through the jump; the session it gives is stored on the device, which on Android the
 * installed app shares. Every step is a funnel event; `src` travels along.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { installSource, track } from "../analytics";
import { redeemHandoff } from "../api/web";
import { devicePlatform, inAppBrowser } from "../platform";
import { setSessionToken } from "../session";
import {
  ANDROID_MANUAL_STEPS,
  ESCAPE_HINT_DELAY_MS,
  INSTALL_PROMPT_WAIT_MS,
  IOS_INSTALL,
  TELEGRAM_BOT_URL,
} from "./config";
import { installPrompt } from "./installPrompt";
import styles from "./Landing.module.css";

type Screen = "desktop" | "main" | "escapeHint" | "install" | "done" | "linked";

const INSTALL_PATH = "/install";
const LINKED_PATH = "/linked";

function initialScreen(): Screen {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === LINKED_PATH) {
    return "linked";
  }
  if (devicePlatform() === "desktop") {
    return "desktop";
  }
  return path === INSTALL_PATH ? "install" : "main";
}

/** This flow's address on another screen, keeping `src` and the handoff token. */
function flowUrl(path: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("src", installSource());
  const handoff = new URLSearchParams(window.location.search).get("h");
  if (handoff) {
    url.searchParams.set("h", handoff);
  }
  return url.toString();
}

/** Redeem the handoff token once, in a real browser. */
function useHandoff(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("h");
    if (!token || inAppBrowser()) {
      return;
    }
    redeemHandoff(token)
      .then((result) => {
        if (result.session) {
          setSessionToken(result.session.token);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        params.delete("h");
        const query = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
      });
  }, []);
}

export function Landing() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  useHandoff();

  useEffect(() => {
    document.documentElement.lang = "ru";
    document.title = "StreakApp";
    if (screen === "desktop") {
      track("desktop_qr_view");
    } else if (screen === "main") {
      track("landing_view", { in_app: inAppBrowser() });
    }
    // Only the screen the page opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseTelegram(): void {
    track("choose_telegram");
    window.location.href = TELEGRAM_BOT_URL;
  }

  function chooseInstall(): void {
    track("choose_install");
    const app = inAppBrowser();
    if (!app) {
      window.history.pushState(null, "", flowUrl(INSTALL_PATH));
      setScreen("install");
      return;
    }
    // Inside Threads, Instagram…: jump to the system browser, straight to /install.
    track("inapp_escape_attempt", { app });
    const target = new URL(flowUrl(INSTALL_PATH));
    if (devicePlatform() === "android") {
      const fallback = encodeURIComponent(target.toString());
      window.location.href =
        `intent://${target.host}${target.pathname}${target.search}` +
        `#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
    } else {
      window.location.href = `x-safari-https://${target.host}${target.pathname}${target.search}`;
    }
    window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        track("inapp_hint_shown", { app });
        setScreen("escapeHint");
      }
    }, ESCAPE_HINT_DELAY_MS);
  }

  return (
    <div className={styles.page}>
      {screen === "desktop" ? <DesktopScreen /> : null}
      {screen === "main" ? (
        <MainScreen onTelegram={chooseTelegram} onInstall={chooseInstall} />
      ) : null}
      {screen === "escapeHint" ? <EscapeHint /> : null}
      {screen === "install" ? <InstallScreen onDone={() => setScreen("done")} /> : null}
      {screen === "done" ? <DoneScreen /> : null}
      {screen === "linked" ? <LinkedScreen /> : null}
    </div>
  );
}

function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? styles.brandSmall : styles.brand}>
      <img className={styles.logo} src="/icons/icon-192.png" alt="" width={small ? 56 : 88} height={small ? 56 : 88} />
      <h1 className={styles.name}>StreakApp</h1>
    </div>
  );
}

function MainScreen({ onTelegram, onInstall }: { onTelegram: () => void; onInstall: () => void }) {
  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <Brand />
        <p className={styles.lead}>Отмечайте привычки в одно касание и смотрите, как растёт ваш стрик</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onInstall}>
          Установить приложение
        </button>
        <button type="button" className={styles.secondary} onClick={onTelegram}>
          Открыть в Telegram
        </button>
        <p className={styles.footnote}>Бесплатно. Работает в Telegram и как приложение на телефоне</p>
      </div>
    </main>
  );
}

function DesktopScreen() {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("src", installSource());
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(url.toString(), { width: 480, margin: 1, color: { dark: "#1c3f6e", light: "#ffffff" } }),
      )
      .then(setQr)
      .catch(() => setQr(null));
  }, []);
  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <Brand small />
        <h2 className={styles.title}>StreakApp живёт в телефоне</h2>
        <div className={styles.qrFrame}>
          {qr ? <img className={styles.qr} src={qr} alt="QR-код ссылки на StreakApp" /> : null}
        </div>
        <p className={styles.lead}>Наведите камеру телефона</p>
      </div>
    </main>
  );
}

function EscapeHint() {
  const [copied, setCopied] = useState(false);
  const ios = devicePlatform() === "ios";
  async function copy(): Promise<void> {
    const link = flowUrl(INSTALL_PATH);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Скопируйте ссылку", link);
    }
    setCopied(true);
  }
  return (
    <main className={styles.screen}>
      {/* Points at the in-app browser's menu: top right in Threads and Instagram. */}
      <div className={styles.menuPointer} aria-hidden="true">
        <span className={styles.menuDots}>⋯</span>
        <svg viewBox="0 0 60 80" className={styles.pointerArrow}>
          <path d="M30 76V8M30 8 12 26M30 8l18 18" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className={styles.center}>
        <h2 className={styles.title}>Откройте в браузере</h2>
        <p className={styles.lead}>
          {ios
            ? "Нажмите ⋯ и выберите «Открыть в браузере» — там можно установить приложение."
            : "Нажмите ⋮ и выберите «Открыть в браузере» (или «Открыть в Chrome»)."}
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => void copy()}>
          {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
        </button>
        {copied ? <p className={styles.footnote}>Вставьте её в адресную строку {ios ? "Safari" : "Chrome"}</p> : null}
      </div>
    </main>
  );
}

function InstallScreen({ onDone }: { onDone: () => void }) {
  const ios = devicePlatform() === "ios";
  useEffect(() => {
    track("install_screen_view");
  }, []);
  return ios ? <IosInstall /> : <AndroidInstall onDone={onDone} />;
}

function AndroidInstall({ onDone }: { onDone: () => void }) {
  const available = useSyncExternalStore(installPrompt.subscribe, installPrompt.available);
  const installed = useSyncExternalStore(installPrompt.subscribe, installPrompt.installed);
  const [waited, setWaited] = useState(false);
  const shownTracked = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), INSTALL_PROMPT_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (installed) {
      track("app_installed");
      onDone();
    }
  }, [installed, onDone]);

  useEffect(() => {
    if (available && !shownTracked.current) {
      shownTracked.current = true;
      track("install_prompt_shown");
    }
  }, [available]);

  async function install(): Promise<void> {
    const outcome = await installPrompt.show();
    if (outcome === "accepted") {
      track("install_prompt_accepted");
    } else if (outcome === "dismissed") {
      track("install_prompt_dismissed");
    }
  }

  if (available) {
    return (
      <main className={styles.screen}>
        <div className={styles.center}>
          <Brand />
          <p className={styles.lead}>Иконка появится на рабочем столе — открывайте StreakApp как обычное приложение</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => void install()}>
            Установить
          </button>
        </div>
      </main>
    );
  }
  if (!waited) {
    return (
      <main className={styles.screen}>
        <div className={styles.center}>
          <Brand />
          <p className={styles.lead}>Готовим установку…</p>
        </div>
      </main>
    );
  }
  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <Brand small />
        <h2 className={styles.title}>Добавьте на главный экран</h2>
        <Steps steps={ANDROID_MANUAL_STEPS} />
      </div>
    </main>
  );
}

function IosInstall() {
  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <h2 className={styles.title}>Добавьте StreakApp на экран «Домой»</h2>
        <div className={styles.video}>
          {IOS_INSTALL.video ? (
            <video src={IOS_INSTALL.video} autoPlay loop muted playsInline />
          ) : (
            // Placeholder: the owner records the real clip on a current iPhone and sets
            // IOS_INSTALL.video in landing/config.ts.
            <span className={styles.videoPlaceholder}>Здесь будет короткое видео-инструкция</span>
          )}
        </div>
        <Steps steps={IOS_INSTALL.steps} />
      </div>
      <div
        className={IOS_INSTALL.arrow === "bottom" ? styles.arrowBottom : styles.arrowTop}
        aria-hidden="true"
      >
        <svg viewBox="0 0 60 80">
          <path d="M30 4v68M30 72 12 54M30 72l18-18" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </main>
  );
}

function Steps({ steps }: { steps: readonly string[] }) {
  return (
    <ol className={styles.steps}>
      {steps.map((step, index) => (
        <li key={step}>
          <span className={styles.stepNumber}>{index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function DoneScreen() {
  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <Brand />
        <h2 className={styles.title}>Готово!</h2>
        <p className={styles.lead}>Откройте StreakApp с рабочего стола</p>
      </div>
    </main>
  );
}

function LinkedScreen() {
  const error = new URLSearchParams(window.location.search).get("error");
  return (
    <main className={styles.screen}>
      <div className={styles.center}>
        <Brand small />
        <h2 className={styles.title}>{error ? "Не получилось" : "Готово!"}</h2>
        <p className={styles.lead}>
          {error === "account_conflict"
            ? "Этот Google-аккаунт уже привязан к другому аккаунту Telegram."
            : error
              ? "Не удалось привязать Google. Вернитесь в Telegram и попробуйте ещё раз."
              : "Google-аккаунт привязан. Вернитесь в Telegram — всё уже на месте."}
        </p>
      </div>
    </main>
  );
}
