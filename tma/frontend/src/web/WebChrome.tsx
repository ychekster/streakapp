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
          <svg viewBox="0 0 12 20" width="12" height="20" aria-hidden="true">
            <path
              d="M10 2 2 10l8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
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
