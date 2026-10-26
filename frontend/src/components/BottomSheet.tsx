/**
 * Окно, всплывающее снизу поверх экрана: окно счёта «Сверх плана» (CountSheet) и окно дня
 * в календаре (DaySheet). Ширина и отступ снизу постоянные — окно растёт только вверх.
 *
 * Закрывается «×» в шапке (SheetHeader) и нажатием на затемнение — уезжает вниз той же
 * анимацией, что появилось. Это слой поверх экрана, а не переход: кнопки «Назад» у него
 * нет. Что показывать, пока окно уезжает, хранит useSheetContent.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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
  children: ReactNode;
}

export function BottomSheet({ closing, onClose, onGone, label, style, children }: BottomSheetProps) {
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
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={label}
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
