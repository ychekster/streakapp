/**
 * Кнопка «Назад» Telegram для вложенных экранов (экран привычки, форма привычки).
 *
 * С обработчиком — вместо «Закрыть» показана «Назад», без него (null) — снова «Закрыть».
 * Видимость и обработчик — отдельные эффекты: при переходе экран привычки → форма
 * кнопка не прячется и не показывается заново (иначе она мигнула бы), меняется только
 * обработчик. Обработчик должен быть стабильным (useCallback), иначе переподписка
 * будет на каждом рендере.
 */

import { useEffect } from "react";

import { onBackButtonClick, setBackButtonVisible } from "../telegram/webapp";

export function useBackButton(onBack: (() => void) | null): void {
  const visible = onBack !== null;

  useEffect(() => (onBack ? onBackButtonClick(onBack) : undefined), [onBack]);

  useEffect(() => {
    setBackButtonVisible(visible);
  }, [visible]);
}
