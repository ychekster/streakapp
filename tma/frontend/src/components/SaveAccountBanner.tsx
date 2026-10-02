/**
 * Calm one-line reminder for guests of the web app (spec 7.3): «Привяжите аккаунт, чтобы
 * не потерять прогресс». Not red, not a popup: a soft brand-blue row above the habits —
 * in the flow of the page, so it never covers a habit or the bottom navigation.
 *
 * Shown only after the first habit, while the account is still a guest. A tap opens
 * Settings → Account; «×» hides it, and it comes back after SAVE_BANNER_SNOOZE_DAYS.
 */

import { useState } from "react";

import { SAVE_BANNER_SNOOZE_DAYS } from "../constants";
import { useStrings } from "../preferences";
import styles from "./SaveAccountBanner.module.css";

const HIDDEN_UNTIL_KEY = "streak:save-banner-hidden-until";
const DAY_MS = 24 * 60 * 60 * 1000;

function hiddenNow(): boolean {
  try {
    return Number(localStorage.getItem(HIDDEN_UNTIL_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function SaveAccountBanner({ onOpen }: { onOpen: () => void }) {
  const strings = useStrings();
  const [hidden, setHidden] = useState(hiddenNow);

  if (hidden) {
    return null;
  }

  function hide(): void {
    try {
      localStorage.setItem(HIDDEN_UNTIL_KEY, String(Date.now() + SAVE_BANNER_SNOOZE_DAYS * DAY_MS));
    } catch {
      // Without storage it hides until the next launch.
    }
    setHidden(true);
  }

  return (
    <div className={styles.banner}>
      <button type="button" className={styles.text} onClick={onOpen}>
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6l-7-3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        <span>{strings.saveBannerText}</span>
      </button>
      <button type="button" className={styles.close} aria-label={strings.saveBannerHide} onClick={hide}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
