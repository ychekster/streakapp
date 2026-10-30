/**
 * Календарь экрана привычки и «Всего выполнено» в виде «18/25»: что было в каждый день
 * и сколько дней привычка шла.
 *
 * Отсчёт — с первого дня привычки, как у сетки fixed (gridLayout.firstDay: первая
 * отметка или первый день заморозки). Дни — из `history` (последние HISTORY_DAYS, последний
 * — день отметки): календарь листается по всей истории (любой её день можно исправить в
 * окне дня, DaySheet), а дни старше неё в счёт дней идут по расписанию. Бонусная отметка
 * (не по расписанию того дня, data/derive.ts countedDays) в календаре — как обычная, но в
 * «18/25» не идёт.
 */

import { addDays, daysBetween, daysInMonth, weekdayIndex } from "../data/dates";
import { countedHistory, goalOn, groupFill, isDueOnDay, myDay } from "../data/derive";
import type { GoalUnit, Habit } from "../types/habit";
import { firstDay } from "./gridLayout";

/** Что было в день:
 *  - `done` — выполнена; `partial` — «несколько раз в день», но меньше цели;
 *  - `missed` — была запланирована и не выполнена (в день отметки — ещё не выполнена);
 *  - `frozen` — заморожена; `rest` — не запланирована (с первого дня по день отметки);
 *  - `off` — до первого дня или ещё не наступил; `unknown` — старше истории. */
export type CalendarDayState =
  | "done"
  | "partial"
  | "missed"
  | "frozen"
  | "rest"
  | "off"
  | "unknown";

export interface CalendarDay {
  /** «ГГГГ-ММ-ДД». */
  date: string;
  state: CalendarDayState;
  /** Доля сделанного у `partial` (0…1). */
  fill: number;
  /** День отметки. */
  today: boolean;
}

/** Первый день привычки или null — ни отметок, ни заморозок. */
function startOf(habit: Habit, day: string): string | null {
  const first = firstDay(habit, habit.created_on ?? day, day);
  if (first < day) {
    return first;
  }
  // Первый день — день отметки: привычка началась, только если в него уже что-то есть.
  const last = habit.history.length - 1;
  const started =
    habit.history[last] ||
    (habit.history_counts?.[last] ?? 0) > 0 ||
    (habit.frozen_history[last] ?? false);
  return started ? day : null;
}

/**
 * Сколько дней привычка шла — знаменатель «18/25»: дни с первого дня по день отметки, в
 * которые она была запланирована и не заморожена, и выполненные в них (бонусные отметки —
 * нет). День отметки — только выполненный (он ещё не закончился), как и день после него в
 * режиме «Отмечать за вчера». Не меньше `total_done`. `day` — день отметки.
 */
export function trackedDays(habit: Habit, day: string): number {
  const start = startOf(habit, day);
  if (start === null) {
    return habit.total_done;
  }
  const { history, frozen_history: frozen } = habit;
  const historyStart = addDays(day, 1 - history.length);
  const counted = countedHistory(habit, day);
  let count = habit.next_day_done ? 1 : 0;
  for (let date = start; date <= day; date = addDays(date, 1)) {
    if (date < historyStart) {
      count += isDueOnDay(habit, date) ? 1 : 0;
      continue;
    }
    const index = daysBetween(historyStart, date);
    if (counted[index] || (date < day && !frozen[index] && isDueOnDay(habit, date))) {
      count += 1;
    }
  }
  return Math.max(count, habit.total_done);
}

/**
 * Знаменатель «24 / 100 мин» («Цель по времени», `unit` seconds) и «14 / 20» (несколько раз
 * в день, times): сколько было запланировано — цели тех же дней, что в trackedDays, но
 * только дней истории (счёт старше неё неизвестен) и только с целью в `unit` (дни с другой
 * целью — прежнее расписание — не в счёт). День отметки — по расписанию (он уже идёт), а не
 * только выполненный.
 */
export function plannedTotal(habit: Habit, day: string, unit: GoalUnit): number {
  const start = startOf(habit, day);
  if (start === null) {
    return 0;
  }
  const goal = (date: string): number => {
    const target = goalOn(habit, date);
    return target.unit === unit ? target.goal : 0;
  };
  const { history, frozen_history: frozen } = habit;
  const historyStart = addDays(day, 1 - history.length);
  const counted = countedHistory(habit, day);
  let total = habit.next_day_done ? goal(addDays(day, 1)) : 0;
  for (let date = start < historyStart ? historyStart : start; date <= day; date = addDays(date, 1)) {
    const index = daysBetween(historyStart, date);
    if (counted[index] || (!frozen[index] && isDueOnDay(habit, date))) {
      total += goal(date);
    }
  }
  return total;
}

