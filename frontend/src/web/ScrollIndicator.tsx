/**
 * The page's scroll indicator, drawn by the app — the native one is hidden (global.css)
 * and can't be placed. Like the iOS indicator: a thin bar at the right edge that shows
 * up while the page scrolls and fades out shortly after it stops, and shrinks while the
 * page is pulled past its end.
 *
 * Its track runs from just under the collapsed header bar (--header-bar-bottom, set by
 * CollapsingHeader), so it never goes under the blurred header, down to just above the
 * tab bar — on every screen, the same length (--scroll-indicator-bottom).
 *
 * Drawn in the web app (WebChrome) and in the Telegram Mini App alike (App).
 *
 * Where the browser can drive an animation by the page scroll (CSS scroll-driven
 * animations: Chrome / Android WebView, Safari 26+), the bar's position follows the scroll
 * in the browser's own scrolling thread — in step with a fast flick. The script then only
 * sets the bar's length and travel and shows / hides it; elsewhere it also places the bar
 * on every frame, a frame behind the scroll at best.
 */

import { useEffect, useRef } from "react";

import { SCROLL_RESTORED_EVENT } from "../components/CollapsingHeader";
import styles from "./WebChrome.module.css";

const HIDE_AFTER_MS = 600;
const MIN_LENGTH_PX = 36;
// Shortest it gets while the page is pulled past its end.
const MIN_SQUEEZED_PX = 8;

const SCROLL_DRIVEN =
  typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: scroll()") === true;

export function ScrollIndicator() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) {
      return undefined;
    }
    let hideTimer: number | undefined;
    let frame = 0;
    // Written only when they change: most scroll frames change nothing in scroll-driven mode.
    const written = new Map<string, string>();
    const write = (property: string, value: string): void => {
      if (written.get(property) !== value) {
        written.set(property, value);
        bar.style.setProperty(property, value);
      }
    };
    if (SCROLL_DRIVEN) {
      bar.classList.add(styles.indicatorDriven);
    }
    // A scroll the app set itself (a screen reopened where it was left) shows nothing.
    let restoredY: number | null = null;

    const draw = (): void => {
      frame = 0;
      const track = bar.parentElement;
      if (!track) {
        return;
      }
      const trackLength = track.clientHeight;
      const page = document.documentElement.scrollHeight;
      const view = window.innerHeight;
      const maxScroll = page - view;
      if (maxScroll <= 1 || trackLength <= 0) {
        bar.classList.remove(styles.indicatorShown);
        return;
      }
      const y = window.scrollY;
      const overscroll = y < 0 ? -y : y > maxScroll ? y - maxScroll : 0;
      const fullLength = Math.max(MIN_LENGTH_PX, (trackLength * view) / page);
      const length = Math.max(MIN_SQUEEZED_PX, fullLength - overscroll);
      write("height", `${length}px`);
      if (SCROLL_DRIVEN) {
        // The browser moves the bar over this distance as the page scrolls (CSS); pulled
        // past the bottom, the shrinking bar stays at the bottom end.
        write("--indicator-travel", `${trackLength - fullLength}px`);
        write("margin-top", y > maxScroll ? `${fullLength - length}px` : "0px");
      } else {
        const progress = Math.min(1, Math.max(0, y / maxScroll));
        write("transform", `translateY(${(trackLength - length) * progress}px)`);
      }
      bar.classList.add(styles.indicatorShown);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => bar.classList.remove(styles.indicatorShown), HIDE_AFTER_MS);
    };

    const onScroll = (): void => {
      if (restoredY !== null && window.scrollY === restoredY) {
        restoredY = null;
        return;
      }
      restoredY = null;
      if (!frame) {
        frame = requestAnimationFrame(draw);
      }
    };
    const onRestored = (): void => {
      restoredY = window.scrollY;
      bar.classList.remove(styles.indicatorShown);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener(SCROLL_RESTORED_EVENT, onRestored);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener(SCROLL_RESTORED_EVENT, onRestored);
      window.clearTimeout(hideTimer);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={styles.indicatorTrack} aria-hidden="true">
      <div ref={barRef} className={styles.indicator} />
    </div>
  );
}
