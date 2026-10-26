/**
 * Цвет (тема) привычки в разметке и в нижней кнопке.
 *
 * Сами цвета — дизайн-токены `--palette-*` (styles/variables.css): каналы R, G, B через
 * запятую. Разметка получает цвет привычки переменной `--habit-rgb` на своём корне
 * (компоненты берут rgb(var(--habit-rgb))). Свой цвет («#rrggbb», палитра в форме)
 * подставляется каналами как есть — одинаковый в обеих темах.
 */

import type { CSSProperties } from "react";

import { DEFAULT_HABIT_COLOR, HABIT_COLORS } from "./constants";

const CUSTOM_COLOR = /^#[0-9a-f]{6}$/i;

/** Свой ли это цвет («#rrggbb»), а не ключ палитры. */
export function isCustomColor(color: string): color is `#${string}` {
  return CUSTOM_COLOR.test(color);
}

/** Каналы «R, G, B» цвета привычки: свой — из «#rrggbb», ключ палитры — её токен.
 *  Неизвестный ключ (например, цвет из более новой версии API) — цвет по умолчанию. */
function habitRgb(color: string): string {
  if (isCustomColor(color)) {
    const value = Number.parseInt(color.slice(1), 16);
    return `${value >> 16}, ${(value >> 8) & 255}, ${value & 255}`;
  }
  const known = (HABIT_COLORS as readonly string[]).includes(color) ? color : DEFAULT_HABIT_COLOR;
  return `var(--palette-${known})`;
}

/** «#rrggbb» цвета привычки в текущей теме (начальный цвет системной палитры). */
export function habitColorHex(color: string): string {
  if (isCustomColor(color)) {
    return color.toLowerCase();
  }
  const channels = readRootVariable(`--palette-${color}`).split(",").map(Number);
  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    return "#007aff";
  }
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Инлайн-стиль, окрашивающий поддерево в цвет привычки. */
export function habitColorStyle(color: string): CSSProperties {
  return { "--habit-rgb": habitRgb(color) } as CSSProperties;
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
  return { color: `rgb(${habitRgb(color)})`, textColor: "var(--color-on-habit)" };
}
