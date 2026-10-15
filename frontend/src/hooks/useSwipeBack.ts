/**
 * Свайп слева направо — ещё один способ нажать «Назад» на вложенном экране (экран
 * привычки, форма, страницы настроек, админ-панель). Свайп справа налево ничего не делает.
 * Что считается свайпом — useHorizontalSwipe.
 */

import { useCallback } from "react";

import { useHorizontalSwipe, type SwipeDirection } from "./useHorizontalSwipe";

export function useSwipeBack(onBack: (() => void) | null): void {
  const onSwipe = useCallback(
    (direction: SwipeDirection) => {
      if (direction === "right") {
        onBack?.();
      }
    },
    [onBack],
  );
  useHorizontalSwipe(onBack ? onSwipe : null);
}
