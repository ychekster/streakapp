/**
 * Степпер iOS: серая «таблетка» с кнопками «−» и «+» (UIStepper). Меняет число на 1 в
 * пределах `min`–`max`; на границе кнопка приглушена. Удержание кнопки повторяет шаг —
 * так до большого числа не нужно нажимать десятки раз. Кнопки при нажатии не
 * подсвечиваются — ни при одиночном, ни при удержании.
 *
 * Шаг делается уже при касании, а клик браузер присылает после отпускания — туда, что
 * к тому времени под пальцем. Если от шага страница сдвинулась (в форме привычки с целью
 * больше 1 пропадает «Автоотметка»), клик открыл бы чужой ряд, например «Повтор». Поэтому
 * клик после нажатия степпера гасится (swallowClick).
 */

import { useEffect, useRef } from "react";

import { hapticSelection } from "../telegram/webapp";
import styles from "./Stepper.module.css";

/** Через сколько удержания шаг начинает повторяться и как часто (мс). */
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 70;
/** Сколько после отпускания ждать клика, который нужно погасить (мс). */
const CLICK_AFTER_RELEASE_MS = 400;

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
  // Снять перехват клика (swallowClick); null — перехвата нет.
  const releaseClick = useRef<(() => void) | null>(null);

  function stop(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  /** Погасить клик, который придёт после отпускания этого нажатия: до самого отпускания
   *  и ещё CLICK_AFTER_RELEASE_MS после него (см. release). */
  function swallowClick(): void {
    releaseClick.current?.();
    const swallow = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      remove();
    };
    let timeout: number | null = null;
    const released = (): void => {
      // Отпустили: клик придёт сразу следом, если придёт вообще.
      if (timeout === null) {
        timeout = window.setTimeout(remove, CLICK_AFTER_RELEASE_MS);
      }
    };
    const remove = (): void => {
      window.removeEventListener("click", swallow, true);
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
      // Следующее нажатие могло уже поставить свой перехват — его не трогать.
      if (releaseClick.current === released) {
        releaseClick.current = null;
      }
    };
    window.addEventListener("click", swallow, true);
    releaseClick.current = released;
  }

  function release(): void {
    stop();
    releaseClick.current?.();
  }

  useEffect(
    () => () => {
      stop();
      releaseClick.current?.();
    },
    [],
  );

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
    };
    timer.current = window.setTimeout(repeat, REPEAT_DELAY_MS);
  }

  function button(delta: number, label: string, disabled: boolean) {
    return (
      <button
        type="button"
        className={styles.button}
        aria-label={label}
        disabled={disabled}
        onPointerDown={(event) => {
          event.preventDefault();
          swallowClick();
          start(delta);
        }}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        // Касание: без нажатия мышью и клика после него (iOS открывает <select> по ним).
        onTouchEnd={(event) => event.preventDefault()}
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
