/**
 * Видимая часть окна (window.visualViewport): когда на iPhone открыта клавиатура, она
 * ниже окна и может быть сдвинута вниз. По ней диалог с полем ввода встаёт по центру
 * над клавиатурой, а не уходит под неё. Пока `active` — верх и высота видимой части,
 * иначе (или без API) — null.
 */

import { useEffect, useState } from "react";

interface VisibleArea {
  top: number;
  height: number;
}

export function useVisualViewport(active: boolean): VisibleArea | null {
  const [area, setArea] = useState<VisibleArea | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) {
      return;
    }
    const update = (): void =>
      setArea({ top: viewport.offsetTop, height: viewport.height });
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [active]);

  return active ? area : null;
}
