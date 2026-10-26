/**
 * Окно счёта привычки «Сверх плана»: открывается удержанием кнопки отметки
 * (CheckButton → openCountSheet) и всплывает снизу поверх экрана.
 *
 * Шапка — день отметки, название привычки и «×»; под ней полоса прогресса к цели. Дальше
 * «−» / число / «+» (нажатие — шаг, удержание повторяет его, hooks/useHoldRepeat.ts;
 * число можно ввести с клавиатуры), быстрые «+1 … +100» и внизу «Сбросить» (0) и
 * «Заполнить день» (до цели). Всё применяется сразу (dataStore.setCount): окно лишь
 * показывает счёт из стора, своего черновика у него нет — кроме вводимого числа.
 *
 * Закрывается «×», нажатием на затемнение и кнопкой «Назад» (App, useBackButton).
 */

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import { OVERTIME_MAX_COUNT } from "../constants";
import { dataStore } from "../data/store";
import { useAppData } from "../hooks/useAppData";
import { useHoldRepeat } from "../hooks/useHoldRepeat";
import { useStrings } from "../preferences";
import { hapticImpact, hapticSelection } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import styles from "./CountSheet.module.css";

/** Быстрые прибавки. */
const QUICK_STEPS = [1, 5, 10, 50, 100] as const;

// --- Какая привычка открыта (одно окно на всё приложение) ---

let openId: number | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openCountSheet(habitId: number): void {
  openId = habitId;
  hapticImpact("medium");
  emit();
}

export function closeCountSheet(): void {
  if (openId !== null) {
    openId = null;
    emit();
  }
}

/** Id привычки открытого окна; null — окно закрыто. */
export function useCountSheetHabit(): number | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => openId,
  );
}

export function CountSheet() {
  const strings = useStrings();
  const { habits, settings } = useAppData();
  const habitId = useCountSheetHabit();
  const habit = habitId === null ? undefined : habits.find((item) => item.id === habitId);
  // Привычку удалили, заморозили, выключили ей «Сверх плана» — окну нечего показывать.
  const usable =
    habit !== undefined && habit.overtime === true && habit.scheduled_today && habit.frozen_since === null;
  // Вводимое число; null — поле показывает счёт из стора.
  const [draft, setDraft] = useState<string | null>(null);
  const backdropPressed = useRef(false);

  useEffect(() => {
    if (habitId !== null && !usable) {
      closeCountSheet();
    }
  }, [habitId, usable]);
  useEffect(() => setDraft(null), [habitId]);

  const count = habit?.today_count ?? 0;
  const goal = habit?.times_per_day ?? 1;

  const hold = useHoldRepeat((delta) => {
    const current = dataStore.getState().habits.find((item) => item.id === habitId)?.today_count ?? 0;
    const next = current + delta;
    if (habitId === null || next < 0 || next > OVERTIME_MAX_COUNT) {
      return false;
    }
    dataStore.setCount(habitId, next);
    hapticSelection();
    return true;
  });

  if (!habit || !usable) {
    return null;
  }
  const id = habit.id;

  function set(value: number): void {
    hapticSelection();
    dataStore.setCount(id, value);
  }

  /** Ввод с клавиатуры: только цифры, больше предела — предел. */
  function type(text: string): void {
    let digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if (Number(digits) > OVERTIME_MAX_COUNT) {
      digits = String(OVERTIME_MAX_COUNT);
    }
    setDraft(digits);
  }

  function commit(): void {
    if (draft !== null) {
      dataStore.setCount(id, Number(draft || "0"));
      setDraft(null);
    }
  }

  const done = count >= goal;
  const progress = Math.min(count / goal, 1);
  return (
    <div className={styles.layer} style={habitColorStyle(habit.color)}>
      <div
        className={styles.backdrop}
        aria-hidden="true"
        // Только касание, начатое на затемнении: палец, которым удерживали кнопку
        // отметки, отпускают уже над ним, и iOS присылает клик туда.
        onPointerDown={() => {
          backdropPressed.current = true;
        }}
        onClick={() => {
          if (backdropPressed.current) {
            closeCountSheet();
          }
          backdropPressed.current = false;
        }}
      />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={habit.name}>
        <div className={styles.header}>
          <span className={`${styles.chip} ${styles.dayChip}`}>
            <CalendarIcon />
            {settings?.mark_yesterday ? strings.countSheetYesterday : strings.countSheetToday}
          </span>
          <span className={`${styles.chip} ${styles.nameChip}`}>{habit.name}</span>
          <button
            type="button"
            className={styles.close}
            aria-label={strings.countSheetClose}
            onClick={closeCountSheet}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={styles.progress} aria-hidden="true">
          <span className={styles.track}>
            <span className={styles.fill} style={{ transform: `scaleX(${progress})` }} />
          </span>
          <span className={styles.progressLabels}>
            <span className={styles.percent}>{Math.round(progress * 100)}%</span>
            <span>
              {count} / {goal}
            </span>
          </span>
        </div>

        <div className={styles.counter}>
          <button
            type="button"
            className={styles.step}
            aria-label={strings.countSheetLess}
            disabled={count <= 0}
            {...hold(-1)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
          <label className={styles.value}>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label={strings.countSheetValue}
              value={draft ?? String(count)}
              size={Math.max(1, (draft ?? String(count)).length)}
              onChange={(event) => type(event.target.value)}
              onFocus={(event) => {
                setDraft(String(count));
                event.currentTarget.select();
              }}
              onBlur={commit}
              enterKeyHint="done"
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
            <span className={styles.goal}>/ {goal}</span>
            <span className={`${styles.doneMark} ${done ? styles.doneMarkOn : ""}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.75l4.5 4.5L19 7.75"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </label>
          <button
            type="button"
            className={styles.step}
            aria-label={strings.countSheetMore}
            disabled={count >= OVERTIME_MAX_COUNT}
            {...hold(1)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={styles.quick}>
          {QUICK_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              className={styles.quickButton}
              aria-label={strings.countSheetAdd(step)}
              disabled={count >= OVERTIME_MAX_COUNT}
              onClick={() => set(Math.min(count + step, OVERTIME_MAX_COUNT))}
            >
              +{step}
            </button>
          ))}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.reset}
            disabled={count === 0}
            onClick={() => set(0)}
          >
            {strings.countSheetReset}
          </button>
          <button type="button" className={styles.fillDay} disabled={done} onClick={() => set(goal)}>
            {strings.countSheetFill}
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg className={styles.chipIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14.5" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
