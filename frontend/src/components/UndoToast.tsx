/**
 * Плашка «Отменить» над навигацией (как «You left the channel · Undo» в Telegram): после
 * серии быстрых нажатий на кнопку отметки «Сверх плана» (hooks/useToggle.ts) — «Вода: +12»
 * и «Отменить», которое возвращает счёт, бывший до серии. Слева кружок с обратным
 * отсчётом: через UNDO_MS плашка уходит сама, а раньше её можно смахнуть влево
 * (useSwipeAway) — счёт остаётся. Каждое новое нажатие серии обновляет число и начинает
 * отсчёт заново.
 */

import { useEffect, useState, useSyncExternalStore } from "react";

import { useSwipeAway } from "../hooks/useSwipeAway";
import { useStrings } from "../preferences";
import styles from "./UndoToast.module.css";

/** Сколько плашка видна после последнего нажатия (мс). */
export const UNDO_MS = 5000;

export interface UndoOffer {
  /** Название привычки. */
  name: string;
  /** Сколько нажатий отменит «Отменить». */
  taps: number;
  /** Когда плашка уйдёт сама (Date.now()). */
  until: number;
  undo: () => void;
}

let offer: UndoOffer | null = null;
let hideTimer = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Показать (или обновить) плашку; через UNDO_MS она уйдёт сама. */
export function showUndo(next: Omit<UndoOffer, "until">): void {
  window.clearTimeout(hideTimer);
  offer = { ...next, until: Date.now() + UNDO_MS };
  hideTimer = window.setTimeout(hideUndo, UNDO_MS);
  emit();
}

/** Видна ли плашка (через UNDO_MS после последнего обновления — уже нет). */
export function undoVisible(): boolean {
  return offer !== null;
}

export function hideUndo(): void {
  window.clearTimeout(hideTimer);
  if (offer !== null) {
    offer = null;
    emit();
  }
}

function useOffer(): UndoOffer | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => offer,
  );
}

/** Сколько целых секунд осталось (для числа в кружке). */
function useSecondsLeft(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) {
      return undefined;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [until]);
  return until === null ? 0 : Math.max(1, Math.ceil((until - now) / 1000));
}

interface UndoToastProps {
  /** Навигация видна — плашка над ней; иначе — у нижнего края. */
  aboveTabBar: boolean;
}

export function UndoToast({ aboveTabBar }: UndoToastProps) {
  const strings = useStrings();
  const current = useOffer();
  const seconds = useSecondsLeft(current?.until ?? null);
  const swipe = useSwipeAway(hideUndo);
  if (!current) {
    return null;
  }
  return (
    <div
      className={`${styles.toast} ${aboveTabBar ? styles.aboveTabBar : ""}`}
      role="status"
      style={swipe.style}
      {...swipe.handlers}
    >
      {/* key — отсчёт заново с каждым обновлением. */}
      <span className={styles.timer} key={current.until} aria-hidden="true">
        <svg viewBox="0 0 25 25">
          <circle className={styles.ring} cx="12.5" cy="12.5" r="11.5" />
        </svg>
        <span className={styles.seconds}>{seconds}</span>
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{current.name}</span>
        <span className={styles.taps}>{strings.undoTapsSuffix(current.taps)}</span>
      </span>
      <button
        type="button"
        className={styles.undo}
        onClick={() => {
          current.undo();
          hideUndo();
        }}
      >
        {strings.undo}
      </button>
    </div>
  );
}
