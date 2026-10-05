/** Ширина элемента в CSS-пикселях — и её изменения (поворот экрана, другая ширина окна).
 *  0 — ещё не измерена. По ней график рисуется в реальных пикселях: подписи осей не
 *  растягиваются вместе с ним. */

import { useEffect, useState, type RefObject } from "react";

export function useElementWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const update = (): void => setWidth(Math.round(element.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
