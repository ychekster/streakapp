/**
 * Горизонтальный свайп по экрану: на вложенных экранах слева направо — «Назад»
 * (useSwipeBack), на экране привычек — переход к соседней папке.
 *
 * Срабатывает, когда палец отпущен: движение вбок не короче SWIPE_MIN_DISTANCE и заметно
 * больше горизонтальное, чем вертикальное, — обычная прокрутка страницы его не вызывает.
 * Не срабатывает, если свайп начат в поле ввода, в ленте с горизонтальной прокруткой
 * (выбор цвета, фильтры, папки, которые не помещаются), на графике, где горизонтальное
 * движение выбирает день (touch-action: pan-y), или на ручке, за которую тянут ряд
 * (touch-action: none). Отменённое касание (системный жест «назад» на Android забирает
 * палец себе) — не свайп.
 */

import { useEffect } from "react";

const SWIPE_MIN_DISTANCE = 70; // px
const SWIPE_MAX_SLOPE = 0.6; // |dy| / |dx|: не круче ~30°
const SWIPE_MAX_DURATION = 800; // мс — медленное ведение пальцем не считается

/** Куда ушёл палец: "right" — слева направо, "left" — справа налево. */
export type SwipeDirection = "left" | "right";

/** Касание начато там, где горизонтальное движение пальца занято самим элементом. */
function ownsHorizontalSwipe(target: EventTarget | null): boolean {
  for (
    let element = target instanceof Element ? target : null;
    element && element !== document.body;
    element = element.parentElement
  ) {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      (element instanceof HTMLElement && element.isContentEditable)
    ) {
      return true;
    }
    const style = getComputedStyle(element);
    if (style.touchAction === "pan-y" || style.touchAction === "none") {
      return true;
    }
    if (
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      element.scrollWidth > element.clientWidth
    ) {
      return true;
    }
  }
  return false;
}

/** Обработчик null — свайп не слушается. Обработчик должен быть стабильным (useCallback). */
export function useHorizontalSwipe(onSwipe: ((direction: SwipeDirection) => void) | null): void {
  useEffect(() => {
    if (!onSwipe) {
      return undefined;
    }
    let start: { x: number; y: number; time: number } | null = null;

    const onStart = (event: TouchEvent) => {
      start =
        event.touches.length === 1 && !ownsHorizontalSwipe(event.target)
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY, time: event.timeStamp }
          : null;
    };
    const onEnd = (event: TouchEvent) => {
      if (!start || event.changedTouches.length !== 1) {
        start = null;
        return;
      }
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = Math.abs(event.changedTouches[0].clientY - start.y);
      const quick = event.timeStamp - start.time <= SWIPE_MAX_DURATION;
      start = null;
      if (Math.abs(dx) >= SWIPE_MIN_DISTANCE && dy <= Math.abs(dx) * SWIPE_MAX_SLOPE && quick) {
        onSwipe(dx > 0 ? "right" : "left");
      }
    };
    const onCancel = () => {
      start = null;
    };

    const passive = { passive: true };
    document.addEventListener("touchstart", onStart, passive);
    document.addEventListener("touchend", onEnd, passive);
    document.addEventListener("touchcancel", onCancel, passive);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [onSwipe]);
}
