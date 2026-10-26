/**
 * Нижняя кнопка (MainButtonBar) на время жизни экрана: показывается при монтировании,
 * следует за состоянием (текст, цвет, активность, спиннер) и прячется при размонтировании.
 *
 * Нажатие вызывает актуальный `onClick` из последнего рендера, поэтому подписка одна на всё
 * время жизни экрана и обработчик не обязан быть стабильным.
 *
 * `state` null — кнопка спрятана (экран, который рисует и вложенный экран без кнопки, —
 * форма привычки и её «Дополнительно»).
 */

import { useEffect, useLayoutEffect, useRef } from "react";

import {
  hideMainButton,
  onMainButtonClick,
  showMainButton,
  type MainButtonState,
} from "../telegram/webapp";

export function useMainButton(state: MainButtonState | null, onClick: () => void): void {
  const shown = state !== null;
  const { text = "", color = "", textColor = "", active = false, progress = false } = state ?? {};
  const handlerRef = useRef(onClick);

  useLayoutEffect(() => {
    handlerRef.current = onClick;
  });

  useEffect(() => onMainButtonClick(() => handlerRef.current()), []);

  useEffect(() => {
    if (shown) {
      showMainButton({ text, color, textColor, active, progress });
    } else {
      hideMainButton();
    }
  }, [shown, text, color, textColor, active, progress]);

  useEffect(() => hideMainButton, []);
}
