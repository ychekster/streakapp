/**
 * Цвет (тема) привычки в разметке и в нижней кнопке.
 *
 * Сами цвета — дизайн-токены `--palette-*` (styles/variables.css): каналы R, G, B через
 * запятую. Разметка получает цвет привычки переменной `--habit-rgb` на своём корне
 * (компоненты берут rgb(var(--habit-rgb))).
 *
 * Свой цвет («#rrggbb», палитра в форме) хранится как выбран, а показывается в каждой
 * теме читаемым (readableRgb): слишком светлый в светлой теме затемняется, слишком
 * тёмный в тёмной — осветляется, пока не отличается от карточки не хуже цветов палитры.
 * Тогда видны и точки сетки, и галочка поверх заливки. Оба варианта стоят в каналах
 * сразу, а нужный выбирает флаг темы `--theme-light` (1 — светлая, 0 — тёмная).
 */

import type { CSSProperties } from "react";

import { DEFAULT_HABIT_COLOR, HABIT_COLORS } from "./constants";

const CUSTOM_COLOR = /^#[0-9a-f]{6}$/i;

/** Свой ли это цвет («#rrggbb»), а не ключ палитры. */
export function isCustomColor(color: string): color is `#${string}` {
  return CUSTOM_COLOR.test(color);
}

type Rgb = [number, number, number];
type ThemeName = "light" | "dark";

/** Карточка темы (--color-card) — фон, на котором стоят точки и кнопка отметки. */
const CARD: Record<ThemeName, Rgb> = { light: [255, 255, 255], dark: [28, 28, 30] };

/** Наименьший контраст своего цвета с карточкой — как у самых бледных цветов палитры
 *  в этой теме (в светлой — зелёный и оранжевый, в тёмной — индиго). */
const MIN_CONTRAST: Record<ThemeName, number> = { light: 2.2, dark: 3 };

/** Относительная яркость цвета (WCAG). */
function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Контраст двух цветов (WCAG), от 1 до 21. */
export function contrast(first: Rgb, second: Rgb): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** Свой цвет, читаемый в теме: оттенок тот же, а светлота сдвинута к чёрному (светлая
 *  тема) или к белому (тёмная) ровно настолько, чтобы контраст с карточкой был не ниже
 *  MIN_CONTRAST. Цвет, который и так читается, не меняется. */
export function readableRgb(rgb: Rgb, theme: ThemeName): Rgb {
  const card = CARD[theme];
  if (contrast(rgb, card) >= MIN_CONTRAST[theme]) {
    return rgb;
  }
  const toward = theme === "light" ? 0 : 255;
  const mix = (amount: number): Rgb =>
    rgb.map((channel) => Math.round(channel + (toward - channel) * amount)) as Rgb;
  // Наименьшая доля примеси, при которой контраст достаточен (делением пополам).
  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step += 1) {
    const middle = (low + high) / 2;
    if (contrast(mix(middle), card) >= MIN_CONTRAST[theme]) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return mix(high);
}

/** Каналы «R, G, B» цвета привычки: свой — из «#rrggbb», читаемый в текущей теме; ключ
 *  палитры — её токен. Неизвестный ключ (например, цвет из более новой версии API) —
 *  цвет по умолчанию. */
function habitRgb(color: string): string {
  if (isCustomColor(color)) {
    const value = Number.parseInt(color.slice(1), 16);
    const rgb: Rgb = [value >> 16, (value >> 8) & 255, value & 255];
    const light = readableRgb(rgb, "light");
    const dark = readableRgb(rgb, "dark");
    return light
      .map((channel, index) =>
        channel === dark[index]
          ? String(channel)
          : `calc(${channel} * var(--theme-light) + ${dark[index]} * (1 - var(--theme-light)))`,
      )
      .join(", ");
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
