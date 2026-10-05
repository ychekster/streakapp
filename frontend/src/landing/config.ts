/**
 * Landing and install flow settings — everything that may need tuning after testing on
 * real phones lives here: in-app browser detection, timings, the bot link and the
 * install instructions.
 */

/**
 * In-app browsers to escape from before installing (spec 3.1). Matched against the
 * User-Agent in order; the first match wins. Verify on real devices — apps change their
 * User-Agent: Threads currently reports "Barcelona" (its internal name), Instagram
 * "Instagram", Facebook "FBAN"/"FBAV"/"FB_IAB". The last entry catches any other Android
 * app that opens links in a WebView ("; wv)").
 *
 * Telegram's own browser is not detectable (on iPhone it is Safari View Controller, on
 * Android Chrome Custom Tabs, with normal User-Agents) — so Telegram users are sent to
 * the real browser by the Mini App instead (see InstallFromTelegramScreen).
 */
export const IN_APP_BROWSERS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "threads", pattern: /Barcelona/i },
  { name: "instagram", pattern: /Instagram/i },
  { name: "facebook", pattern: /FBAN|FBAV|FB_IAB|FBIOS/i },
  { name: "messenger", pattern: /Messenger/i },
  { name: "tiktok", pattern: /BytedanceWebview|musical_ly|TikTok/i },
  { name: "twitter", pattern: /Twitter/i },
  { name: "linkedin", pattern: /LinkedInApp/i },
  { name: "snapchat", pattern: /Snapchat/i },
  { name: "pinterest", pattern: /Pinterest/i },
  { name: "line", pattern: /\sLine\//i },
  { name: "vk", pattern: /VKAndroidApp|com\.vkontakte/i },
  { name: "android_webview", pattern: /Android.*;\s?wv\)/i },
];

/** The bot that «Открыть в Telegram» opens (build-time VITE_TELEGRAM_BOT_URL). */
export const TELEGRAM_BOT_URL: string =
  import.meta.env.VITE_TELEGRAM_BOT_URL ?? "https://t.me/onStreakBot";

/** After trying to jump to the system browser: if the page is still visible this long
 *  later, the jump did not happen — show the hint screen (ms). */
export const ESCAPE_HINT_DELAY_MS = 1500;

/** How long to wait for Android's native install prompt before showing manual
 *  instructions instead (ms). */
export const INSTALL_PROMPT_WAIT_MS = 3500;

/** Analytics source when the link has none. */
export const DEFAULT_SRC = "direct";

/** Glyph of an install step's icon tile (see StepIcon in Landing.tsx); `app` — the app
 *  icon itself. */
export type StepIcon = "browser" | "share" | "addSquare" | "add" | "more" | "app";

export interface InstallStep {
  icon: StepIcon;
  text: string;
}

/**
 * iPhone install instruction (spec 3.5): numbered steps and, optionally, a short looping
 * video above them. `video` — a file in /public (the owner records it on a current
 * iPhone); null — no video.
 *
 * The steps name the buttons, not where they are: their place and look differ between
 * iOS versions and browsers (Safari's «Поделиться» may sit in the ⋯ or ☰ menu, «На экран
 * Домой» behind «Показать больше»). The first step sends the user to Safari: Telegram's built-in
 * browser cannot install an app and cannot be told apart from Safari by the page.
 */
export const IOS_INSTALL = {
  video: null as string | null,
  steps: [
    { icon: "browser", text: "Убедитесь, что страница открыта в Safari" },
    { icon: "share", text: "Откройте меню ⋯ или ☰ и нажмите «Поделиться»" },
    { icon: "addSquare", text: "Нажмите «Показать больше» и выберите «На экран Домой»" },
    { icon: "add", text: "Нажмите «Добавить»" },
    { icon: "app", text: "Откройте StreakApp с рабочего стола" },
  ] as InstallStep[],
};

/** Android without the native install button (Telegram's built-in browser, Firefox…). */
export const ANDROID_MANUAL_STEPS: InstallStep[] = [
  { icon: "browser", text: "Убедитесь, что страница открыта в Chrome" },
  { icon: "more", text: "Откройте меню ⋮ или ☰" },
  { icon: "addSquare", text: "Выберите «Установить» или «Добавить на главный экран»" },
  { icon: "app", text: "Откройте StreakApp с рабочего стола" },
];
