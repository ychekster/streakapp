/**
 * Окно, всплывающее снизу поверх экрана: окно счёта «Сверх плана» (CountSheet) и окно дня
 * в календаре (DaySheet). Ширина и отступ снизу постоянные — окно растёт только вверх.
 *
 * Закрывается «×» в шапке (SheetHeader) и нажатием на затемнение — уезжает вниз той же
 * анимацией, что появилось. Это слой поверх экрана, а не переход: кнопки «Назад» у него
 * нет. Что показывать, пока окно уезжает, хранит useSheetContent.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent,
} from "react";

import { useStrings } from "../preferences";
import styles from "./BottomSheet.module.css";

/**
 * Что показывает окно: открытое значение (`open`; null — окно закрыто), а после закрытия
 * — прежнее, пока окно уезжает вниз (`closing`). `gone` — окно уехало.
 */
export function useSheetContent<T>(open: T | null): {
  shown: T | null;
  closing: boolean;
  gone: () => void;
} {
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open !== null) {
      setShown(open);
    } else if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // Без анимации конца анимации не будет — убрать сразу.
      setShown(null);
    }
  }, [open]);
  return { shown, closing: open === null, gone: () => setShown(null) };
}

/** Куда листается окно: к следующему (новое въезжает справа) или к предыдущему. */
export type SheetTurn = "next" | "previous";

/** Карточка, которая уезжает вбок, пока на её место въезжает новая (`turn`). */
export interface LeavingCard {
  key: string;
  turn: SheetTurn;
  content: ReactNode;
}

interface BottomSheetProps {
  /** Окно уезжает вниз (уже закрыто). */
  closing: boolean;
  onClose: () => void;
  /** Уехало вниз — убрать. */
  onGone: () => void;
  /** Подпись окна для скринридеров. */
  label: string;
  /** Цвет привычки (habitColorStyle). */
  style?: CSSProperties;
  /** Листание (окно дня): ключ карточки — новая въезжает сбоку (`turn`), а прежняя
   *  (`leaving`) одновременно уезжает в другую сторону; уехала — `onLeft`. */
  cardKey?: string;
  turn?: SheetTurn | null;
  leaving?: LeavingCard | null;
  onLeft?: () => void;
  /** Касания карточки (свайп листает). */
  onTouchStart?: (event: TouchEvent) => void;
  onTouchEnd?: (event: TouchEvent) => void;
  children: ReactNode;
}

export function BottomSheet({
  closing,
  onClose,
  onGone,
  label,
  style,
  cardKey,
  turn = null,
  leaving = null,
  onLeft,
  onTouchStart,
  onTouchEnd,
  children,
}: BottomSheetProps) {
  const backdropPressed = useRef(false);
  return (
    <div className={`${styles.layer} ${closing ? styles.closing : ""}`} style={style}>
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
            onClose();
          }
          backdropPressed.current = false;
        }}
      />
      {leaving ? (
        <div
          key={`out-${leaving.key}`}
          className={`${styles.sheet} ${styles.leaving} ${
            leaving.turn === "next" ? styles.outToPrevious : styles.outToNext
          }`}
          aria-hidden="true"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) {
              onLeft?.();
            }
          }}
        >
          {leaving.content}
        </div>
      ) : null}
      <div
        // Свой ключ у въезжающей: вернулись к уехавшему дню — новая карточка, а не та же.
        key={cardKey === undefined ? undefined : `in-${cardKey}`}
        className={`${styles.sheet} ${
          turn === "next" ? styles.inFromNext : turn === "previous" ? styles.inFromPrevious : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onAnimationEnd={(event) => {
          // Уехало вниз — убрать (анимации внутри сюда не относятся).
          if (closing && event.target === event.currentTarget) {
            onGone();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Шапка окна: чип дня, чип с названием привычки и «×». */
export function SheetHeader({
  day,
  name,
  onClose,
}: {
  day: string;
  name: string;
  onClose: () => void;
}) {
  const strings = useStrings();
  return (
    <div className={styles.header}>
      <span className={`${styles.chip} ${styles.dayChip}`}>
        <CalendarIcon />
        {day}
      </span>
      <span className={`${styles.chip} ${styles.nameChip}`}>{name}</span>
      <button
        type="button"
        className={styles.close}
        aria-label={strings.countSheetClose}
        onClick={onClose}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
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
