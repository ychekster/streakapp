/**
 * Степпер iOS: серая «таблетка» с кнопками «−» и «+» (UIStepper). Меняет число на 1 в
 * пределах `min`–`max`; на границе кнопка приглушена. Удержание кнопки повторяет шаг —
 * так до большого числа не нужно нажимать десятки раз. Подсвечивается кнопка только при
 * удержании; одиночное нажатие не мигает.
 */

import { useEffect, useRef, useState } from "react";

import { hapticSelection } from "../telegram/webapp";
import styles from "./Stepper.module.css";

/** Через сколько удержания шаг начинает повторяться и как часто (мс). */
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 70;

interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Подписи кнопок для скринридеров. */
  decreaseLabel: string;
  increaseLabel: string;
}

export function Stepper({ value, min, max, onChange, decreaseLabel, increaseLabel }: StepperProps) {
  // Повтор при удержании берёт текущее значение отсюда, а не из замыкания первого шага.
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<number | null>(null);
  // Кнопка, которую держат (шаг повторяется): её и подсвечиваем.
  const [held, setHeld] = useState<number | null>(null);

  function stop(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setHeld(null);
  }

  useEffect(() => stop, []);

  function step(delta: number): boolean {
    const next = valueRef.current + delta;
    if (next < min || next > max) {
      return false;
    }
    valueRef.current = next;
    onChange(next);
    hapticSelection();
    return true;
  }

  function start(delta: number): void {
    stop();
    if (!step(delta)) {
      return;
    }
    const repeat = (): void => {
      timer.current = step(delta) ? window.setTimeout(repeat, REPEAT_INTERVAL_MS) : null;
      setHeld(timer.current === null ? null : delta);
    };
    timer.current = window.setTimeout(repeat, REPEAT_DELAY_MS);
  }

  function button(delta: number, label: string, disabled: boolean) {
    return (
      <button
        type="button"
        className={`${styles.button} ${held === delta && !disabled ? styles.held : ""}`}
        aria-label={label}
        disabled={disabled}
        onPointerDown={(event) => {
          event.preventDefault();
          start(delta);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(event) => event.preventDefault()}
        // Клавиатура и скринридеры нажимают без pointer-событий.
        onClick={(event) => {
          if (event.detail === 0) {
            step(delta);
          }
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d={delta > 0 ? "M12 5v14M5 12h14" : "M5 12h14"}
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    );
  }

  return (
    <span className={styles.stepper}>
      {button(-1, decreaseLabel, value <= min)}
      <span className={styles.divider} aria-hidden="true" />
      {button(1, increaseLabel, value >= max)}
    </span>
  );
}
