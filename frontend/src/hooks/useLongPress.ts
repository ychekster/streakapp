/**
 * Долгое нажатие: кнопка отметки «Сверх плана» (CheckButton → окно счёта) и день календаря
 * (HabitCalendar → окно дня). Держат LONG_PRESS_MS, не сдвигая палец дальше
 * LONG_PRESS_SLOP, — срабатывает; `click`, который приходит следом, — не обычное нажатие
 * (`consumeClick`). Одно касание за раз, поэтому один хук обслуживает и много кнопок:
 * `handlers(callback)` — обработчики для кнопки со своим действием.
 */

import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

/** Сколько держать (мс) и на сколько можно сдвинуть палец (px). */
const LONG_PRESS_MS = 250;
const LONG_PRESS_SLOP = 8;

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onContextMenu: (event: MouseEvent) => void;
}

export function useLongPress(): {
  handlers: (onLongPress: () => void) => LongPressHandlers;
  consumeClick: () => boolean;
} {
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const cancel = (): void => {
    window.clearTimeout(timer.current);
    start.current = null;
  };
  return {
    handlers: (onLongPress) => ({
      onPointerDown: (event) => {
        fired.current = false;
        start.current = { x: event.clientX, y: event.clientY };
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          fired.current = true;
          start.current = null;
          onLongPress();
        }, LONG_PRESS_MS);
      },
      onPointerMove: (event) => {
        const from = start.current;
        if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > LONG_PRESS_SLOP) {
          cancel();
        }
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      // Без системного меню под пальцем.
      onContextMenu: (event) => event.preventDefault(),
    }),
    consumeClick: () => {
      const was = fired.current;
      fired.current = false;
      return was;
    },
  };
}