/**
 * Несколько раз в день, числитель «14 / 20»: сколько раз выполнена за дни истории (`day` —
 * день отметки, её последний), без дней с целью по времени, и за день после него, если он
 * выполнен (как в plannedTotal). Выполненный день — не меньше цели (отметка без счёта),
 * со «Сверх плана» — и всё сверх неё. У совместной — моя часть.
 */
export function totalTimes(habit: Habit, day: string): number {
  let sum = 0;
  for (let date = addDays(day, 1 - habit.history.length); date <= day; date = addDays(date, 1)) {
    const { goal, unit } = goalOn(habit, date);
    if (unit === "times") {
      const mine = myDay(habit, date, day);
      sum += Math.max(mine.count, mine.done ? goal : 0);
    }
  }
  const next = goalOn(habit, addDays(day, 1));
  if (habit.next_day_done && next.unit === "times") {
    sum += Math.max(habit.next_day_count ?? 0, next.goal);
  }
  return sum;
}

/** Месяц «ГГГГ-ММ» дня. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** Месяц `month` («ГГГГ-ММ»), сдвинутый на `months` (отрицательно — назад). */
export function addMonths(month: string, months: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Самый ранний месяц календаря — месяц начала истории: любой её день можно исправить. */
export function firstMonth(habit: Habit, day: string): string {
  return monthOf(addDays(day, 1 - habit.history.length));
}

/** Доля неполного дня (0…1): у совместной — сделанная всеми, у «несколько раз в день» — по
 *  счёту и цели того дня, у остальных — 0. `index` — день `date` в `history`. */
function partOf(habit: Habit, index: number, date: string): number {
  const fills = groupFill(habit);
  if (fills) {
    return fills[index] ?? 0;
  }
  const total = goalOn(habit, date).goal;
  return total > 1 ? Math.min((habit.history_counts?.[index] ?? 0) / total, 1) : 0;
}

/** Что было в день `date`; `day` — день отметки. */
function stateOf(habit: Habit, date: string, day: string, start: string | null): CalendarDayState {
  const total = habit.times_per_day;
  if (date > day) {
    // День после дня отметки — календарный сегодня в режиме «Отмечать за вчера».
    if (date !== addDays(day, 1)) {
      return "off";
    }
    if (habit.next_day_done) {
      return "done";
    }
    return total > 1 && (habit.next_day_count ?? 0) > 0 ? "partial" : "off";
  }
  const historyStart = addDays(day, 1 - habit.history.length);
  if (date < historyStart) {
    return "unknown";
  }
  const index = daysBetween(historyStart, date);
  if (habit.history[index]) {
    return "done";
  }
  if (habit.frozen_history[index]) {
    return "frozen";
  }
  if (partOf(habit, index, date) > 0) {
    return "partial";
  }
  if (start === null || date < start) {
    return "off";
  }
  return isDueOnDay(habit, date) ? "missed" : "rest";
}

/**
 * Дни месяца `month` («ГГГГ-ММ») по неделям с понедельника: всегда 6 недель (42 места),
 * чтобы высота календаря не прыгала при листании; места вне месяца — null.
 */
export function calendarMonth(habit: Habit, month: string, day: string): (CalendarDay | null)[] {
  const start = startOf(habit, day);
  const first = `${month}-01`;
  const lead = weekdayIndex(first);
  const length = daysInMonth(first);
  const total = habit.times_per_day;
  return Array.from({ length: 42 }, (_, place) => {
    const offset = place - lead;
    if (offset < 0 || offset >= length) {
      return null;
    }
    const date = addDays(first, offset);
    const state = stateOf(habit, date, day, start);
    let fill = 0;
    if (state === "partial") {
      const historyStart = addDays(day, 1 - habit.history.length);
      fill =
        date > day
          ? Math.min((habit.next_day_count ?? 0) / total, 1)
          : partOf(habit, daysBetween(historyStart, date), date);
    }
    return { date, state, fill, today: date === day };
  });
}
