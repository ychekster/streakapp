/**
 * Landing and install flow of the web app (spec §2–3): one link for everyone, exactly
 * one relevant screen at a time.
 *
 *   desktop                → QR code to this link, «наведите камеру телефона»
 *   phone, `/`             → «Установить приложение» / «Открыть в Telegram»
 *   «Установить», in-app   → jump to the system browser on `/install` (Android: Chrome
 *                            intent; iPhone: x-safari-https), else a hint + copy link
 *   `/install`, Android    → native install button, or manual steps
 *   `/install`, iPhone     → steps (and an optional video)
 *   installed (Android)    → «Готово», open it from the home screen
 *
 * A Telegram user arrives with a single-use handoff token (`h`), straight on `/install`.
 * On Android it is redeemed here, in a real browser (never inside Threads/Instagram — it
 * would be spent there): the session is stored on the device, which the installed app
 * shares. The iPhone home screen app does not share Safari's storage — so there the token
 * is not spent: it goes into the app's start address (the manifest from the API) and the
 * app logs in on its first launch (web/bootstrap.ts). Every step is a funnel event; `src`
 * travels along.
 *
 * The look is the app's own (iOS 26, light or dark with the system): an onboarding
 * screen with the app icon, a title, one line of text and the bottom capsule button;
 * install steps sit in a Settings-style card. Desktop is a macOS-like card with the QR.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { installSource, track } from "../web/analytics";
import { API_BASE_URL } from "../api/client";
import { redeemHandoff } from "../api/web";
import { devicePlatform, inAppBrowser } from "../platform";
import { setSessionToken } from "../web/session";
import {
  ANDROID_MANUAL_STEPS,
  ESCAPE_HINT_DELAY_MS,
  INSTALL_PROMPT_WAIT_MS,
  IOS_INSTALL,
  TELEGRAM_BOT_URL,
  type InstallStep,
  type StepIcon as StepIconName,
} from "./config";
import { installPrompt } from "./installPrompt";
import styles from "./Landing.module.css";

type Screen = "desktop" | "main" | "escapeHint" | "install" | "done";

const INSTALL_PATH = "/install";
// 360px WebP (the largest icon here is 120pt at 3×): a fraction of the 512px PNG.
const APP_ICON = "/icons/app-icon.webp";

function initialScreen(): Screen {
  if (devicePlatform() === "desktop") {
    return "desktop";
  }
  const path = window.location.pathname.replace(/\/+$/, "");
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

/** iPhone: the app added to the home screen starts with the handoff token. */
function carryHandoffToInstalledApp(token: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = `${API_BASE_URL}/web/manifest?h=${encodeURIComponent(token)}`;
}

/** Use the handoff token once, in a real browser (see the module comment). */
function useHandoff(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("h");
    if (!token || inAppBrowser()) {
      return;
    }
    if (devicePlatform() === "ios") {
      // Kept in the address too: older iOS starts the app at the page's own address.
      carryHandoffToInstalledApp(token);
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
    document.title = "Knot";
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
    </div>
  );
}

/** The app icon; `badge` — a green check on its corner (installed). */
function AppIcon({ size, badge = false }: { size: "large" | "medium"; badge?: boolean }) {
  return (
    <span className={size === "large" ? styles.iconLarge : styles.iconMedium}>
      <img className={styles.icon} src={APP_ICON} alt="" />
      {badge ? (
        <span className={styles.iconBadge} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="m6.5 12.5 3.5 3.5 7.5-8" />
          </svg>
        </span>
      ) : null}
    </span>
  );
}

/** A phone screen: the content centred in the free space, the buttons at the bottom. */
function PhoneScreen({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <main className={styles.screen}>
      <div className={styles.hero}>{children}</div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </main>
  );
}

function MainScreen({ onTelegram, onInstall }: { onTelegram: () => void; onInstall: () => void }) {
  return (
    <PhoneScreen
      actions={
        <>
          <button type="button" className={styles.primary} onClick={onInstall}>
            Установить приложение
          </button>
          <button type="button" className={styles.plain} onClick={onTelegram}>
            Открыть в Telegram
          </button>
        </>
      }
    >
      <AppIcon size="large" />
      <h1 className={styles.title}>Knot</h1>
      <p className={styles.subtitle}>Отмечайте привычки и копите стрики</p>
    </PhoneScreen>
  );
}

