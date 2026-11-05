/**
 * The habit's statistics screen (screens/HabitStatsScreen.tsx): what its tiles and charts
 * show, counted on the device from the habit's history — the last HISTORY_DAYS days, the
 * last of them the marking day `day`. Days before the habit's first day
 * (calendarDays.startOf) and older than the history are left out.
 *
 * What is measured depends on the kind of habit (statsKind):
 *  - time («Цель по времени») — seconds a day (minutes on screen), days with a goal in
 *    times (a past schedule) count 0;
 *  - times (several times a day) — reps a day, as «Всего повторений» (totalTimes);
 *  - check (once a day) — completion: counted days of the days it was due and not frozen,
 *    as «Всего выполнено» counts them (trackedDays): the marking day is due only once done;
 *  - flexible («Гибкий график») — marks, any day.
 */

import { startOf, stateOf } from "../components/calendarDays";
import type { Habit } from "../types/habit";
import { addDays, daysBetween, daysInMonth, weekdayIndex } from "./dates";
import {
  countedHistory,
  flexiblePeriod,
  goalOn,
  isDueOnDay,
  isTimed,
  myDay,
  periodBounds,
  periodGoal,
} from "./derive";

export type StatsKind = "time" | "times" | "check" | "flexible";
export type StatsRange = "month" | "quarter" | "year";

export function statsKind(habit: Habit): StatsKind {
  if (flexiblePeriod(habit) !== null) {
    return "flexible";
  }
  if (isTimed(habit)) {
    return "time";
  }
  return habit.times_per_day > 1 ? "times" : "check";
}

/** The history as the counts read it. */
interface Days {
  habit: Habit;
  day: string;
  kind: StatsKind;
  /** The history's first day. */
  first: string;
  /** The habit's first day (startOf), null — nothing marked yet. */
  start: string | null;
  counted: boolean[];
}

function daysOf(habit: Habit, day: string): Days {
  return {
    habit,
    day,
    kind: statsKind(habit),
    first: addDays(day, 1 - habit.history.length),
    start: startOf(habit, day),
    counted: countedHistory(habit, day),
  };
}

/** Is `date` a known day of the habit: from its first day (and the history's) to `day`. */
function known(days: Days, date: string): boolean {
  return days.start !== null && date >= days.start && date >= days.first && date <= days.day;
}

/** What a known day brought: seconds (time), reps (times) or a mark (check, flexible). */
function amountOn(days: Days, date: string): number {
  const { habit, day, kind } = days;
  if (kind === "time" || kind === "times") {
    const { goal, unit } = goalOn(habit, date);
    if (unit !== (kind === "time" ? "seconds" : "times")) {
      return 0;
    }
    const mine = myDay(habit, date, day);
    return kind === "time" ? mine.count : Math.max(mine.count, mine.done ? goal : 0);
  }
  return habit.history[daysBetween(days.first, date)] ? 1 : 0;
}

/** Was a known day due (as trackedDays): counted, or past, due and not frozen. */
function dueOn(days: Days, date: string): boolean {
  const index = daysBetween(days.first, date);
  return (
    days.counted[index] ||
    (date < days.day && !days.habit.frozen_history[index] && isDueOnDay(days.habit, date))
  );
}

/** Sums over the known days from `from` to `to`. */
export interface Totals {
  /** Seconds (time), reps (times) or marks (check, flexible). */
  amount: number;
  /** Days that brought anything. */
  activeDays: number;
  /** Counted days and due days — completion is done / due. */
  done: number;
  due: number;
  /** Any known day in the range. */
  any: boolean;
}

function totals(days: Days, from: string, to: string): Totals {
  const sum: Totals = { amount: 0, activeDays: 0, done: 0, due: 0, any: false };
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (!known(days, date)) {
      continue;
    }
    sum.any = true;
    const amount = amountOn(days, date);
    sum.amount += amount;
    sum.activeDays += amount > 0 ? 1 : 0;
    if (dueOn(days, date)) {
      sum.due += 1;
      sum.done += days.counted[daysBetween(days.first, date)] ? 1 : 0;
    }
  }
  return sum;
}

