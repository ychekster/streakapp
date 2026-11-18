/**
 * Кнопка «Назад» Telegram для вложенных экранов (экран привычки, форма привычки).
 *
 * С обработчиком — вместо «Закрыть» показана «Назад», без него (null) — снова «Закрыть».
 * Видимость и обработчик — отдельные эффекты: при переходе экран привычки → форма
 * кнопка не прячется и не показывается заново (иначе она мигнула бы), меняется только
 * обработчик. Обработчик должен быть стабильным (useCallback), иначе переподписка
 * будет на каждом рендере.
 *
 * Тот же обработчик вызывает свайп слева направо (useSwipeBack).
 *
 * `label` — в веб-приложении слово вместо стрелки («Готово» в режиме порядка вкладок); в
 * Telegram кнопка его собственная, там всегда «Назад».
 */

import { useEffect } from "react";

import { onBackButtonClick, setBackButtonLabel, setBackButtonVisible } from "../telegram/webapp";
import { useSwipeBack } from "./useSwipeBack";

export function useBackButton(onBack: (() => void) | null, label: string | null = null): void {
  const visible = onBack !== null;

  useSwipeBack(onBack);

  useEffect(() => (onBack ? onBackButtonClick(onBack) : undefined), [onBack]);

  useEffect(() => {
    setBackButtonVisible(visible);
  }, [visible]);

  useEffect(() => {
    setBackButtonLabel(visible ? label : null);
  }, [visible, label]);
}
