/**
 * Шкала и геометрия графиков аналитики. Размеры SVG — в пикселях (атрибутам SVG нужны
 * числа), цвета — в CSS-модулях графиков.
 */

/** Высота области построения, отступ над ней (место под точку) и полоса подписей оси X. */
export const PLOT_HEIGHT = 132;
export const PLOT_TOP = 10;
export const X_AXIS_BAND = 24;
/** Ширина колонки подписей оси Y (справа). */
export const Y_AXIS_WIDTH = 40;
/** Линия — 2px; точка — радиус 4 и кольцо цвета карточки в 2px. */
export const LINE_WIDTH = 2;
export const DOT_RADIUS = 4;
export const DOT_RING = 2;
/** Пунктир отрезка до неполного дня (сегодня). */
export const PARTIAL_DASH = "4 4";

/** «Красивые» деления шкалы от нуля: шаг 1, 2, 2.5 или 5 × 10ⁿ, `count` делений до верха.
 *  Для счётчиков (`integer`) шаг — целый. */
export function niceTicks(max: number, count: number, integer: boolean): number[] {
  const safeMax = max > 0 ? max : 1;
  const raw = safeMax / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  const step = integer ? Math.max(1, Math.ceil(nice * magnitude)) : nice * magnitude;
  return Array.from({ length: count + 1 }, (_, index) => index * step);
}
