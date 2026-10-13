/**
 * «Вид сетки» (Настройки): как сетка привычки раскладывает дни.
 *
 *  - "rolling" — сегодня всегда в правом нижнем кружке, вчерашний день уходит влево
 *    (и с левого края ряда — на ряд выше);
 *  - "fixed" — день создания привычки в левом верхнем кружке, дальше каждый
 *    календарный день — следующий кружок слева направо, сверху вниз, без сдвига. Дни
 *    идут «листами» по полгода — по сетке списка (GRID_DAYS): лист заполнился —
 *    сетка списка начинается заново. Годовая сетка (экран привычки) показывает два
 *    листа: первый лист заполняет её сверху; дальше прошлый лист — в верхней половине
 *    (без первых дней, что не поместились), текущий — с начала нижней. Последние дни
 *    листа в нижнюю половину не помещаются — в эти дни сетка сдвигается на кружок.
 *
 * Вид и календарный сегодня App раздаёт через контекст: так их не нужно передавать
 * через каждый список. Без контекста (админ-панель) — "rolling".
 */

import { createContext, useContext } from "react";

import { GRID_DAYS } from "../constants";
import { daysBetween } from "../data/dates";
import type { GridLayout } from "../types/settings";

export interface GridView {
  layout: GridLayout;
  /** Календарный сегодня в поясе пользователя («ГГГГ-ММ-ДД»); null — ещё неизвестен. */
  calendarDay: string | null;
}

export const GridViewContext = createContext<GridView>({ layout: "rolling", calendarDay: null });

export function useGridView(): GridView {
  return useContext(GridViewContext);
}

/**
 * Сколько первых кружков сетки из `cells` занято днями в виде "fixed" (последний из них —
 * день отметки); null — сетка "rolling" (все кружки — последние дни истории).
 *
 * Кружок дня — сколько дней прошло от создания привычки (в режиме «Отмечать за вчера»
 * день отметки — вчера, поэтому он стоит в кружке календарного сегодня). Привычки без
 * дня создания (сохранённые на устройстве до него) — "rolling", пока не ответит сервер.
 * Лист — `page` дней (полгода, сетка списка); сетка больше листа (годовая) — см. выше.
 */
export function fixedGridFill(
  view: GridView,
  createdOn: string | null | undefined,
  cells: number,
  page: number = GRID_DAYS,
): number | null {
  if (view.layout !== "fixed" || !view.calendarDay || !createdOn) {
    return null;
  }
  const age = Math.max(0, daysBetween(createdOn, view.calendarDay));
  const day = (age % page) + 1;
  if (cells <= page) {
    return day;
  }
  // Первый лист — с начала сетки; дальше текущий лист — с начала нижней половины.
  return age < page ? day : Math.min(cells, Math.floor(cells / 2) + day);
}
