/**
 * «Вид сетки» (Настройки): как сетка привычки раскладывает дни.
 *
 *  - "rolling" — день отметки всегда в правом нижнем кружке, вчерашний день уходит влево
 *    (и с левого края ряда — на ряд выше);
 *  - "fixed" — первый день привычки (день первой отметки) в левом верхнем кружке, дальше
 *    каждый календарный день — следующий кружок слева направо, сверху вниз, без сдвига.
 *    Начало неподвижно, кончается сетка днём отметки: в режиме «Отмечать за вчера» она на
 *    кружок короче. Дни идут «листами» по
 *    полгода — по сетке списка (GRID_DAYS): лист заполнился — сетка списка начинается
 *    заново. Годовая сетка (экран привычки) показывает два листа: первый лист заполняет
 *    её сверху; дальше прошлый лист — в верхней половине (без первых дней, что не
 *    поместились), текущий — с начала нижней. Последние дни листа в нижнюю половину не
 *    помещаются — в эти дни сетка сдвигается на кружок.
 *
 * Вид и день отметки App раздаёт через контекст: так их не нужно передавать через
 * каждый список. Без контекста (админ-панель) — "rolling".
 */

import { createContext, useContext } from "react";

import { GRID_DAYS } from "../constants";
import { addDays, daysBetween } from "../data/dates";
import type { Habit } from "../types/habit";
import type { GridLayout } from "../types/settings";

export interface GridView {
  layout: GridLayout;
  /** День отметки в поясе пользователя («ГГГГ-ММ-ДД»): сегодня, в режиме «Отмечать за
   *  вчера» — вчера; null — ещё неизвестен. */
  day: string | null;
}

export const GridViewContext = createContext<GridView>({ layout: "rolling", day: null });

export function useGridView(): GridView {
  return useContext(GridViewContext);
}

/** Что сетке fixed нужно от привычки. */
type GridHabit = Pick<Habit, "created_on" | "first_done_on" | "history" | "history_counts">;

/**
 * Первый день привычки в виде "fixed" — день первой отметки (в режиме «Отмечать за вчера»
 * отметили за вчера — первый день вчера). Пока отметок нет — день отметки: сетка
 * начинается с него. Первая отметка старше истории — её день от сервера
 * (`first_done_on`), так начало не сдвигается, когда она уходит из истории. Привычка
 * старше истории без этого поля (сохранена на устройстве до него) — от дня создания.
 */
function firstDay(habit: GridHabit, createdOn: string, day: string): string {
  const { history } = habit;
  // Последний день истории — день отметки.
  const historyStart = addDays(day, 1 - history.length);
  const known = habit.first_done_on;
  if (known && known < historyStart) {
    return known;
  }
  if (known === undefined && daysBetween(createdOn, day) >= history.length) {
    return createdOn;
  }
  const counts = habit.history_counts ?? [];
  const index = history.findIndex((done, at) => done || (counts[at] ?? 0) > 0);
  return index < 0 ? day : addDays(historyStart, index);
}

/**
 * Сколько первых кружков сетки из `cells` занято днями в виде "fixed" (последний из них —
 * день отметки); null — сетка "rolling" (все кружки — последние дни истории).
 *
 * Кружок дня — сколько дней прошло от первого дня привычки (см. `firstDay`). Привычки без
 * дня создания (сохранённые на устройстве до него) — "rolling", пока не ответит сервер.
 * Лист — `page` дней (полгода, сетка списка); сетка больше листа (годовая) — см. выше.
 */
export function fixedGridFill(
  view: GridView,
  habit: GridHabit,
  cells: number,
  page: number = GRID_DAYS,
): number | null {
  if (view.layout !== "fixed" || !view.day || !habit.created_on) {
    return null;
  }
  const age = daysBetween(firstDay(habit, habit.created_on, view.day), view.day);
  const day = (age % page) + 1;
  if (cells <= page) {
    return day;
  }
  // Первый лист — с начала сетки; дальше текущий лист — с начала нижней половины.
  return age < page ? day : Math.min(cells, Math.floor(cells / 2) + day);
}
