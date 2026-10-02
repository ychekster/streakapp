/**
 * Back button (top left, in the control row Telegram has in fullscreen) and the bottom
 * action button of the web app — drawn from the webChrome store (see chrome.ts). Same
 * glass and pill shapes as the rest of the app. Rendered only in web mode.
 */

import { useEffect, useSyncExternalStore } from "react";

import { useStrings } from "../preferences";
import { webChrome } from "./chrome";
import styles from "./WebChrome.module.css";

export function WebChrome() {
  const strings = useStrings();
  const { backVisible, main } = useSyncExternalStore(webChrome.subscribe, webChrome.getSnapshot);

  // Screens leave room for the bottom button while it is shown (variables.css).
  const mainShown = main !== null;
  useEffect(() => {
    if (!mainShown) {
      return undefined;
    }
    document.documentElement.dataset.mainButton = "";
    return () => {
      delete document.documentElement.dataset.mainButton;
    };
  }, [mainShown]);

  // Android's system back gesture and the browser's history: «Назад» closes the nested
  // screen instead of leaving the app. One history entry while a back target exists.
  useEffect(() => {
    if (!backVisible) {
      return undefined;
    }
    window.history.pushState({ streakBack: true }, "");
    const onPop = (): void => webChrome.pressBack();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.streakBack) {
        window.history.back();
      }
    };
  }, [backVisible]);

  return (
    <>
      {backVisible ? (
        <button
          type="button"
          className={styles.back}
          aria-label={strings.webBack}
          onClick={() => webChrome.pressBack()}
        >
          {/* Drawn over the whole circle: the chevron of the iOS 26 back button, its tip
              5.4pt left of the centre (measured from the reference screenshot). */}
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <path
              d="M25.2 13.9 16.6 22l8.6 8.1"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
      {main ? (
        <div className={styles.mainBar}>
          <button
            type="button"
            className={styles.main}
            style={{ background: main.color, color: main.textColor }}
            disabled={!main.active || main.progress}
            onClick={() => webChrome.pressMain()}
          >
            {main.progress ? <span className={styles.spinner} aria-hidden="true" /> : main.text}
          </button>
        </div>
      ) : null}
    </>
  );
}
