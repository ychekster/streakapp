/**
 * Picks up a "log in via Telegram" confirmed in the bot (web/login.ts) while the user is
 * anywhere in the web app: when the app comes back to the foreground and every few
 * seconds while a login is pending. `onDone` — the account switched: reload everything.
 */

import { useEffect } from "react";

import { TELEGRAM_LOGIN_POLL_MS } from "../constants";
import { checkTelegramBotLogin, hasPendingTelegramLogin } from "../web/login";

export function useTelegramLoginWatcher(enabled: boolean, onDone: () => void): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let busy = false;
    const check = (): void => {
      if (busy || !hasPendingTelegramLogin() || document.visibilityState !== "visible") {
        return;
      }
      busy = true;
      checkTelegramBotLogin()
        .then((result) => {
          if (result) {
            onDone();
          }
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    };
    const timer = window.setInterval(check, TELEGRAM_LOGIN_POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [enabled, onDone]);
}
