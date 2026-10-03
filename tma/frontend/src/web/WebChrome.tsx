/**
 * Back button (top left, in the control row Telegram has in fullscreen) and the bottom
 * action button of the web app — drawn from the webChrome store (see chrome.ts). Same
 * glass and pill shapes as the rest of the app. Rendered only in web mode. Also the
 * page's scroll indicator (ScrollIndicator).
 */

import { useEffect, useSyncExternalStore } from "react";

import { devicePlatform } from "../platform";
import { useStrings } from "../preferences";
import { webChrome } from "./chrome";
import { ScrollIndicator } from "./ScrollIndicator";
import styles from "./WebChrome.module.css";

/*
 * Browser history for nested screens — Android's system back and a desktop browser's
 * «Back» close the nested screen instead of leaving the app. Never on iOS: there the
 * edge swipe walks history both ways — after a swipe back, the swipe from the right edge
 * brought the closed screen's picture forward again and then dropped it (a «ping-pong»
 * between the list and itself). On iOS nested screens close with «Назад» only.
 *
 * One entry while there is somewhere to go back to. Module state, not refs: the entry
 * outlives a WebChrome remount (App ↔ admin panel).
 */
const USE_HISTORY = devicePlatform() !== "ios";
let historyEntry = false;
let ignoredPops = 0;

function onPopState(): void {
  if (ignoredPops > 0) {
    ignoredPops -= 1;
    return;
  }
  if (historyEntry) {
    historyEntry = false;
    webChrome.pressBack();
  } else if (window.history.state?.streakBack) {
    // Forward into an entry of a screen that is already closed: step straight back out.
    ignoredPops += 1;
    window.history.back();
  }
}

function syncHistory(backVisible: boolean): void {
  if (backVisible && !historyEntry) {
    // A nested screen opened — or closed by the system back onto another nested one,
    // which needs an entry of its own.
    window.history.pushState({ streakBack: true }, "");
    historyEntry = true;
  } else if (!backVisible && historyEntry) {
    // Closed by the app's own «Назад»: take the unused entry off.
    historyEntry = false;
    if (window.history.state?.streakBack) {
      ignoredPops += 1;
      window.history.back();
    }
  }
}

export function WebChrome() {
  const strings = useStrings();
  const { backVisible, backKey, main } = useSyncExternalStore(
    webChrome.subscribe,
    webChrome.getSnapshot,
  );

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

  // Browser history (see USE_HISTORY): kept in step with the back target — re-checked
  // with every new screen level (backKey).
  useEffect(() => {
    if (!USE_HISTORY) {
      return undefined;
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (USE_HISTORY) {
      syncHistory(backVisible);
    }
  }, [backVisible, backKey]);

  return (
    <>
      {/* Invisible fixed strip on the top edge: keeps iOS from drawing its scroll edge
          haze over the top of the installed app (see .topEdge). */}
      <div className={styles.topEdge} aria-hidden="true" />
      <ScrollIndicator />
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