/** The same date `months` months before `date` («ГГГГ-ММ-ДД»); a month without that date —
 *  its last day (31 Mar, a month back — 28 Feb). */
export function monthsBefore(date: string, months: number): string {
  const index = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 - months;
  const month = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  const last = daysInMonth(`${month}-01`);
  return `${month}-${String(Math.min(Number(date.slice(8, 10)), last)).padStart(2, "0")}`;
}

/** The first day of the `months` months that end on `day`: the day after «`months` months
 *  ago» (monthsBefore). 5 Nov — 6 Oct; 31 Oct — 1 Oct (no 31 Sep: a month ago is 30 Sep). */
export function periodStart(day: string, months: number): string {
  return addDays(monthsBefore(day, months), 1);
}

/** This month so far and the same days of the last one: the 1st to `day`'s date (a shorter
 *  last month — all its days). No last month — the habit began after its 1st. */
export function monthTotals(habit: Habit, day: string): { current: Totals; previous: Totals | null } {
  const days = daysOf(habit, day);
  const from = `${day.slice(0, 8)}01`;
  const elapsed = daysBetween(from, day) + 1;
  const previousFrom = `${addDays(from, -1).slice(0, 8)}01`;
  const previousTo = addDays(previousFrom, Math.min(elapsed, daysInMonth(previousFrom)) - 1);
  const began = days.start !== null && days.start <= previousFrom && days.first <= previousFrom;
  return {
    current: totals(days, from, day),
    previous: began ? totals(days, previousFrom, previousTo) : null,
  };
}

/** All the known days. */
export function allTotals(habit: Habit, day: string): Totals {
  const days = daysOf(habit, day);
  return totals(days, days.first, day);
}

/** The day that brought the most (time, times) or null — none brought anything. */
export function bestDay(habit: Habit, day: string): { amount: number; date: string } | null {
  const days = daysOf(habit, day);
  let best: { amount: number; date: string } | null = null;
  for (let date = days.first; date <= day; date = addDays(date, 1)) {
    if (!known(days, date)) {
      continue;
    }
    const amount = amountOn(days, date);
    if (amount > 0 && (best === null || amount > best.amount)) {
      best = { amount, date };
    }
  }
  return best;
}

/** How many days the habit has been going (from its first day to `day`), 0 — not begun. */
export function daysGoing(habit: Habit, day: string): number {
  const start = startOf(habit, day);
  return start === null ? 0 : daysBetween(start, day) + 1;
}

/**
 * The habit's score — what the line chart («Динамика») draws: it grows while the habit is
 * kept and falls when it is not, so a habit done every day is a rising line, not a flat
 * 100%. From 0 on the habit's first day (or the history's), never below 0, day by day
 * (the marking day too: −1 until it is done, so its piece of the line points down):
 *  - a due day: +1 done, −1 not; time and times — by the share of the goal s, with no cap:
 *    below the goal 2s − 1 (nothing −1, a quarter −0.5, half 0, three quarters +0.5), from
 *    the goal on s itself (the goal +1, twice the goal +2, two and a half times +2.5);
 *  - a day off schedule: + the share done (a bonus mark, no cap either), frozen — 0;
 *  - flexible: +1 a mark, and when a period ends −1 for each mark short of its goal (a
 *    period begun before the habit is not held against it).
 * Null — before the habit's first day.
 */
