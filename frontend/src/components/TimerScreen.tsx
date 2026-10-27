/**
 * Таймер «Цели по времени» на весь экран — как «Таймер» в часах iPhone, всегда тёмный
 * (пока он открыт, App включает тёмную тему всему приложению):
 * посередине большое кольцо цветом привычки (доля цели) и крупные тонкие цифры «09:49». Над цифрами — когда наберётся цель (🔔 22:20; на
 * паузе — «Осталось 12 мин», набрана — «Цель на сегодня выполнена»), под ними — цель
 * («Цель — 45 мин»). Ниже — две круглые кнопки: слева серая ✎ (окно времени за день,
 * CountSheet — поверх таймера, он идёт дальше), справа ▶ / ❚❚ цветом привычки. Внизу карточка: привычка и её текущая серия.
 * Навигации нет — экран поверх всего; свернуть — та же «Назад», что на всех экранах: в
 * Telegram его кнопка в шапке, в веб-приложении — круглая WebChrome (на время экрана —
 * поверх него, `data-timer-screen` на <html>). Пока он открыт, экран телефона
 * не гаснет (Wake Lock, hooks/useTimer.ts), если устройство это умеет.
 *
 * Открывается нажатием на мини-плеер (TimerBar) для его привычки; на паузе остаётся
 * открытым (время дня — из стора). «Назад» Telegram (и свайп) — свернуть (App). Одно окно
 * на всё приложение, как окно счёта (CountSheet).
 */

import { useEffect, useSyncExternalStore } from "react";

import { clockIn } from "../data/dates";
import { dataStore } from "../data/store";
import { flexiblePeriod, myDay } from "../data/derive";
import { useAppData } from "../hooks/useAppData";
import { useSecondTick, useWakeLock } from "../hooks/useTimer";
import { useStrings } from "../preferences";
import { hapticImpact } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import { openCountSheet } from "./CountSheet";
import { ListItem } from "./ListItem";
import { Card } from "./Section";
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

/** Кольцо (координаты 100×100): по середине обводки --timer-screen-ring-stroke (2). */
const RADIUS = 49;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TimerScreen() {
  const strings = useStrings();
  const habitId = useTimerScreenHabit();
  const { habits, timer, today, settings } = useAppData();
  const habit = habitId === null ? undefined : habits.find((item) => item.id === habitId);
  const running = timer !== null && timer.habitId === habitId && timer.date === today;
  const now = useSecondTick(running);
  useWakeLock(habit !== undefined);

  // Круглая «Назад» веб-приложения — поверх экрана, пока он открыт.
  const open = habitId !== null;
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    document.documentElement.dataset.timerScreen = "";
    return () => {
      delete document.documentElement.dataset.timerScreen;
    };
  }, [open]);

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
  const daySeconds = myDay(habit, today, today).count;
  const seconds = running ? dataStore.timerSeconds(now) : daySeconds;
  const goal = habit.times_per_day;
  const reached = seconds >= goal;
  const fraction = Math.min(seconds / goal, 1);
  // Дальше цели без «Сверх плана» таймер не идёт.
  const canStart = !reached || habit.overtime === true;
  // Серия — в днях, у «Гибкого графика» — в его периодах («3 нед.»).
  const period = flexiblePeriod(habit);
  const streak =
    period === null || period === "year"
      ? strings.streakDaysValue(habit.current_streak)
      : strings.streakInPeriods[period](habit.current_streak);
  const left = goal - seconds;
  return (
    <div
      className={styles.screen}
      style={habitColorStyle(habit.color)}
      role="dialog"
      aria-modal="true"
      aria-label={habit.name}
    >
      <div className={styles.dialArea}>
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
            <span className={`${styles.above} ${reached ? styles.aboveDone : ""}`}>
              {reached ? (
                strings.timerGoalDone
              ) : running ? (
                <>
                  <BellIcon />
                  {clockIn(settings?.timezone ?? null, new Date(now + left * 1000))}
                </>
              ) : (
                strings.timerLeft(duration(left, strings))
              )}
            </span>
            <span className={styles.clock} role="timer">
              {clock(seconds)}
            </span>
            <span className={styles.goal}>{strings.timerGoal(duration(goal, strings))}</span>
          </div>
        </div>
      </div>

      <div className={styles.buttons}>
        <button
          type="button"
          className={`${styles.round} ${styles.edit}`}
          aria-label={strings.timerEditTime}
          onClick={() => openCountSheet(habit.id)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8.5 18.5l-4 1z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.round} ${styles.main}`}
          disabled={!running && !canStart}
          aria-label={
            running ? strings.timerPause : seconds > 0 ? strings.timerResume : strings.timerStart
          }
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
              <rect x="6" y="4.5" width="4.2" height="15" rx="1.2" fill="currentColor" />
              <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7 4.9v14.2a1.1 1.1 0 0 0 1.68.93l11.1-7.1a1.1 1.1 0 0 0 0-1.86L8.68 3.97A1.1 1.1 0 0 0 7 4.9z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
      </div>

      <div className={styles.info}>
        <Card>
          <ListItem label={strings.timerHabitRow}>
            <span className={styles.value}>{habit.name}</span>
          </ListItem>
          <ListItem label={strings.statCurrentStreak}>
            <span className={styles.value}>{streak}</span>
          </ListItem>
        </Card>
      </div>
    </div>
  );
}

function BellIcon() {
  return (
    <svg className={styles.bell} viewBox="0 0 26 30" aria-hidden="true">
      <path
        d="M13 0a1.6 1.6 0 0 1 1.6 1.6v.9A8.6 8.6 0 0 1 21.6 11v5.6c0 1.2.5 2.3 1.3 3.2l1.6 1.7c.9 1 .2 2.5-1.1 2.5H2.6c-1.3 0-2-1.5-1.1-2.5l1.6-1.7c.8-.9 1.3-2 1.3-3.2V11a8.6 8.6 0 0 1 7-8.5v-.9A1.6 1.6 0 0 1 13 0zM9.2 25.6h7.6a3.8 3.8 0 0 1-7.6 0z"
        fill="currentColor"
      />
    </svg>
  );
}
