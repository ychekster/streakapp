/**
 * Мини-плеер идущего таймера «Цели по времени»: стеклянная капсула над навигацией (как
 * плашка «Отменить»): кружок прогресса цветом привычки, название, «12:34 / 45:00» и ❚❚
 * справа. Нажатие на капсулу открывает таймер на весь экран (TimerScreen), ❚❚ —
 * останавливает: время уходит в день, капсула пропадает.
 *
 * Смонтирован всегда (App): пока таймер идёт, раз в секунду спрашивает стор, не набрана ли
 * цель (dataStore.tickTimer) — тогда вибрация, день выполнен сразу. Пока капсула видна,
 * на <html> стоит --timer-bar-space: экраны и плашка «Отменить» поднимаются над ней.
 */

import { useEffect } from "react";

import { dataStore } from "../data/store";
import { useAppData } from "../hooks/useAppData";
import { useSecondTick } from "../hooks/useTimer";
import { useStrings } from "../preferences";
import { hapticImpact, hapticNotification } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import { clock } from "./timerFormat";
import { openTimerScreen, useTimerScreenHabit } from "./TimerScreen";
import styles from "./TimerBar.module.css";

/** Кружок прогресса (координаты 24×24). */
const RADIUS = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface TimerBarProps {
  /** Навигация видна — капсула над ней; иначе — у нижнего края. */
  aboveTabBar: boolean;
}

export function TimerBar({ aboveTabBar }: TimerBarProps) {
  const strings = useStrings();
  const { timer, habits } = useAppData();
  const now = useSecondTick(timer !== null);
  const screenOpen = useTimerScreenHabit() !== null;
  const habit = timer ? habits.find((item) => item.id === timer.habitId) : undefined;
  const shown = habit !== undefined && !screenOpen;

  // Цель набрана — время уходит в день сразу (и при возврате в приложение).
  useEffect(() => {
    if (timer && dataStore.tickTimer(now)) {
      hapticNotification("success");
    }
  }, [timer, now]);

  useEffect(() => {
    const root = document.documentElement;
    if (!shown) {
      return undefined;
    }
    root.style.setProperty("--timer-bar-space", "var(--timer-bar-height) + var(--timer-bar-gap)");
    return () => {
      root.style.removeProperty("--timer-bar-space");
    };
  }, [shown]);

  if (!timer || !habit || !shown) {
    return null;
  }
  const seconds = dataStore.timerSeconds(now);
  const goal = habit.times_per_day;
  const fraction = Math.min(seconds / goal, 1);
  return (
    <div
      className={`${styles.bar} ${aboveTabBar ? styles.aboveTabBar : ""}`}
      style={habitColorStyle(habit.color)}
      role="timer"
    >
      <button
        type="button"
        className={styles.open}
        aria-label={strings.timerOpen(habit.name)}
        onClick={() => openTimerScreen(habit.id)}
      >
        <svg className={styles.ring} viewBox="0 0 24 24" aria-hidden="true">
          <circle className={styles.track} cx="12" cy="12" r={RADIUS} />
          <circle
            className={styles.arc}
            cx="12"
            cy="12"
            r={RADIUS}
            transform="rotate(-90 12 12)"
            strokeDasharray={`${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          />
        </svg>
        <span className={styles.name}>{habit.name}</span>
        <span className={styles.time}>
          {clock(seconds)}
          <span className={styles.goal}> / {clock(goal)}</span>
        </span>
      </button>
      <button
        type="button"
        className={styles.pause}
        aria-label={strings.timerPause}
        onClick={() => {
          hapticImpact("light");
          dataStore.stopTimer();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1.3" fill="currentColor" />
          <rect x="14" y="5" width="4" height="14" rx="1.3" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
