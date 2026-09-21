/**
 * Тёмная ли сейчас система — для адаптивной темы.
 *
 * Внутри Telegram источник — тема самого Telegram (`colorScheme` и событие
 * `themeChanged`): на iPhone, где Telegram по умолчанию следует за системой, она
 * переключается вместе с iPhone, а приложение остаётся в тон с шапкой и кнопками
 * Telegram, даже если тема Telegram выбрана вручную. Вне Telegram (или в старом
 * клиенте) — системная тема браузера (`prefers-color-scheme`). Смена любой из них
 * применяется сразу, без перезапуска.
 */

import { useEffect, useState } from "react";

import { getTelegramColorScheme, onTelegramThemeChanged } from "../telegram/webapp";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readSystemDark(): boolean {
  const telegramScheme = getTelegramColorScheme();
  if (telegramScheme) {
    return telegramScheme === "dark";
  }
  return window.matchMedia(DARK_QUERY).matches;
}

export function useSystemDark(): boolean {
  const [dark, setDark] = useState(readSystemDark);

  useEffect(() => {
    const update = (): void => setDark(readSystemDark());
    const media = window.matchMedia(DARK_QUERY);
    media.addEventListener("change", update);
    const offTelegram = onTelegramThemeChanged(update);
    return () => {
      media.removeEventListener("change", update);
      offTelegram();
    };
  }, []);

  return dark;
}