function scores(days: Days): (number | null)[] {
  const { habit, day, kind } = days;
  const result: (number | null)[] = Array(habit.history.length).fill(null);
  if (days.start === null) {
    return result;
  }
  const period = flexiblePeriod(habit);
  let score = 0;
  let marks = 0;
  const from = days.start > days.first ? days.start : days.first;
  for (let date = from; date <= day; date = addDays(date, 1)) {
    const index = daysBetween(days.first, date);
    const amount = amountOn(days, date);
    if (period !== null) {
      const [start, end] = periodBounds(period, date);
      marks = date === start ? amount : marks + amount;
      score += amount;
      if (date === end && date < day && start >= days.start) {
        score -= Math.max(0, (periodGoal(habit, date) ?? 0) - marks);
      }
    } else if (!habit.frozen_history[index]) {
      const goal = kind === "time" || kind === "times" ? goalOn(habit, date).goal : 1;
      const done = amount / Math.max(1, goal);
      const share = habit.history[index] ? Math.max(1, done) : done;
      if (isDueOnDay(habit, date)) {
        score += share >= 1 ? share : 2 * share - 1;
      } else {
        score += share;
      }
    }
    score = Math.max(0, score);
    result[index] = Math.round(score * 100) / 100;
  }
  return result;
}

/**
 * The line chart: the score (scores) on each day of the month (quarter: three months) that
 * ends on `day` (periodStart; 5 Nov: from 6 Oct), or at the end of each of the last
 * 52 weeks (year), the last point — `day`. Points before the habit's first day are cut off,
 * but at least MIN_TREND_POINTS stay (null).
 */
export interface Trend {
  values: (number | null)[];
  dates: string[];
}

const MIN_TREND_POINTS = 4;

export function trend(habit: Habit, day: string, range: StatsRange): Trend {
  const days = daysOf(habit, day);
  const byDay = scores(days);
  const points =
    range === "year" ? 52 : daysBetween(periodStart(day, range === "month" ? 1 : 3), day) + 1;
  const step = range === "year" ? 7 : 1;
  const dates = Array.from({ length: points }, (_, index) => addDays(day, (index + 1 - points) * step));
  const values = dates.map((date) => byDay[daysBetween(days.first, date)] ?? null);
  const firstKnown = values.findIndex((value) => value !== null);
  const from = Math.min(firstKnown < 0 ? 0 : firstKnown, points - MIN_TREND_POINTS);
  return { values: values.slice(from), dates: dates.slice(from) };
}

/** Each weekday (Monday first): completion (%) — counted days of the due ones; flexible —
 *  the share of all marks made on it. Null — no due day (no mark) on that weekday. */
export function weekdayRates(habit: Habit, day: string): (number | null)[] {
  const days = daysOf(habit, day);
  const done = Array<number>(7).fill(0);
  const due = Array<number>(7).fill(0);
  for (let date = days.first; date <= day; date = addDays(date, 1)) {
    if (!known(days, date)) {
      continue;
    }
    const weekday = weekdayIndex(date);
    if (days.kind === "flexible") {
      done[weekday] += amountOn(days, date);
    } else if (dueOn(days, date)) {
      due[weekday] += 1;
      done[weekday] += days.counted[daysBetween(days.first, date)] ? 1 : 0;
    }
  }
  if (days.kind === "flexible") {
    const marks = done.reduce((sum, count) => sum + count, 0);
    return done.map((count) => (marks > 0 ? Math.round((count / marks) * 100) : null));
  }
  return done.map((count, weekday) =>
    due[weekday] > 0 ? Math.round((count / due[weekday]) * 100) : null,
  );
}

/** The pie: the habit's days by what they were (as in the calendar). Days off schedule
 *  only when marked; the marking day only once done or frozen — it is not over yet. */
export interface DayBreakdown {
  done: number;
  partial: number;
  missed: number;
  frozen: number;
}

export function dayBreakdown(habit: Habit, day: string): DayBreakdown {
  const days = daysOf(habit, day);
  const breakdown: DayBreakdown = { done: 0, partial: 0, missed: 0, frozen: 0 };
  for (let date = days.first; date <= day; date = addDays(date, 1)) {
    if (!known(days, date)) {
      continue;
    }
    const state = stateOf(habit, date, day, days.start);
    if (date === day && state !== "done" && state !== "frozen") {
      continue;
    }
    if (state === "done" || state === "partial" || state === "missed" || state === "frozen") {
      breakdown[state] += 1;
    }
  }
  return breakdown;
}
