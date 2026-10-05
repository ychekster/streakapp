/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Типизация переменных окружения, доступных через import.meta.env.
interface ImportMetaEnv {
  /** Базовый URL API-сервера TMA (backend). */
  readonly VITE_API_BASE_URL?: string;
  /** Bot link of «Открыть в Telegram» on the landing (e.g. https://t.me/onStreakBot). */
  readonly VITE_TELEGRAM_BOT_URL?: string;
  /** Address of the web app (e.g. https://pwa.streakapp.io): the landing and the install
   *  flow open only there. Empty — wherever the page is (local development). */
  readonly VITE_WEB_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
