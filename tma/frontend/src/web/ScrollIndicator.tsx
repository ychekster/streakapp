/**
 * The page's scroll indicator, drawn by the app — the native one is hidden (global.css)
 * and can't be placed. Like the iOS indicator: a thin bar at the right edge that shows
 * up while the page scrolls and fades out shortly after it stops, and shrinks while the
 * page is pulled past its end.
 *
 * Its track runs from just under the collapsed header bar (--header-bar-bottom, set by
 * CollapsingHeader), so it never goes under the blurred header, down to just above the
 * tab bar — on every screen, the same length (--scroll-indicator-bottom).
 */

import { useEffect, useRef } from "react";

import { SCROLL_RESTORED_EVENT } from "../components/CollapsingHeader";
import styles from "./WebChrome.module.css";

const HIDE_AFTER_MS = 600;
const MIN_LENGTH_PX = 36;
// Shortest it gets while the page is pulled past its end.
const MIN_SQUEEZED_PX = 8;

export function ScrollIndicator() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) {
      return undefined;
    }
    let hideTimer: number | undefined;
    let frame = 0;
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
      const length = Math.max(
        MIN_SQUEEZED_PX,
        Math.max(MIN_LENGTH_PX, (trackLength * view) / page) - overscroll,
      );
      const progress = Math.min(1, Math.max(0, y / maxScroll));
      bar.style.height = `${length}px`;
      bar.style.transform = `translateY(${(trackLength - length) * progress}px)`;
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
