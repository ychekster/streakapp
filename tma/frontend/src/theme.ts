/**
 * Цвет (тема) привычки в разметке и в кнопках Telegram.
 *
 * Сами цвета — дизайн-токены `--palette-*` (styles/variables.css): каналы R, G, B через
 * запятую. Разметка получает цвет привычки переменной `--habit-rgb` на своём корне
 * (компоненты берут rgb(var(--habit-rgb))), а кнопкам Telegram, которые понимают только
 * «#RRGGBB», токен переводится в hex.
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

/** Каналы «R, G, B» → «#rrggbb». */
function channelsToHex(channels: string): string {
  const hex = channels
    .split(",")
    .map((channel) => Number.parseInt(channel, 10).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

/** Цвет привычки в виде «#rrggbb» (для кнопок Telegram). */
export function habitColorHex(color: string): string {
  return channelsToHex(readRootVariable(`--palette-${knownColor(color)}`));
}
