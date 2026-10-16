/**
 * Цвет (тема) привычки в разметке и в нижней кнопке.
 *
 * Сами цвета — дизайн-токены `--palette-*` (styles/variables.css): каналы R, G, B через
 * запятую. Разметка получает цвет привычки переменной `--habit-rgb` на своём корне
 * (компоненты берут rgb(var(--habit-rgb))).
 */

import type { CSSProperties } from "react";

import { DEFAULT_HABIT_COLOR, HABIT_COLORS } from "./constants";
import type { HabitColor } from "./types/habit";

/** Неизвестный ключ (например, цвет из более новой версии API) — цвет по умолчанию. */
function knownColor(color: string): HabitColor {
  return (HABIT_COLORS as readonly string[]).includes(color)
    ? (color as HabitColor)
    : DEFAULT_HABIT_COLOR;
}

/** Инлайн-стиль, окрашивающий поддерево в цвет привычки. */
export function habitColorStyle(color: string): CSSProperties {
  return { "--habit-rgb": `var(--palette-${knownColor(color)})` } as CSSProperties;
}

/** Значение CSS-переменной с корня документа (пустая строка, если не задана). */
export function readRootVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/*
 * Цвета нижней кнопки (MainButtonBar) — ссылки на токены, а не прочитанные значения:
 * браузер сам берёт их из текущей темы. Чтение стилей в рендере опережает смену темы
 * (она применяется в эффекте App) — и кнопка оставалась в цветах прежней темы, например
 * когда iOS перекрашивает свёрнутое веб-приложение для снимка переключателя приложений.
 */

/** Нижняя кнопка в акцентном цвете. */
export const MAIN_BUTTON_ACCENT = {
  color: "var(--color-accent)",
  textColor: "var(--color-on-habit)",
};

/** Нижняя кнопка, пока форма не заполнена. */
export const MAIN_BUTTON_DISABLED = {
  color: "var(--main-button-disabled-bg)",
  textColor: "var(--main-button-disabled-text)",
};

/** Нижняя кнопка в цвете привычки. */
export function mainButtonHabitColors(color: string): { color: string; textColor: string } {
  return { color: `rgb(var(--palette-${knownColor(color)}))`, textColor: "var(--color-on-habit)" };
}
