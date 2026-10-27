/**
 * Смахивание плашки над навигацией справа налево (UndoToast, остановленный таймер в
 * TimerBar): плашка едет за пальцем влево; отпустили дальше SWIPE_AWAY_PX или быстрым
 * взмахом — уезжает за левый край и пропадает (`onGone`), ближе — плавно возвращается на
 * место. Вправо не тянется.
 *
 * Плашке нужен touch-action: pan-y: горизонтальное движение пальца её, и свайп по папкам
 * (useHorizontalSwipe) его не трогает, а вертикальное — прокрутка страницы (касание
 * отменяется — плашка возвращается). `click`, который браузер может прислать после
 * смахивания, не нажимает кнопку под пальцем (onClickCapture).
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { hapticImpact } from "../telegram/webapp";

/** Палец сдвинулся вбок дальше — это смахивание, а не нажатие (px). */
const DRAG_SLOP_PX = 8;
/** Отпустили дальше — плашка уезжает (px). */
const SWIPE_AWAY_PX = 70;
/** Быстрый взмах влево (px/мс) уносит плашку и с меньшего расстояния. */
const FLICK_SPEED = 0.5;
/** Возврат на место и уход за край (мс). */
const BACK_MS = 220;
const OUT_MS = 200;

type Phase = "idle" | "drag" | "back" | "out";

export interface SwipeAwayHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onClickCapture: (event: MouseEvent) => void;
  onTransitionEnd: (event: { target: EventTarget; currentTarget: EventTarget }) => void;
}

/** `enabled` false — плашка не смахивается (идущий таймер). */
export function useSwipeAway(
  onGone: () => void,
  enabled = true,
): { handlers: SwipeAwayHandlers; style: CSSProperties | undefined } {
  const [phase, setPhase] = useState<Phase>("idle");
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  const dragging = useRef(false);
  // Смахнули — следующий click не нажатие.
  const swallowClick = useRef(false);
  const gone = useRef(onGone);
  gone.current = onGone;

  function finish(): void {
    setPhase("idle");
    setOffset(0);
    gone.current();
  }

  // Смахивать больше нельзя (таймер снова пошёл) — плашка на месте.
  useEffect(() => {
    if (!enabled) {
      start.current = null;
      dragging.current = false;
      setPhase("idle");
      setOffset(0);
    }
  }, [enabled]);

  // Уход за край: подстраховка, если transitionend не придёт (вкладка в фоне).
  useEffect(() => {
    if (phase !== "out") {
      return undefined;
    }
    const timer = window.setTimeout(finish, OUT_MS + 100);
    return () => window.clearTimeout(timer);
  }, [phase]);

  function release(event: PointerEvent<HTMLElement> | null): void {
    const from = start.current;
    start.current = null;
    if (!dragging.current) {
      return;
    }
    dragging.current = false;
    swallowClick.current = true;
    const dx = event && from ? Math.min(0, event.clientX - from.x) : 0;
    const speed = event && from ? dx / Math.max(1, event.timeStamp - from.time) : 0;
    if (event && (dx <= -SWIPE_AWAY_PX || (dx <= -2 * DRAG_SLOP_PX && speed <= -FLICK_SPEED))) {
      hapticImpact("light");
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        finish();
        return;
      }
      // За левый край экрана целиком.
      setOffset(-(event.currentTarget.getBoundingClientRect().right + DRAG_SLOP_PX));
      setPhase("out");
      return;
    }
    setOffset(0);
    setPhase("back");
  }

  const handlers: SwipeAwayHandlers = {
    onPointerDown: (event) => {
      if (!enabled || phase === "out") {
        return;
      }
      start.current = { x: event.clientX, y: event.clientY, time: event.timeStamp };
      dragging.current = false;
      swallowClick.current = false;
    },
    onPointerMove: (event) => {
      const from = start.current;
      if (!from) {
        return;
      }
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (!dragging.current) {
        if (Math.abs(dx) > DRAG_SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
          dragging.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } else if (Math.abs(dy) > DRAG_SLOP_PX) {
          start.current = null;
          return;
        } else {
          return;
        }
      }
      setPhase("drag");
      setOffset(Math.min(0, dx));
    },
    onPointerUp: (event) => release(event),
    onPointerCancel: () => release(null),
    onClickCapture: (event) => {
      if (swallowClick.current) {
        swallowClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onTransitionEnd: (event) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (phase === "out") {
        finish();
      } else if (phase === "back") {
        setPhase("idle");
      }
    },
  };

  let style: CSSProperties | undefined;
  if (phase === "drag") {
    style = { transform: `translateX(${offset}px)`, transition: "none" };
  } else if (phase === "back") {
    style = { transform: "translateX(0)", transition: `transform ${BACK_MS}ms ease-out` };
  } else if (phase === "out") {
    style = {
      transform: `translateX(${offset}px)`,
      opacity: 0,
      transition: `transform ${OUT_MS}ms ease-in, opacity ${OUT_MS}ms ease-in`,
    };
  }
  return { handlers, style };
}
