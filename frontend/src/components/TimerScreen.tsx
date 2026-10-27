/**
 * Таймер «Цели по времени» на весь экран: тёмный фон в обеих темах, посередине — тонкое
 * кольцо цветом привычки (доля цели) и крупные цифры «12:34», над ними — название, под
 * ними — цель («Цель — 45 мин» или «Цель на сегодня выполнена»). Внизу — большая круглая
 * кнопка ▶ / ❚❚ и «Свернуть». Пока экран открыт, экран телефона не гаснет (Wake Lock,
 * hooks/useTimer.ts), если устройство это умеет.
 *
 * Открывается нажатием на мини-плеер (TimerBar) для его привычки; на паузе остаётся
 * открытым (время дня — из стора), ▶ запускает снова. «Назад» Telegram (и свайп) —
 * свернуть (App). Одно окно на всё приложение, как окно счёта (CountSheet).
 */

import { useEffect, useSyncExternalStore } from "react";

import { dataStore } from "../data/store";
import { myDay } from "../data/derive";
import { useAppData } from "../hooks/useAppData";
import { useSecondTick, useWakeLock } from "../hooks/useTimer";
import { useStrings } from "../preferences";
import { hapticImpact } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import { clock, duration } from "./timerFormat";
import styles from "./TimerScreen.module.css";

// --- Чей таймер открыт ---

let openId: number | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openTimerScreen(habitId: number): void {
  openId = habitId;
  emit();
}

export function closeTimerScreen(): void {
  if (openId !== null) {
    openId = null;
    emit();
  }
}

/** Id привычки открытого таймера; null — закрыт. */
export function useTimerScreenHabit(): number | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => openId,
  );
}

/** Кольцо (координаты 100×100). */
const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TimerScreen() {
  const strings = useStrings();
  const habitId = useTimerScreenHabit();
  const { habits, timer, today, settings } = useAppData();
  const habit = habitId === null ? undefined : habits.find((item) => item.id === habitId);
  const running = timer !== null && timer.habitId === habitId && timer.date === today;
  const now = useSecondTick(running);
  useWakeLock(habit !== undefined);

  // Привычку удалили или сделали не по времени — закрыть.
  const usable = habit !== undefined && habit.goal_unit === "seconds";
  useEffect(() => {
    if (habitId !== null && !usable) {
      closeTimerScreen();
    }
  }, [habitId, usable]);

  if (!habit || !usable || !today) {
    return null;
  }
  const seconds = running ? dataStore.timerSeconds(now) : myDay(habit, today, today).count;
  const goal = habit.times_per_day;
  const reached = seconds >= goal;
  const fraction = Math.min(seconds / goal, 1);
  // Дальше цели без «Сверх плана» таймер не идёт.
  const canStart = !reached || habit.overtime === true;
  return (
    <div
      className={styles.screen}
      style={habitColorStyle(habit.color)}
      role="dialog"
      aria-modal="true"
      aria-label={habit.name}
    >
      <div className={styles.top}>
        <span className={styles.day}>
          {settings?.mark_yesterday ? strings.timerYesterday : strings.timerToday}
        </span>
        <h2 className={styles.name}>{habit.name}</h2>
      </div>

      <div className={styles.dial}>
        <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
          <circle className={styles.track} cx="50" cy="50" r={RADIUS} />
          {fraction > 0.001 ? (
            <circle
              className={styles.arc}
              cx="50"
              cy="50"
              r={RADIUS}
              transform="rotate(-90 50 50)"
              strokeDasharray={`${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            />
          ) : null}
        </svg>
        <div className={styles.readout}>
          <span className={styles.clock} role="timer">
            {clock(seconds)}
          </span>
          <span className={`${styles.goal} ${reached ? styles.goalDone : ""}`}>
            {reached ? strings.timerGoalDone : strings.timerGoal(duration(goal, strings))}
          </span>
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={`${styles.main} ${running ? styles.mainRunning : ""}`}
          disabled={!running && !canStart}
          aria-label={running ? strings.timerPause : seconds > 0 ? strings.timerResume : strings.timerStart}
          onClick={() => {
            hapticImpact("medium");
            if (running) {
              dataStore.stopTimer();
            } else {
              dataStore.startTimer(habit.id);
            }
          }}
        >
          {running ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="4.5" width="4.2" height="15" rx="1.4" fill="currentColor" />
              <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M8 4.9v14.2a1.1 1.1 0 0 0 1.68.93l11.1-7.1a1.1 1.1 0 0 0 0-1.86L9.68 3.97A1.1 1.1 0 0 0 8 4.9z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
        <button type="button" className={styles.collapse} onClick={closeTimerScreen}>
          {strings.timerCollapse}
        </button>
      </div>
    </div>
  );
}
