/**
 * Счёт за день привычки «несколько раз в день» в окне снизу (окно счёта «Сверх плана» —
 * CountSheet, окно дня — DaySheet): полоса прогресса к цели, «−» / число / «+» (нажатие —
 * шаг, удержание повторяет его, hooks/useHoldRepeat.ts; число можно ввести с клавиатуры),
 * быстрые «+1 … +100» (`quick`) и внизу «Сбросить» (0) и «Заполнить день» (до цели).
 *
 * Всё применяется сразу (`onSet`): блок лишь показывает счёт из стора, своего черновика у
 * него нет — кроме вводимого числа. Другой день или привычка — другой `key` у блока.
 *
 * «Цель по времени» (`timed`): счёт и цель — секунды, а на экране — минуты: «−» / «+» по
 * минуте, вводятся минуты, быстрые «+5 … +60» минут — всегда.
 */

import { useState, type KeyboardEvent } from "react";

import { useHoldRepeat } from "../hooks/useHoldRepeat";
import { useStrings } from "../preferences";
import { hapticSelection } from "../telegram/webapp";
import { duration } from "./timerFormat";
import styles from "./CountControls.module.css";

/** Быстрые прибавки; у «Цели по времени» — минуты. */
const QUICK_STEPS = [1, 5, 10, 50, 100] as const;
const QUICK_MINUTES = [5, 10, 15, 30, 60] as const;

interface CountControlsProps {
  count: number;
  goal: number;
  /** Больше нельзя: цель, а у «Сверх плана» — OVERTIME_MAX_COUNT. */
  max: number;
  /** Быстрые прибавки (у «Сверх плана»). */
  quick: boolean;
  /** «Цель по времени»: секунды, показанные минутами. */
  timed?: boolean;
  /** Счёт сейчас — из стора: удержание шагает быстрее, чем перерисовывается экран. */
  current: () => number;
  onSet: (value: number) => void;
}

export function CountControls({
  count,
  goal,
  max,
  quick,
  timed = false,
  current,
  onSet,
}: CountControlsProps) {
  const strings = useStrings();
  // Шаг «−» / «+» и единица поля: раз или минута.
  const unit = timed ? 60 : 1;
  const shownCount = Math.floor(count / unit);
  const shownMax = Math.floor(max / unit);
  // Вводимое число; null — поле показывает счёт из стора.
  const [draft, setDraft] = useState<string | null>(null);

  // «−», «+» и быстрые прибавки: шаг по нажатию, удержание повторяет его; у границы шаг
  // доходит до неё и повтор останавливается.
  const hold = useHoldRepeat((delta) => {
    const now = current();
    const next = Math.max(0, Math.min(now + delta, max));
    if (next === now) {
      return false;
    }
    onSet(next);
    hapticSelection();
    return true;
  });

  function set(value: number): void {
    hapticSelection();
    onSet(value);
  }

  /** Ввод с клавиатуры: только цифры, больше предела — предел. */
  function type(text: string): void {
    let digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if (Number(digits) > shownMax) {
      digits = String(shownMax);
    }
    setDraft(digits);
  }

  function commit(): void {
    if (draft !== null) {
      onSet(Math.min(Number(draft || "0") * unit, max));
      setDraft(null);
    }
  }

  const done = count >= goal;
  const progress = Math.min(count / goal, 1);
  return (
    <>
      <div className={styles.progress} aria-hidden="true">
        <span className={styles.track}>
          <span className={styles.fill} style={{ width: `${progress * 100}%` }} />
        </span>
        <span className={styles.progressLabels}>
          <span className={styles.percent}>{Math.round(progress * 100)}%</span>
          <span>
            {timed ? `${duration(count, strings)} / ${duration(goal, strings)}` : `${count} / ${goal}`}
          </span>
        </span>
      </div>

      <div className={styles.counter}>
        <button
          type="button"
          className={styles.step}
          aria-label={timed ? strings.countSheetLessMinute : strings.countSheetLess}
          disabled={count <= 0}
          {...hold(-unit)}
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
            aria-label={timed ? strings.countSheetMinutes : strings.countSheetValue}
            value={draft ?? String(shownCount)}
            // По ширине числа (цифры одной ширины — 1ch): «9 / 6» стоит по центру поля.
            style={{ width: `${Math.max(1, (draft ?? String(shownCount)).length)}ch` }}
            onChange={(event) => type(event.target.value)}
            onFocus={(event) => {
              setDraft(String(shownCount));
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
          <span className={styles.goal}>
            /{" "}{timed ? strings.durationMinutes(Math.floor(goal / 60)) : goal}
          </span>
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
          aria-label={timed ? strings.countSheetMoreMinute : strings.countSheetMore}
          disabled={count >= max}
          {...hold(unit)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {quick || timed ? (
        <div className={styles.quick}>
          {(timed ? QUICK_MINUTES : QUICK_STEPS).map((step) => (
            <button
              key={step}
              type="button"
              className={styles.quickButton}
              aria-label={timed ? strings.countSheetAddMinutes(step) : strings.countSheetAdd(step)}
              disabled={count >= max}
              {...hold(step * unit)}
            >
              +{step}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.reset} disabled={count === 0} onClick={() => set(0)}>
          {strings.countSheetReset}
        </button>
        <button type="button" className={styles.fillDay} disabled={done} onClick={() => set(goal)}>
          {strings.countSheetFill}
        </button>
      </div>
    </>
  );
}
