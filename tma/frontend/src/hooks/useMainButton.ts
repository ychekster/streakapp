/**
 * Нижняя кнопка Telegram (MainButton) на время жизни экрана: показывается при монтировании,
 * следует за состоянием (текст, цвет, активность, спиннер) и прячется при размонтировании.
 *
 * Нажатие вызывает актуальный `onClick` из последнего рендера, поэтому подписка одна на всё
 * время жизни экрана и обработчик не обязан быть стабильным.
 */

import { useEffect, useLayoutEffect, useRef } from "react";

import {
  hideMainButton,
  onMainButtonClick,
  showMainButton,
  type MainButtonState,
} from "../telegram/webapp";

export function useMainButton(state: MainButtonState, onClick: () => void): void {
  const { text, color, textColor, active, progress } = state;
  const handlerRef = useRef(onClick);

  useLayoutEffect(() => {
    handlerRef.current = onClick;
  });

  useEffect(() => onMainButtonClick(() => handlerRef.current()), []);

  useEffect(() => {
    showMainButton({ text, color, textColor, active, progress });
  }, [text, color, textColor, active, progress]);

  useEffect(() => hideMainButton, []);
}
