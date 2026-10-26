/**
 * Степпер iOS: серая «таблетка» с кнопками «−» и «+» (UIStepper). Меняет число на 1 в
 * пределах `min`–`max`; на границе кнопка приглушена. Удержание кнопки повторяет шаг —
 * так до большого числа не нужно нажимать десятки раз. Кнопки при нажатии не
 * подсвечиваются — ни при одиночном, ни при удержании.
 *
 * Шаг при касании, повтор при удержании и гашение клика после отпускания — в
 * hooks/useHoldRepeat.ts (там же — почему клик гасится).
 */

import { useRef } from "react";

import { useHoldRepeat } from "../hooks/useHoldRepeat";
import { hapticSelection } from "../telegram/webapp";
import styles from "./Stepper.module.css";

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

  const hold = useHoldRepeat((delta) => {
    const next = valueRef.current + delta;
    if (next < min || next > max) {
      return false;
    }
    valueRef.current = next;
    onChange(next);
    hapticSelection();
    return true;
  });

  function button(delta: number, label: string, disabled: boolean) {
    return (
      <button
        type="button"
        className={styles.button}
        aria-label={label}
        disabled={disabled}
        {...hold(delta)}
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