function DesktopScreen() {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("src", installSource());
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(url.toString(), {
          width: 440,
          margin: 0,
          color: { dark: "#1c1c1e", light: "#ffffff" },
        }),
      )
      .then(setQr)
      .catch(() => setQr(null));
  }, []);
  return (
    <main className={styles.desktop}>
      <div className={styles.window}>
        <AppIcon size="medium" />
        <h1 className={styles.desktopTitle}>Knot живёт в телефоне</h1>
        <p className={styles.desktopText}>Наведите камеру телефона на код</p>
        <div className={styles.qrTile}>
          {qr ? <img className={styles.qr} src={qr} alt="QR-код ссылки на Knot" /> : null}
        </div>
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
    <PhoneScreen
      actions={
        <>
          {copied ? (
            <p className={styles.footnote}>
              Вставьте её в адресную строку {ios ? "Safari" : "Chrome"}
            </p>
          ) : null}
          <button type="button" className={styles.tinted} onClick={() => void copy()}>
            {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          </button>
        </>
      }
    >
      <AppIcon size="medium" />
      <h1 className={styles.title}>Откройте в браузере</h1>
      <p className={styles.subtitle}>
        {ios
          ? "Откройте меню этого приложения (⋯) и выберите «Открыть в браузере»"
          : "Откройте меню этого приложения (⋮) и выберите «Открыть в браузере» или «Открыть в Chrome»"}
      </p>
    </PhoneScreen>
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

  if (!available && waited) {
    return <StepsScreen title="Добавьте на главный экран" steps={ANDROID_MANUAL_STEPS} />;
  }
  // While the browser's install prompt is on its way: the same screen with a spinner in
  // the button, so nothing moves when it arrives.
  return (
    <PhoneScreen
      actions={
        <button
          type="button"
          className={styles.primary}
          disabled={!available}
          onClick={() => void install()}
        >
          {available ? "Установить" : <span className={styles.spinner} aria-label="Загрузка" />}
        </button>
      }
    >
      <AppIcon size="large" />
      <h1 className={styles.title}>Knot</h1>
      <p className={styles.subtitle}>Иконка появится на рабочем столе</p>
    </PhoneScreen>
  );
}

function IosInstall() {
  return (
    <StepsScreen
      title="Добавьте на экран Домой"
      steps={IOS_INSTALL.steps}
      video={IOS_INSTALL.video}
    />
  );
}

/** Install instruction: the title, an optional video and the steps in a card. */
function StepsScreen({
  title,
  steps,
  video = null,
}: {
  title: string;
  steps: readonly InstallStep[];
  video?: string | null;
}) {
  return (
    <PhoneScreen>
      <AppIcon size="medium" />
      <h1 className={styles.title}>{title}</h1>
      {video ? <video className={styles.video} src={video} autoPlay loop muted playsInline /> : null}
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.text} className={styles.step}>
            <StepIcon name={step.icon} />
            <span className={styles.stepText}>{step.text}</span>
          </li>
        ))}
      </ol>
    </PhoneScreen>
  );
}

/** A step's icon: a Settings-style tile with a glyph, or the app icon itself. */
function StepIcon({ name }: { name: StepIconName }) {
  if (name === "app") {
    return <img className={styles.stepAppIcon} src={APP_ICON} alt="" />;
  }
  return (
    <span className={styles.stepTile} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {name === "browser" ? (
          <>
            <circle cx="12" cy="12" r="8.25" />
            <path className={styles.needle} d="m15.25 8.75-2 4.5-4.5 2 2-4.5Z" />
          </>
        ) : null}
        {name === "share" ? (
          <path d="M12 3.5v11M8.25 7.25 12 3.5l3.75 3.75M9 10H7.5A1.5 1.5 0 0 0 6 11.5v7A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H15" />
        ) : null}
        {name === "addSquare" ? (
          <path d="M8 4.75h8A3.25 3.25 0 0 1 19.25 8v8A3.25 3.25 0 0 1 16 19.25H8A3.25 3.25 0 0 1 4.75 16V8A3.25 3.25 0 0 1 8 4.75ZM12 8.5v7M8.5 12h7" />
        ) : null}
        {name === "add" ? <path d="M12 5.5v13M5.5 12h13" /> : null}
        {name === "more" ? (
          <g className={styles.dots}>
            <circle cx="12" cy="6" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="18" r="1.75" />
          </g>
        ) : null}
      </svg>
    </span>
  );
}

function DoneScreen() {
  return (
    <PhoneScreen>
      <AppIcon size="large" badge />
      <h1 className={styles.title}>Готово</h1>
      <p className={styles.subtitle}>Откройте Knot с рабочего стола</p>
    </PhoneScreen>
  );
}
