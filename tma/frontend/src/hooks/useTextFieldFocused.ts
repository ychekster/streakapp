/**
 * Фокус в поле ввода текста — на телефоне в это время открыта клавиатура.
 *
 * Нужен закреплённой внизу навигации: пока открыта клавиатура, вебвью Telegram (и на
 * iPhone, и на Android) поднимает закреплённое внизу над ней, и таб-бар висит над
 * клавиатурой, закрывая поле. Пока фокус в поле, навигацию прячут, а вернётся она, когда
 * клавиатуру уберут.
 *
 * Фокус отслеживается по документу (focusin/focusout), поэтому годится любое поле без
 * изменений в экранах. Переход фокуса из поля в поле не мигает навигацией: после
 * focusout состояние проверяется на следующем такте, когда фокус уже в новом поле.
 */

import { useEffect, useState } from "react";

// Поля, для которых открывается клавиатура (у кнопок, флажков, выбора файла её нет).
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "number",
  "tel",
  "url",
  "password",
]);

function isTextField(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly;
  }
  if (element instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(element.type) && !element.readOnly;
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

export function useTextFieldFocused(): boolean {
  const [focused, setFocused] = useState(() => isTextField(document.activeElement));

  useEffect(() => {
    let timer: number | undefined;
    const update = (): void => setFocused(isTextField(document.activeElement));
    const onFocusOut = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 0);
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return focused;
}
