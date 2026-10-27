/**
 * The running timer of a time goal («Цель по времени») for the screens: which habit, and
 * how many seconds its day has now — redrawn every second while it runs.
 *
 * The timer counts from the moment it started (data/store.ts), so the second is read from
 * the clock, not added up: a tab that slept still shows the right time.
 */

import { useEffect, useState } from "react";

import { dataStore } from "../data/store";
import type { TimerView } from "../data/derive";
import { useAppData } from "./useAppData";

/** Redraw once a second while `on`; the current time (ms). */
export function useSecondTick(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) {
      return undefined;
    }
    setNow(Date.now());
    // Aligned to the timer's seconds is not needed: each redraw reads the clock.
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  return now;
}

/** The running timer and its day's seconds now; null — none. */
export function useRunningTimer(): { timer: TimerView; seconds: number } | null {
  const { timer } = useAppData();
  const now = useSecondTick(timer !== null);
  return timer ? { timer, seconds: dataStore.timerSeconds(now) } : null;
}

/**
 * Keep the screen on while `on` (the full-screen timer): the Screen Wake Lock API. Taken
 * again when the app comes back (the system lets it go when the page is hidden). Where it
 * is not supported or refused — nothing happens: the timer runs anyway.
 */
export function useWakeLock(on: boolean): void {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) {
      return undefined;
    }
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const take = (): void => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) {
        return;
      }
      navigator.wakeLock.request("screen").then(
        (sentinel) => {
          if (active) {
            lock = sentinel;
          } else {
            void sentinel.release();
          }
        },
        () => undefined,
      );
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => undefined);
    };
  }, [on]);
}
