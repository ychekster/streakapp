/**
 * «Вид сетки» calendar: где стоит каждый день в сетке-календаре (CalendarGrid).
 *
 * Сетка — ряды месяцев: в ряду 4 месяца подряд, последний — месяц дня отметки. В месяце
 * кружки стоят по неделям: столбец — неделя (с понедельника), ряд — день недели (Пн
 * сверху, Вс снизу), так у каждой даты своё место, как в календаре. Рядов несколько
 * (экран привычки) — сверху старые месяцы, снизу последние.
 *
 * Координаты — в условных единицах: кружок CELL, зазор GAP (на телефоне единица — около
 * пикселя). Ширина ряда постоянна — как 22 недели (самые широкие 4 месяца подряд) и
 * промежутки между месяцами: так кружки не меняют размер от месяца к месяцу, а лишнее
 * место у месяцев поуже делится поровну между промежутками.
 */

import { addDays, daysInMonth, weekdayIndex } from "../data/dates";
import { addMonths, monthOf } from "./calendarDays";

/** Месяцев в ряду. */
export const CALENDAR_ROW_MONTHS = 4;
/** Недель (столбцов) в ряду, если месяцы самые широкие. */
const ROW_WEEKS = 22;

export const CELL = 10;
const GAP = 2;
export const PITCH = CELL + GAP;
/** Наименьший промежуток между месяцами — сверх зазора между кружками. */
const MONTH_GAP = 6;

/** Размеры ряда в единицах. */
export const ROW_WIDTH = ROW_WEEKS * PITCH - GAP + (CALENDAR_ROW_MONTHS - 1) * MONTH_GAP;
export const ROW_HEIGHT = 7 * PITCH - GAP;

export interface CalendarMonth {
  /** «ГГГГ-ММ». */
  month: string;
  /** Левый край первой недели. */
  x: number;
}

export interface CalendarCell {
  /** «ГГГГ-ММ-ДД». */
  date: string;
  x: number;
  y: number;
}

export interface CalendarRow {
  months: CalendarMonth[];
  cells: CalendarCell[];
}

/** Сколько недель (столбцов с понедельника) занимает месяц «ГГГГ-ММ». */
export function monthWeeks(month: string): number {
  const first = `${month}-01`;
  return Math.ceil((weekdayIndex(first) + daysInMonth(first)) / 7);
}

/** Ряды календаря: `rows` × 4 месяцев по месяц дня `day` включительно (старые — сверху). */
export function calendarRows(day: string, rows: number): CalendarRow[] {
  const last = monthOf(day);
  return Array.from({ length: rows }, (_, row) => {
    const first = addMonths(last, -(rows - row) * CALENDAR_ROW_MONTHS + 1);
    const months = Array.from({ length: CALENDAR_ROW_MONTHS }, (_, at) => addMonths(first, at));
    const weeks = months.map(monthWeeks);
    const extra = (ROW_WEEKS - weeks.reduce((sum, count) => sum + count, 0)) * PITCH;
    const gap = GAP + MONTH_GAP + extra / (CALENDAR_ROW_MONTHS - 1);
    const placed: CalendarMonth[] = [];
    const cells: CalendarCell[] = [];
    let x = 0;
    months.forEach((month, at) => {
      placed.push({ month, x });
      const start = `${month}-01`;
      const offset = weekdayIndex(start);
      for (let date = 0; date < daysInMonth(start); date += 1) {
        const place = offset + date;
        cells.push({
          date: addDays(start, date),
          x: x + Math.floor(place / 7) * PITCH,
          y: (place % 7) * PITCH,
        });
      }
      x += weeks[at]! * PITCH - GAP + gap;
    });
    return { months: placed, cells };
  });
}
