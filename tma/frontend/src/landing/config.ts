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

/**
 * iPhone install instruction (spec 3.5): a short looping video and numbered steps.
 * `video` — a file in /public (the owner records it on a current iPhone); null — the
 * placeholder frame is shown. `arrow` — where the screen's button is: Safari's «⋯» /
 * «Поделиться» sits at the bottom on recent iOS, at the top on iPad.
 */
export const IOS_INSTALL = {
  video: null as string | null,
  arrow: "bottom" as "bottom" | "top",
  steps: [
    "Нажмите «⋯» внизу справа, а затем «Поделиться» (или сразу значок «Поделиться» □↑)",
    "Прокрутите вниз и выберите «На экран «Домой»»",
    "Нажмите «Добавить» в правом верхнем углу",
    "Откройте StreakApp с рабочего стола",
  ],
};

/** Android without the native install button (Firefox, Samsung Internet…). */
export const ANDROID_MANUAL_STEPS = [
  "Нажмите «⋮» в правом верхнем углу браузера",
  "Выберите «Добавить на главный экран» или «Установить приложение»",
  "Подтвердите — и откройте StreakApp с рабочего стола",
];
