/**
 * Окно, всплывающее снизу поверх экрана: окно счёта «Сверх плана» (CountSheet) и окно дня
 * в календаре (DaySheet). Ширина и отступ снизу постоянные — окно растёт только вверх.
 *
 * Закрывается «×» в шапке (SheetHeader), нажатием на затемнение и смахиванием вниз
 * (карточка едет за пальцем, затемнение бледнеет; отпустили дальше DISMISS_PX или
 * быстрым рывком — закрылось, иначе вернулась на место). Закрытое «×» и затемнением
 * уезжает вниз той же анимацией, что появилось; смахнутое — продолжает движение пальца:
 * с постоянной скоростью, не медленнее броска (FLING_MIN_SPEED), сразу за край экрана. Это слой поверх экрана, а не переход: кнопки «Назад» у него
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

/** Смахнули вниз дальше (px) — закрыть. */
const DISMISS_PX = 90;
/** …или быстрее (px/мс) и хоть немного (DISMISS_FLICK_PX). */
const DISMISS_SPEED = 0.5;
const DISMISS_FLICK_PX = 24;
/** Смахнутое окно уезжает с постоянной скоростью броска, но не медленнее этой (px/мс) и
 *  не дольше FLING_MAX_MS. */
const FLING_MIN_SPEED = 1.4;
const FLING_MAX_MS = 280;
/** С какого сдвига (px) понятно направление жеста: вниз — смахивание, вбок — листание. */
const AXIS_SLOP_PX = 8;

/** Жест по карточке: где начался, направление (null — ещё не ясно), насколько вниз и
 *  последняя точка для скорости. */
interface Drag {
  x: number;
  y: number;
  axis: "x" | "y" | null;
  dy: number;
  lastY: number;
  lastTime: number;
  speed: number;
}

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
  const card = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // Смахнули вниз: окно уезжает переходом от пальца, а не анимацией закрытия.
  const [flung, setFlung] = useState(false);
  useEffect(() => {
    if (!closing) {
      setFlung(false);
    }
  }, [closing]);

  /** Сдвинуть карточку вниз на `dy` (0 — на место; `animate` — плавно) и приглушить
   *  затемнение в ту же меру. */
  function offset(dy: number, animate: boolean): void {
    const element = card.current;
    if (!element) {
      return;
    }
    element.style.transition = animate
      ? "transform var(--count-sheet-anim) cubic-bezier(0.2, 0.9, 0.3, 1)"
      : "none";
    element.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
    if (backdrop.current) {
      backdrop.current.style.opacity =
        dy > 0 ? String(Math.max(0, 1 - dy / element.offsetHeight)) : "";
    }
  }

  function dragStart(event: TouchEvent): void {
    const point = event.touches[0];
    drag.current =
      point && event.touches.length === 1
        ? {
            x: point.clientX,
            y: point.clientY,
            axis: null,
            dy: 0,
            lastY: point.clientY,
            lastTime: event.timeStamp,
            speed: 0,
          }
        : null;
    onTouchStart?.(event);
  }

  function dragMove(event: TouchEvent): void {
    const state = drag.current;
    const point = event.touches[0];
    if (!state || !point || closing) {
      return;
    }
    const dx = point.clientX - state.x;
    const dy = point.clientY - state.y;
    if (state.axis === null && Math.hypot(dx, dy) > AXIS_SLOP_PX) {
      state.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      // Тянут окно — поле ввода не держит фокус (клавиатура уходит).
      if (state.axis === "y" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
    if (state.axis !== "y") {
      return;
    }
    const elapsed = event.timeStamp - state.lastTime;
    if (elapsed > 0) {
      state.speed = (point.clientY - state.lastY) / elapsed;
    }
    state.lastY = point.clientY;
    state.lastTime = event.timeStamp;
    // Вверх окно не тянется.
    state.dy = Math.max(0, dy);
    offset(state.dy, false);
  }

  function dragEnd(event: TouchEvent): void {
    const state = drag.current;
    drag.current = null;
    if (state?.axis !== "y") {
      onTouchEnd?.(event);
      return;
    }
    if (
      state.dy > DISMISS_PX ||
      (state.speed > DISMISS_SPEED && state.dy > DISMISS_FLICK_PX)
    ) {
      fling(state);
      onClose();
    } else {
      offset(0, true);
    }
  }

  /** Уехать вниз с того места, где отпустили, с постоянной скоростью броска; затемнение
   *  гаснет за то же время. Уехало — onTransitionEnd. */
  function fling(state: Drag): void {
    const element = card.current;
    if (!element) {
      return;
    }
    const bottom = parseFloat(getComputedStyle(element).marginBottom) || 0;
    const distance = element.offsetHeight + bottom;
    const speed = Math.max(state.speed, FLING_MIN_SPEED);
    // Не нулевая: иначе перехода (и его конца) не будет.
    const duration = Math.max(16, Math.min((distance - state.dy) / speed, FLING_MAX_MS));
    setFlung(true);
    element.style.transition = `transform ${duration}ms linear`;
    element.style.transform = `translateY(${distance}px)`;
    if (backdrop.current) {
      backdrop.current.style.transition = `opacity ${duration}ms linear`;
      backdrop.current.style.opacity = "0";
    }
  }

  function dragCancel(): void {
    if (drag.current?.axis === "y") {
      offset(0, true);
    }
    drag.current = null;
  }

  return (
    <div className={`${styles.layer} ${closing ? styles.closing : ""}`} style={style}>
      <div
        ref={backdrop}
        className={`${styles.backdrop} ${flung ? styles.flung : ""}`}
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
        } ${flung ? styles.flung : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        ref={card}
        onTouchStart={dragStart}
        onTouchMove={dragMove}
        onTouchEnd={dragEnd}
        onTouchCancel={dragCancel}
        onAnimationEnd={(event) => {
          // Уехало вниз — убрать (анимации внутри сюда не относятся).
          if (closing && !flung && event.target === event.currentTarget) {
            onGone();
          }
        }}
        onTransitionEnd={(event) => {
          // Смахнутое уехало вниз.
          if (closing && flung && event.target === event.currentTarget) {
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
