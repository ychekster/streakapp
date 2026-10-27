/**
 * What the screen shows = the server's last answer (snapshot) + the changes made on the
 * device since (operations not yet confirmed by the server), counted for the current
 * marking day. Pure functions: the store (store.ts) calls them after every change.
 *
 * Computed here exactly as the server computes it (backend/services.py, schedule.py):
 * the marking day, whether a habit is due, history, frozen days, streaks, totals. When the server
 * answers, its numbers replace these — normally they are the same.
 */

import {
  FOLDER_HABIT_TYPES,
  HISTORY_DAYS,
  MAX_DAY_SECONDS,
  OVERTIME_MAX_COUNT,
  WEEKDAYS,
} from "../constants";
import type { Folder, FolderHabitType, FolderKind } from "../types/folder";
import type {
  FrequencyType,
  GoalUnit,
  Habit,
  HabitGroup,
  HabitInput,
  Period,
  SchedulePeriod,
} from "../types/habit";
import type { Settings } from "../types/settings";
import type { FolderKey, RunningTimer, SyncOperation, TaskKey } from "../types/sync";
import { addDays, clockIn, daysBetween, daysInMonth, markingDay, weekdayIndex } from "./dates";

/** A change made on the device, as sent to the server (types/sync.ts); a settings
 *  change also carries what only the device needs. */
export type Operation =
  | Exclude<SyncOperation, { type: "settings" }>
  | (Extract<SyncOperation, { type: "settings" }> & {
      /** How the change looks before the server answers (time zone label). */
      preview?: Partial<Settings>;
      /** Not the user's change — a refusal is not shown. */
      silent?: boolean;
    });

/** The server's answer the device keeps (POST /sync). */
export interface Snapshot {
  habits: Habit[];
  settings: Settings;
  /** Not in snapshots kept before folders: none. */
  folders?: Folder[];
  all_habits_position?: number;
  /** Marking day of the answer: the last day of every habit's history. */
  today: string;
  /** The running timer; not in snapshots kept before timers: none. */
  timer?: RunningTimer | null;
}

/** Habit name as the server stores it (validation.validate_name): control characters
 *  become spaces, runs of spaces collapse. */
export function cleanHabitName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").split(/\s+/).filter(Boolean).join(" ");
}

interface Schedule {
  frequency_type: FrequencyType;
  days: string[];
  start_date: string | null;
  period?: Period | null;
  period_times?: number | null;
}

/** Does the frequency start from a chosen day (every other day, monthly). */
export function usesStartDate(frequency: FrequencyType): boolean {
  return frequency === "every_other_day" || frequency === "monthly";
}

/** First and last day of the calendar period `period` that `day` falls in
 *  (schedule.period_bounds): a week from Monday, a month from the 1st, a year from 1 January. */
export function periodBounds(period: Period, day: string): [string, string] {
  if (period === "week") {
    const start = addDays(day, -weekdayIndex(day));
    return [start, addDays(start, 6)];
  }
  if (period === "month") {
    const start = `${day.slice(0, 8)}01`;
    return [start, addDays(start, daysInMonth(day) - 1)];
  }
  return [`${day.slice(0, 4)}-01-01`, `${day.slice(0, 4)}-12-31`];
}

/** Days to do in the period from `start` to `end`: the goal, but no more than its days
 *  (schedule.period_quota — «31 раз в месяц» in February is 28). */
export function periodQuota(times: number, start: string, end: string): number {
  return Math.min(times, daysBetween(start, end) + 1);
}

/** A year goal of «Гибкий график» as the habit screen shows it (yearStats). */
export interface YearStats {
  done: number;
  quota: number;
  /** How many times a week to do it to reach the goal by 31 December (in the last, short
   *  week — what is left), or out of reach. */
  need: { per: "week"; times: number } | { per: "late" };
  /** Done days this week (this year's part of it). */
  thisWeek: number;
  /** When the goal is reached: the day it was (null — before the history), the day at the
   *  current pace, or how many by the year's end; none — nothing done yet. */
  forecast:
    | { kind: "reached"; date: string | null }
    | { kind: "date"; date: string }
    | { kind: "total"; total: number }
    | { kind: "none" };
}

/**
 * «Гибкий график» on a year: progress, how often to do it to make it, this week and a
 * forecast. The pace is this year's done days over the days they were done in: from
 * 1 January, or from the habit's creation if later — a changed goal does not restart it
 * (the year's days count whatever the goal was). At most a day a day, so a forecast date
 * is never sooner than the goal can be reached. `day` — the marking day (the history's
 * last day).
 */
export function yearStats(habit: Habit, day: string): YearStats {
  const [start, end] = periodBounds("year", day);
  const quota = periodQuota(habit.period_times ?? 1, start, end);
  const done = habit.period_done ?? 0;
  const remaining = Math.max(0, quota - done);
  // Bonus marks (past the goal, frozen days) aside.
  const counted = countedHistory(habit, day);
  const doneOn = (date: string): boolean => {
    const index = habit.history.length - 1 - daysBetween(date, day);
    return index >= 0 && index < counted.length && counted[index];
  };

  const left = daysBetween(day, end) + (habit.done_today ? 0 : 1);
  let need: YearStats["need"];
  if (remaining > left) {
    need = { per: "late" };
  } else if (left < 7) {
    need = { per: "week", times: remaining };
  } else {
    need = { per: "week", times: Math.ceil((remaining * 7) / left) };
  }

  const [monday] = periodBounds("week", day);
  let thisWeek = 0;
  for (let date = monday > start ? monday : start; date <= day; date = addDays(date, 1)) {
    thisWeek += Number(doneOn(date));
  }

  let forecast: YearStats["forecast"];
  if (remaining === 0) {
    // No marks after the goal is reached: its last done day is the day it was.
    let reached: string | null = null;
    for (let date = day; date >= start && reached === null; date = addDays(date, -1)) {
      if (daysBetween(date, day) >= habit.history.length) {
        break;
      }
      reached = doneOn(date) ? date : null;
    }
    forecast = { kind: "reached", date: reached };
  } else if (done === 0) {
    forecast = { kind: "none" };
  } else {
    const created = habit.created_on ?? start;
    const from = created > start ? created : start;
    const rate = Math.min(1, done / (daysBetween(from, day) + 1));
    const finish = addDays(day, Math.ceil(remaining / rate));
    forecast =
      finish <= end
        ? { kind: "date", date: finish }
        : { kind: "total", total: Math.floor(done + rate * daysBetween(day, end)) };
  }
  return { done, quota, need, thisWeek, forecast };
}

/** «Гибкий график»: the goal of the period `day` falls in; null — another frequency. */
export function periodGoal(habit: Schedule, day: string): number | null {
  const period = flexiblePeriod(habit);
  if (period === null) {
    return null;
  }
  const [start, end] = periodBounds(period, day);
  return periodQuota(habit.period_times ?? 1, start, end);
}

/** «Гибкий график»'s period, or null for the other frequencies. */
export function flexiblePeriod(habit: Schedule): Period | null {
  return habit.frequency_type === "flexible" ? (habit.period ?? "week") : null;
}

/** Is the habit due on `day` (schedule.is_due_on). «Гибкий график» has no due days: it can
 *  be marked while its period's goal is open, and a day without a mark breaks nothing. */
export function isDueOn(habit: Schedule, day: string): boolean {
  if (habit.frequency_type === "flexible") {
    return false;
  }
  if (habit.frequency_type === "every_other_day") {
    if (habit.start_date === null) {
      return false;
    }
    const offset = daysBetween(habit.start_date, day);
    return offset >= 0 && offset % 2 === 0;
  }
  if (habit.frequency_type === "monthly") {
    if (habit.start_date === null || day < habit.start_date) {
      return false;
    }
    // The start's day of the month, or the month's last day if it is shorter.
    const startDay = Number(habit.start_date.slice(8, 10));
    return Number(day.slice(8, 10)) === Math.min(startDay, daysInMonth(day));
  }
  if (habit.frequency_type === "daily") {
    return true;
  }
  return habit.days.includes(WEEKDAYS[weekdayIndex(day)]);
}

/** A schedule with its past ones: days before a change are judged by the schedule then
 *  in force (models.TaskSchedulePeriod). */
export type ScheduleWithHistory = Schedule & {
  times_per_day: number;
  overtime?: boolean;
  schedule_history?: readonly SchedulePeriod[];
  /** A shared habit: from this day the day is not over for someone (time zones). */
  open_from?: string | null;
};

/** Is the habit a group one («Групповая привычка» on, or joined by a link). */
export function isShared(habit: { group?: HabitGroup | null }): habit is { group: HabitGroup } {
  return habit.group != null;
}

/** A shared habit created on the device, before the server answers: me alone in it. */
function localGroup(): HabitGroup {
  return {
    id: 0,
    is_owner: true,
    notify_marks: false,
    members: [
      { user_id: 0, name: "", is_me: true, is_owner: true, done: false, count: 0, frozen: false },
    ],
    banned: [],
    others_history: [],
    others_next_day: true,
    open_from: null,
  };
}

/** How much of each history day a shared habit's group did (0…1), as the grid and the
 *  calendar shade it; null — not shared. */
export function groupFill(habit: Habit): number[] | null {
  return isShared(habit) ? (habit.group.fill_history ?? null) : null;
}

/** The schedule in force on a day: a past one or the current
 *  (schedule.due_check_with_history). */
export function scheduleOn(
  habit: ScheduleWithHistory,
): (day: string) => Schedule & { times_per_day: number; overtime?: boolean; goal_unit?: GoalUnit } {
  const periods = habit.schedule_history ?? [];
  return (day) => periods.find((period) => day < period.until) ?? habit;
}

/** The goal (times a day, or seconds — «Цель по времени»), its unit and «Сверх плана» in
 *  force on a day: a past schedule's or the current (services.goal_on, unit_on). A past day
 *  is marked and judged by them. */
export function goalOn(
  habit: ScheduleWithHistory,
  day: string,
): { goal: number; overtime: boolean; unit: GoalUnit } {
  const schedule = scheduleOn(habit)(day);
  return {
    goal: schedule.times_per_day,
    overtime: (schedule.overtime ?? false) && schedule.times_per_day > 1,
    unit: schedule.goal_unit ?? "times",
  };
}

/** The most a day can count with «Сверх плана»: times — OVERTIME_MAX_COUNT, time — a day
 *  (services: MAX_DAY_SECONDS, 23:59:59). */
export function dayMost({ goal, overtime, unit }: ReturnType<typeof goalOn>): number {
  if (!overtime) {
    return goal;
  }
  return unit === "seconds" ? MAX_DAY_SECONDS : OVERTIME_MAX_COUNT;
}

/** Is the habit's goal in time («Цель по времени»): a timer instead of a check. */
export function isTimed(habit: { goal_unit?: GoalUnit }): boolean {
  return habit.goal_unit === "seconds";
}

/** The running timer (the server's, as changed on the device): which habit (the id on
 *  screen), the day its time goes to and since when (ms). */
export interface TimerView {
  habitId: number;
  date: string;
  startedAt: number;
}

/** The timer as the screens show it: the last timer operation, else the server's. */
export function deriveTimer(
  snapshot: Snapshot,
  ops: readonly Operation[],
  displayId: (key: TaskKey) => number,
): TimerView | null {
  let timer: { task: TaskKey | null; date?: string; started_at?: string } | null =
    snapshot.timer ?? null;
  for (const op of ops) {
    if (op.type === "timer") {
      timer = op;
    }
  }
  if (!timer || timer.task === null || !timer.date || !timer.started_at) {
    return null;
  }
  const startedAt = Date.parse(timer.started_at);
  if (Number.isNaN(startedAt)) {
    return null;
  }
  return { habitId: displayId(timer.task), date: timer.date, startedAt };
}

/** Are counts kept by day (`history_counts`): done several times a day now or under a
 *  past schedule (services.counts_by_day). */
export function countsByDay(habit: ScheduleWithHistory): boolean {
  return (
    habit.times_per_day > 1 || (habit.schedule_history ?? []).some((period) => period.times_per_day > 1)
  );
}

/** Each history day's goal (old → `day`, the marking day) — the grid shades a partial day
 *  by its own goal; null when the goal never changed (then it is `times_per_day`). */
export function historyGoals(habit: Habit, day: string): number[] | null {
  const periods = habit.schedule_history ?? [];
  if (periods.every((period) => period.times_per_day === habit.times_per_day)) {
    return null;
  }
  const on = scheduleOn(habit);
  const start = addDays(day, 1 - habit.history.length);
  return habit.history.map((_, index) => on(addDays(start, index)).times_per_day);
}

/** My mark on `date` (the day window in the calendar): done and how many times; `day` —
 *  the marking day (the history's last). In a shared habit — my part (`history_counts`),
 *  not the group's day. The day after the marking day is not mine to mark — none. */
export function myDay(
  habit: Habit,
  date: string,
  day: string,
): { done: boolean; count: number } {
  if (date === day) {
    return { done: habit.done_today, count: habit.today_count };
  }
  const index = habit.history.length - 1 - daysBetween(date, day);
  if (date > day || index < 0) {
    return { done: false, count: 0 };
  }
  const counts = habit.history_counts ?? [];
  // By the goal of that day: a past day is judged by its own settings.
  const { goal } = goalOn(habit, date);
  if (isShared(habit) || goal > 1) {
    const count = counts[index] ?? 0;
    return { done: count >= goal, count };
  }
  const done = habit.history[index] ?? false;
  return { done, count: Number(done) };
}

/** Was the habit due on `day` by the schedule in force on that day. */
export function isDueOnDay(habit: ScheduleWithHistory, day: string): boolean {
  return isDueOn(scheduleOn(habit)(day), day);
}

/**
 * Done days from `from` to `to` that count in the numbers (services.counted_days): due by
 * the schedule in force that day and not frozen; for «Гибкий график» — the first days of
 * a period, up to its goal (a period begun before `from` — from its days since). The
 * other marks are bonus ones: in the grid and the calendar, not in the numbers.
 */
export function countedDays(
  schedule: ScheduleWithHistory,
  from: string,
  to: string,
  doneOn: (day: string) => boolean,
  frozenOn: (day: string) => boolean,
): Set<string> {
  const on = scheduleOn(schedule);
  const taken = new Map<string, number>();
  const counted = new Set<string>();
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!doneOn(day) || frozenOn(day)) {
      continue;
    }
    const current = on(day);
    const period = flexiblePeriod(current);
    if (period !== null) {
      const [start, end] = periodBounds(period, day);
      const key = `${period}:${start}`;
      const used = taken.get(key) ?? 0;
      if (used < periodQuota(current.period_times ?? 1, start, end)) {
        taken.set(key, used + 1);
        counted.add(day);
      }
    } else if (isDueOn(current, day)) {
      counted.add(day);
    }
  }
  return counted;
}

/** Which days of a habit's `history` count in the numbers (countedDays); `lastDay` — the
 *  history's last day. */
export function countedHistory(
  habit: ScheduleWithHistory & { history: readonly boolean[]; frozen_history: readonly boolean[] },
  lastDay: string,
): boolean[] {
  const first = addDays(lastDay, 1 - habit.history.length);
  const counted = countedDays(
    habit,
    first,
    lastDay,
    (day) => habit.history[daysBetween(first, day)] ?? false,
    (day) => habit.frozen_history[daysBetween(first, day)] ?? false,
  );
  return habit.history.map((_, index) => counted.has(addDays(first, index)));
}

/** Does a form change the schedule (repeat, days, first day, times a day or «Сверх плана») —
 *  services._schedule_changed. */
function scheduleChanged(
  before: Schedule & { times_per_day: number; overtime?: boolean; goal_unit?: GoalUnit },
  after: Schedule & { times_per_day: number; overtime?: boolean; goal_unit?: GoalUnit },
): boolean {
  return (
    before.frequency_type !== after.frequency_type ||
    (before.goal_unit ?? "times") !== (after.goal_unit ?? "times") ||
    before.days.join(",") !== after.days.join(",") ||
    before.start_date !== after.start_date ||
    before.times_per_day !== after.times_per_day ||
    (before.overtime === true && before.times_per_day > 1) !==
      (after.overtime === true && after.times_per_day > 1) ||
    (before.period ?? null) !== (after.period ?? null) ||
    (before.period_times ?? null) !== (after.period_times ?? null)
  );
}

/** Settings with the operation's change applied. */
export function applySettings(settings: Settings, op: Extract<Operation, { type: "settings" }>): Settings {
  const { patch } = op;
  const next: Settings = { ...settings };
  if (patch.timezone !== undefined) {
    next.timezone = patch.timezone;
    next.timezone_city = null;
  }
  if (patch.language !== undefined) {
    next.language = patch.language;
  }
  if (patch.theme !== undefined) {
    next.theme = patch.theme;
  }
  if (patch.mark_yesterday !== undefined) {
    next.mark_yesterday = patch.mark_yesterday;
  }
  if (patch.grid_layout !== undefined) {
    next.grid_layout = patch.grid_layout;
  }
  if (patch.telegram_notifications !== undefined) {
    next.telegram_notifications = patch.telegram_notifications;
  }
  if (patch.folder_swipe !== undefined) {
    next.folder_swipe = patch.folder_swipe;
  }
  if (patch.checkin_reminder !== undefined) {
    next.checkin_reminder_time = patch.checkin_reminder.time;
    next.checkin_reminder_days = patch.checkin_reminder.days;
  }
  return { ...next, ...op.preview };
}

/** All reminders of a habit or form input; kept from before several reminders existed —
 *  the one `reminder_time`. */
export function reminderTimesOf(habit: {
  reminder_time: string | null;
  reminder_times?: string[];
}): string[] {
  return habit.reminder_times ?? (habit.reminder_time === null ? [] : [habit.reminder_time]);
}

/** Form fields of a habit as the server stores them; `before` — the habit's fields
 *  before this change (a change without a description keeps it, as the server). */
function habitFields(
  input: HabitInput | Habit,
  before?: { description?: string | null } | null,
): Pick<
  Habit,
  | "name"
  | "description"
  | "frequency_type"
  | "days"
  | "start_date"
  | "period"
  | "period_times"
  | "reminder_time"
  | "reminder_times"
  | "color"
  | "times_per_day"
  | "goal_unit"
  | "auto_mark"
  | "overtime"
> {
  // Kept on the device before "several times a day" existed: once.
  const timesPerDay = input.times_per_day ?? 1;
  const goalUnit: GoalUnit = input.goal_unit ?? "times";
  const flexible = input.frequency_type === "flexible";
  // As the server (validate_reminder_times): in order, without repeats.
  const reminders = [...new Set(reminderTimesOf(input))].sort();
  return {
    name: cleanHabitName(input.name),
    // As the server (validate_description): cleaned like the name, empty — none.
    description:
      input.description == null
        ? (before?.description ?? null)
        : cleanHabitName(input.description) || null,
    frequency_type: input.frequency_type,
    days:
      input.frequency_type === "specific_days"
        ? WEEKDAYS.filter((code) => input.days.includes(code))
        : [],
    start_date: usesStartDate(input.frequency_type) ? input.start_date : null,
    period: flexible ? (input.period ?? "week") : null,
    period_times: flexible ? (input.period_times ?? 1) : null,
    reminder_time: reminders[0] ?? null,
    reminder_times: reminders,
    color: input.color,
    times_per_day: timesPerDay,
    goal_unit: goalUnit,
    // As the server: auto check-off only for once-a-day habits.
    auto_mark: (input.auto_mark ?? false) && timesPerDay === 1 && goalUnit === "times",
    // «Сверх плана» only for habits done several times a day.
    overtime: (input.overtime ?? false) && timesPerDay > 1,
  };
}

/** Does an undone day at `index` of `history` break a run (compute_streaks): a due day
 *  before the marking day that was not frozen. */
function breaksRun(
  history: boolean[],
  frozen: readonly boolean[],
  index: number,
  lastDay: string,
  schedule: ScheduleWithHistory,
): boolean {
  const day = addDays(lastDay, index - history.length + 1);
  // Not over yet: the marking day, and for a shared habit — days not over for someone.
  const open = schedule.open_from && schedule.open_from < lastDay ? schedule.open_from : lastDay;
  return day < open && !frozen[index] && isDueOnDay(schedule, day);
}

/** Run of done days ending on the last day of `history` (compute_streaks): an undone
 *  marking day does not break it (the day is not over), an undone due day before it
 *  does, unless frozen. A bonus mark (done, not `counted`) neither adds nor breaks.
 *  `exhausted` — the run goes on past the start of the history. */
function currentRun(
  history: boolean[],
  counted: readonly boolean[],
  frozen: readonly boolean[],
  lastDay: string,
  schedule: ScheduleWithHistory,
): { count: number; exhausted: boolean } {
  let count = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (counted[index]) {
      count += 1;
    } else if (!history[index] && breaksRun(history, frozen, index, lastDay, schedule)) {
      return { count, exhausted: false };
    }
  }
  return { count, exhausted: true };
}

/** Longest run inside `history` (days before it unknown). */
function bestRun(
  history: boolean[],
  counted: readonly boolean[],
  frozen: readonly boolean[],
  lastDay: string,
  schedule: ScheduleWithHistory,
): number {
  let best = 0;
  let current = 0;
  history.forEach((done, index) => {
    if (counted[index]) {
      current += 1;
      best = Math.max(best, current);
    } else if (!done && breaksRun(history, frozen, index, lastDay, schedule)) {
      current = 0;
    }
  });
  return best;
}

/** Freezes of a habit as changed on the device: the current one (`since`), the ones
 *  ended on the device (`ended`: first day, unfreeze day) and the day from which the
 *  server's current freeze no longer counts (`cut` — it was ended here). */
interface Freezes {
  since: string | null;
  ended: [string, string][];
  cut: string | null;
}

function serverFreezes(base: Habit | null): Freezes {
  return { since: base?.frozen_since ?? null, ended: [], cut: null };
}

/** A freeze operation on the device's freezes (as services._apply_sync_op). */
function applyFreeze(
  freezes: Freezes,
  op: Extract<Operation, { type: "freeze" }>,
  base: Habit | null,
): void {
  if (op.frozen) {
    freezes.since ??= op.date;
    return;
  }
  const { since } = freezes;
  if (since === null) {
    return;
  }
  // As Repository.unfreeze_task: the unfreeze day is an ordinary day.
  const end = op.date > since ? op.date : since;
  if (end > since) {
    freezes.ended.push([since, end]);
  }
  if (freezes.cut === null && since === base?.frozen_since) {
    freezes.cut = end;
  }
  freezes.since = null;
}

/** A habit being assembled: the server's version (none for one created on the device),
 *  its current form fields and the days marked on the device. */
interface Draft {
  key: TaskKey;
  base: Habit | null;
  fields: ReturnType<typeof habitFields> | null;
  marks: Map<string, boolean>;
  /** Times done on a day marked on the device (a mark without `count` — 0, as the server). */
  counts: Map<string, number>;
  /** Notes to days written on the device («» — removed). */
  notes: Map<string, string>;
  /** Freezes changed on the device; null — as on the server. */
  freezes: Freezes | null;
  /** Moved to the archive or out of it on the device; none — as on the server. */
  archived?: boolean;
  /** Past schedules after a change on the device; none — as on the server. */
  periods?: SchedulePeriod[];
  /** Calendar day whose unchecked record auto check-off turned on here has forgotten
   *  (services.update_habit) — applyAutoMark may mark it again. */
  autoMarkFresh?: string;
  /** «Групповая привычка» switched on the device: true — on (the server may have no group
   *  for it yet), false — off; none — as on the server. */
  shared?: boolean;
}

/** Is the habit frozen on a day — the server's freezes as changed on the device. */
function frozenCheck(draft: Draft, snapshotToday: string): (day: string) => boolean {
  const baseFrozenHistory: boolean[] = draft.base?.frozen_history ?? [];
  const freezes = draft.freezes ?? serverFreezes(draft.base);
  return (day) => {
    const index = baseFrozenHistory.length - 1 - daysBetween(day, snapshotToday);
    const baseFrozen = index >= 0 && index < baseFrozenHistory.length && baseFrozenHistory[index];
    return (
      (baseFrozen && (freezes.cut === null || day < freezes.cut)) ||
      freezes.ended.some(([start, end]) => start <= day && day < end) ||
      (freezes.since !== null && freezes.since <= day)
    );
  };
}

/** Was a day done by the server's answer: its history, and the day after it (the calendar
 *  day in «Отмечать за вчера»). */
function serverDone(base: Habit | null, snapshotToday: string): (day: string) => boolean {
  const nextDay = addDays(snapshotToday, 1);
  return (day) => {
    if (!base) {
      return false;
    }
    if (day === nextDay) {
      return base.next_day_done ?? false;
    }
    const index = base.history.length - 1 - daysBetween(day, snapshotToday);
    return index >= 0 && index < base.history.length ? base.history[index] : false;
  };
}

/** Is a day done — marked on the device, or by the server's answer. For «Гибкий график»
 *  the history has my days, also in a shared habit. */
function draftDone(draft: Draft, snapshotToday: string): (day: string) => boolean {
  const baseDone = serverDone(draft.base, snapshotToday);
  return (day) => draft.marks.get(day) ?? baseDone(day);
}

/**
 * «Гибкий график»: done days in the period from `start` to `end`, up to `until`, frozen
 * ones aside — past the goal too (the numbers cap it). Days of the period before the
 * history (a year reaches past it) are known only from the server's count: what it has
 * beyond the history's days.
 */
function periodDoneIn(
  draft: Draft,
  period: Period,
  start: string,
  end: string,
  until: string,
  snapshotToday: string,
): number {
  const done = draftDone(draft, snapshotToday);
  const frozenOn = frozenCheck(draft, snapshotToday);
  const last = until < end ? until : end;
  const { base } = draft;
  const historyStart = addDays(snapshotToday, 1 - HISTORY_DAYS);
  let count = 0;
  if (
    base !== null &&
    flexiblePeriod(base) === period &&
    start < historyStart &&
    snapshotToday <= end
  ) {
    const baseDone = serverDone(base, snapshotToday);
    let inHistory = 0;
    for (let day = historyStart; day <= snapshotToday; day = addDays(day, 1)) {
      inHistory += Number(baseDone(day) && !frozenOn(day));
    }
    count = Math.max(0, (base.period_done ?? 0) - inHistory);
  }
  for (let day = start; day <= last; day = addDays(day, 1)) {
    count += Number(done(day) && !frozenOn(day));
  }
  return count;
}

/** «Гибкий график»: is the goal of `day`'s period still open without `day` itself — the
 *  habit can be marked that day (services._quota_open). */
function quotaOpen(
  draft: Draft,
  fields: Schedule & { period_times?: number | null },
  day: string,
  snapshotToday: string,
): boolean {
  const period = flexiblePeriod(fields) ?? "week";
  const [start, end] = periodBounds(period, day);
  const done = periodDoneIn(draft, period, start, end, end, snapshotToday);
  const own = draftDone(draft, snapshotToday)(day) && !frozenCheck(draft, snapshotToday)(day);
  return done - Number(own) < periodQuota(fields.period_times ?? 1, start, end);
}

/** Is a day one to auto check-off: due by the schedule, for «Гибкий график» — while its
 *  period's goal is open (services._auto_mark_day). */
function autoMarkDue(
  draft: Draft,
  fields: ReturnType<typeof habitFields>,
  day: string,
  snapshotToday: string,
): boolean {
  return fields.frequency_type === "flexible"
    ? quotaOpen(draft, fields, day, snapshotToday)
    : isDueOn(fields, day);
}

/** Last reminder «HH:MM» of a habit's fields, null — without reminders. */
function lastReminder(fields: ReturnType<typeof habitFields>): string | null {
  return fields.reminder_times.length > 0
    ? fields.reminder_times[fields.reminder_times.length - 1]
    : null;
}

/**
 * Auto check-off as the bot does it (services.auto_mark_due), shown on the device at once
 * — when the app opens, without waiting for the server, and offline: a once-a-day habit
 * with «Автоотметка», due and not frozen, is done on its calendar day from the start of
 * the day, or once its last reminder has come. Only days the server has no record for:
 * the days after the answer's calendar day, and that day itself if the answer says so
 * (`auto_mark_ahead`) — a check-off the user removed stays removed. A day marked on the
 * device is left as marked. The bot still writes the real record.
 */
function applyAutoMark(
  draft: Draft,
  snapshotToday: string,
  snapshotCalendarDay: string,
  calendarToday: string,
  clock: string,
): void {
  const fields = draft.fields ?? (draft.base ? habitFields(draft.base) : null);
  if (!fields || !fields.auto_mark || fields.times_per_day !== 1) {
    return;
  }
  const frozenOn = frozenCheck(draft, snapshotToday);
  const last = lastReminder(fields);
  let day = draft.base ? snapshotCalendarDay : calendarToday;
  // Not further back than the history: a long-kept answer only needs the recent days.
  if (daysBetween(day, calendarToday) >= HISTORY_DAYS) {
    day = addDays(calendarToday, 1 - HISTORY_DAYS);
  }
  for (; day <= calendarToday; day = addDays(day, 1)) {
    const known =
      day === snapshotCalendarDay &&
      day !== draft.autoMarkFresh &&
      draft.base &&
      !(draft.base.auto_mark_ahead ?? false);
    if (
      known ||
      draft.marks.has(day) ||
      frozenOn(day) ||
      !autoMarkDue(draft, fields, day, snapshotToday) ||
      (day === calendarToday && last !== null && clock < last)
    ) {
      continue;
    }
    draft.marks.set(day, true);
  }
}

/**
 * «Гибкий график»: the current period's count and goal, and the streaks in periods
 * (services.flexible_streaks). Ended periods are the server's (`prior_streak`,
 * `prior_best`); the device adds the current one once its goal is reached — in a shared
 * habit, when the others have reached theirs too (`others_reached`). Periods that ended
 * after the server's answer are counted here by their days (others unknown — not reached).
 * Days past the goal are bonus ones: `periodDone` stops at it; `open` — the goal is open
 * without the marking day itself (the habit is «on today»).
 */
function flexibleState(
  draft: Draft,
  fields: ReturnType<typeof habitFields>,
  period: Period,
  today: string,
  snapshotToday: string,
  group: HabitGroup | null,
): {
  periodDone: number;
  quota: number;
  open: boolean;
  current: number;
  best: number;
  prior: number;
  priorBest: number;
} {
  const times = fields.period_times ?? 1;
  const [start, end] = periodBounds(period, today);
  const quota = periodQuota(times, start, end);
  const done = periodDoneIn(draft, period, start, end, today, snapshotToday);
  const doneToday = draftDone(draft, snapshotToday)(today) && !frozenCheck(draft, snapshotToday)(today);
  const alone = !group || group.members.length <= 1;
  const { base } = draft;
  const [serverStart] = periodBounds(period, snapshotToday);
  const known = base !== null && flexiblePeriod(base) === period;
  let prior = known ? (base.prior_streak ?? 0) : 0;
  let priorBest = known ? (base.prior_best ?? 0) : 0;
  if (known) {
    for (let day = serverStart; day < start; ) {
      const [from, to] = periodBounds(period, day);
      const reached =
        periodDoneIn(draft, period, from, to, to, snapshotToday) >= periodQuota(times, from, to) &&
        (alone || (from === serverStart && (group?.others_reached ?? true)));
      prior = reached ? prior + 1 : 0;
      priorBest = Math.max(priorBest, prior);
      day = addDays(to, 1);
    }
  }
  const othersReached = alone || (known && serverStart === start && (group?.others_reached ?? true));
  const current = prior + Number(done >= quota && othersReached);
  return {
    periodDone: Math.min(done, quota),
    quota,
    open: done - Number(doneToday) < quota,
    current,
    best: Math.max(priorBest, current),
    prior,
    priorBest,
  };
}

/** The habit for `today` (the marking day) from its draft; `snapshotToday` — the day the
 *  server's version was counted for; `calendarToday` — the day a habit created on the
 *  device was created (as the server: the calendar day). */
function buildHabit(
  draft: Draft,
  id: number,
  today: string,
  snapshotToday: string,
  calendarToday: string,
): Habit {
  const { base, marks } = draft;
  if (
    base &&
    !draft.fields &&
    !draft.periods &&
    marks.size === 0 &&
    draft.notes.size === 0 &&
    !draft.freezes &&
    draft.archived === undefined &&
    today === snapshotToday &&
    base.id === id &&
    // Kept on the device before freezing / "several times a day" existed: counted anew.
    base.frozen_history !== undefined &&
    base.today_count !== undefined
  ) {
    return base;
  }
  const fields = draft.fields ?? (base ? habitFields(base) : null);
  if (!fields) {
    throw new Error("habit without fields");
  }
  // The server's days: its history, and the day after it (the calendar day in «Отмечать
  // за вчера» — switched off, today's marks are there at once).
  const nextDay = addDays(snapshotToday, 1);
  const baseDone = serverDone(base, snapshotToday);
  const baseFrozenHistory: boolean[] = base?.frozen_history ?? [];
  const freezes = draft.freezes ?? serverFreezes(base);
  const frozenOn = frozenCheck(draft, snapshotToday);
  const baseCount = (day: string): number => {
    if (day === nextDay) {
      return base?.next_day_count ?? 0;
    }
    const counts = base?.history_counts ?? [];
    const index = counts.length - 1 - daysBetween(day, snapshotToday);
    return index >= 0 && index < counts.length ? counts[index] : 0;
  };
  // A shared habit: a day is the group's when I did it and so did the others (the
  // server's answer). Days after it are unknown — not done by the others yet; alone in
  // the group, my days are its days. Switched off on the device — an ordinary habit.
  const group =
    draft.shared === false ? null : (base?.group ?? (draft.shared ? localGroup() : null));
  const othersDone = (day: string): boolean => {
    if (!group || group.members.length <= 1) {
      return true;
    }
    if (day === nextDay) {
      return group.others_next_day;
    }
    const index = group.others_history.length - 1 - daysBetween(day, snapshotToday);
    if (index >= group.others_history.length) {
      return false;
    }
    return index < 0 || group.others_history[index];
  };
  // «Гибкий график»: everyone has their own goal for the period — the days are mine.
  const period = flexiblePeriod(fields);
  const shownMark = (day: string, done: boolean): boolean =>
    done && (period !== null || othersDone(day));
  // How much of a day the group did: the others' presses (the server's answer) and mine
  // (as on the device), out of people × times a day — every press of anyone is one share.
  const target = fields.times_per_day;
  const myUnits = (day: string): number => {
    const mark = marks.get(day);
    if (mark !== undefined) {
      return mark ? target : Math.min(draft.counts.get(day) ?? 0, target);
    }
    return Math.min(baseCount(day), target);
  };
  const groupFillOf = (day: string): number => {
    if (!group) {
      return 0;
    }
    const units = group.others_units ?? [];
    const index = units.length - 1 - daysBetween(day, snapshotToday);
    let others = 0;
    let people = 1;
    if (index >= 0 && index < units.length) {
      others = units[index];
      people = group.people?.[index] ?? 1;
    } else if (index >= units.length) {
      // After the server's answer: nobody else is known to have done it yet.
      people = group.members.filter((member) => !member.frozen).length;
    }
    return Math.min((others + myUnits(day)) / (Math.max(people, 1) * target), 1);
  };
  const fillHistory: number[] = [];
  // As the server: counts by day — done several times a day now or in a past schedule.
  const severalTimes = countsByDay({
    ...fields,
    schedule_history: draft.periods ?? base?.schedule_history ?? [],
  });
  const history: boolean[] = [];
  const frozenHistory: boolean[] = [];
  const historyCounts: number[] = [];
  for (let index = 0; index < HISTORY_DAYS; index += 1) {
    const day = addDays(today, index - HISTORY_DAYS + 1);
    const mark = marks.get(day);
    history.push(mark === undefined ? baseDone(day) : shownMark(day, mark));
    if (group) {
      fillHistory.push(groupFillOf(day));
    }
    frozenHistory.push(frozenOn(day));
    if (group) {
      // As the server: in a shared habit — my part, whatever the goal.
      historyCounts.push(myUnits(day));
    } else if (severalTimes) {
      // As the server: a mark without a count leaves none (0).
      historyCounts.push(draft.counts.get(day) ?? baseCount(day));
    }
  }

  const scheduleHistory = draft.periods ?? base?.schedule_history ?? [];
  const openFrom = group?.open_from ?? null;
  const schedule = { ...fields, schedule_history: scheduleHistory, open_from: openFrom };
  const baseSchedule = base
    ? { ...habitFields(base), schedule_history: base.schedule_history ?? [], open_from: openFrom }
    : null;
  const baseFrozenOn = (day: string): boolean => {
    const index = baseFrozenHistory.length - 1 - daysBetween(day, snapshotToday);
    return index >= 0 && index < baseFrozenHistory.length && baseFrozenHistory[index];
  };

  // «Всего выполнено» — counted days only (countedDays, bonus marks aside): the server's
  // count, with the days it knows (its history, up to its day) counted anew as they are
  // here. Older days are as it says.
  const from = addDays(today < snapshotToday ? today : snapshotToday, 1 - HISTORY_DAYS);
  const doneHere = (day: string): boolean => {
    const mark = marks.get(day);
    return mark === undefined ? baseDone(day) : shownMark(day, mark);
  };
  let total = countedDays(schedule, from, today, doneHere, frozenOn).size;
  if (base && baseSchedule) {
    total +=
      base.total_done - countedDays(baseSchedule, from, snapshotToday, baseDone, baseFrozenOn).size;
  }

  const counted = countedHistory({ ...schedule, history, frozen_history: frozenHistory }, today);
  const run = currentRun(history, counted, frozenHistory, today, schedule);
  let current = run.count;
  let best = Math.max(current, bestRun(history, counted, frozenHistory, today, schedule));
  const flexible =
    period !== null ? flexibleState(draft, fields, period, today, snapshotToday, group) : null;
  if (flexible) {
    current = flexible.current;
    best = flexible.best;
  } else if (base) {
    if (run.exhausted) {
      // The run started before the history: the server knows how much earlier.
      const baseHistory = base.history;
      const baseCounted = countedHistory(
        { ...baseSchedule!, history: baseHistory, frozen_history: baseFrozenHistory },
        snapshotToday,
      );
      const baseRun = currentRun(
        baseHistory,
        baseCounted,
        baseFrozenHistory,
        snapshotToday,
        baseSchedule!,
      );
      current += Math.max(0, base.current_streak - baseRun.count);
      best = Math.max(best, current);
    }
    // A best run older than the history is known only from the server (the current one
    // is counted above).
    if (base.best_streak > base.current_streak) {
      best = Math.max(best, base.best_streak);
    }
  }

  // A shared habit: my part (the button) — the history has the group's days.
  const myDoneToday =
    marks.get(today) ??
    (group ? (base && today === snapshotToday ? base.done_today : false) : undefined);
  const doneToday = myDoneToday ?? history[history.length - 1];
  return {
    id,
    ...fields,
    done_today: doneToday,
    // «Гибкий график»: while the period's goal is open, and on the day it was reached.
    scheduled_today: flexible ? flexible.open : isDueOn(fields, today),
    period_done: flexible?.periodDone ?? 0,
    prior_streak: flexible?.prior ?? 0,
    prior_best: flexible?.priorBest ?? 0,
    history,
    current_streak: current,
    best_streak: best,
    total_done: Math.max(0, total),
    frozen_since: freezes.since,
    archived: draft.archived ?? base?.archived ?? false,
    frozen_history: frozenHistory,
    times_per_day: fields.times_per_day,
    today_count:
      draft.counts.get(today) ??
      (base ? (today === snapshotToday ? base.today_count ?? 0 : baseCount(today)) : 0),
    history_counts: historyCounts,
    created_on: base ? base.created_on : calendarToday,
    started_on: base ? base.started_on : null,
    schedule_history: scheduleHistory,
    notes: notesOf(base, draft.notes, today),
    group: group ? { ...group, fill_history: fillHistory } : group,
  };
}

/** Notes to the history's days: the server's, as changed on the device. */
function notesOf(
  base: Habit | null,
  changed: Map<string, string>,
  today: string,
): Record<string, string> {
  const first = addDays(today, 1 - HISTORY_DAYS);
  const notes: Record<string, string> = {};
  for (const [day, text] of Object.entries(base?.notes ?? {})) {
    if (day >= first && day <= today) {
      notes[day] = text;
    }
  }
  changed.forEach((text, day) => {
    if (text) {
      notes[day] = text;
    } else {
      delete notes[day];
    }
  });
  return notes;
}

/** A note as the server keeps it (validation.validate_note): lines kept (no more than one
 *  empty in a row), other control characters — spaces, spaces collapsed, trimmed. */
export function cleanNote(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(cleanHabitName)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface View {
  habits: Habit[];
  settings: Settings;
  /** Marking day the habits are counted for. */
  today: string;
}

/**
 * Snapshot + operations, counted for the marking day at `now`. `displayId` gives the id
 * a habit is shown under (stable while the app runs, see store.ts).
 */
export function deriveView(
  snapshot: Snapshot,
  ops: readonly Operation[],
  displayId: (key: TaskKey) => number,
  now: Date = new Date(),
): View {
  let settings = snapshot.settings;
  for (const op of ops) {
    if (op.type === "settings") {
      settings = applySettings(settings, op);
    }
  }
  const today = markingDay(settings.timezone, settings.mark_yesterday, now);
  const calendarToday = markingDay(settings.timezone, false, now);

  let drafts: Draft[] = snapshot.habits.map((habit) => ({
    key: habit.id,
    base: habit,
    fields: null,
    marks: new Map(),
    counts: new Map(),
    notes: new Map(),
    freezes: null,
  }));
  for (const op of ops) {
    if (op.type === "create") {
      drafts.push({
        key: op.ref,
        base: null,
        fields: habitFields(op.habit),
        marks: new Map(),
        counts: new Map(),
        notes: new Map(),
        freezes: null,
        shared: op.habit.shared ?? false,
      });
    } else if (
      op.type === "update" ||
      op.type === "mark" ||
      op.type === "freeze" ||
      op.type === "archive" ||
      op.type === "note"
    ) {
      const draft = drafts.find((item) => item.key === op.task);
      if (draft && op.type === "update") {
        const before = draft.fields ?? (draft.base ? habitFields(draft.base) : null);
        draft.fields = habitFields(op.habit, before);
        if (op.habit.shared !== undefined) {
          draft.shared = op.habit.shared;
        }
        // As the server (services._remember_schedule): the schedule before the marking day
        // is kept — past days are still judged by it. A habit created that day has no past.
        const periods = draft.periods ?? draft.base?.schedule_history ?? [];
        const createdOn = draft.base ? draft.base.created_on : calendarToday;
        if (
          before &&
          scheduleChanged(before, draft.fields) &&
          (createdOn == null || createdOn < today) &&
          !periods.some((period) => period.until >= today)
        ) {
          draft.periods = [
            ...periods,
            {
              until: today,
              frequency_type: before.frequency_type,
              days: before.days,
              start_date: before.start_date,
              period: before.period,
              period_times: before.period_times,
              times_per_day: before.times_per_day,
              overtime: before.overtime === true && before.times_per_day > 1,
              goal_unit: before.goal_unit ?? "times",
            },
          ];
        }
        // As the server (services.update_habit): auto check-off turned on means «mark
        // again», also if today (calendar day) was unchecked. Without a reminder today is
        // marked at once; otherwise (reminders, frozen, not due today) an unchecked today
        // is forgotten — applyAutoMark marks it once it is due (the last reminder came,
        // the habit was unfrozen).
        const frozen = draft.freezes ? draft.freezes.since !== null : draft.base?.frozen_since != null;
        if (draft.fields.auto_mark && !before?.auto_mark) {
          if (
            draft.fields.reminder_time === null &&
            !frozen &&
            autoMarkDue(draft, draft.fields, calendarToday, snapshot.today)
          ) {
            draft.marks.set(calendarToday, true);
          } else {
            if (draft.marks.get(calendarToday) === false) {
              draft.marks.delete(calendarToday);
            }
            draft.autoMarkFresh = calendarToday;
          }
        }
      } else if (draft && op.type === "mark") {
        // As the server: with a count, the day is done once the habit's times are reached.
        const fields = draft.fields ?? (draft.base ? habitFields(draft.base) : null);
        if (op.count === undefined) {
          draft.counts.set(op.date, 0);
          draft.marks.set(op.date, op.done);
        } else {
          // By the goal and «Сверх плана» of that day (services.goal_on); past the goal
          // only with «Сверх плана» (a press may have waited in the queue).
          const periods = draft.periods ?? draft.base?.schedule_history ?? [];
          const { goal: target, overtime, unit } = fields
            ? goalOn({ ...fields, schedule_history: periods }, op.date)
            : { goal: 1, overtime: false, unit: "times" as GoalUnit };
          // A day's time — at most 23:59:59.
          const count = Math.min(
            overtime ? op.count : Math.min(op.count, target),
            unit === "seconds" ? MAX_DAY_SECONDS : Infinity,
          );
          draft.counts.set(op.date, count);
          draft.marks.set(op.date, count >= target);
        }
      } else if (draft && op.type === "note") {
        draft.notes.set(op.date, cleanNote(op.text));
      } else if (draft && op.type === "freeze") {
        draft.freezes ??= serverFreezes(draft.base);
        applyFreeze(draft.freezes, op, draft.base);
      } else if (draft && op.type === "archive") {
        draft.archived = op.archived;
      }
    } else if (op.type === "delete") {
      drafts = drafts.filter((item) => item.key !== op.task);
    }
  }

  // The answer's calendar day: the day after its marking day in «Отмечать за вчера».
  const snapshotCalendarDay = snapshot.settings.mark_yesterday
    ? addDays(snapshot.today, 1)
    : snapshot.today;
  const clock = clockIn(settings.timezone, now);
  for (const draft of drafts) {
    applyAutoMark(draft, snapshot.today, snapshotCalendarDay, calendarToday, clock);
  }

  return {
    settings,
    today,
    habits: drafts.map((draft) =>
      buildHabit(draft, displayId(draft.key), today, snapshot.today, calendarToday),
    ),
  };
}

export interface FoldersView {
  folders: Folder[];
  /** Where «Все привычки» stands among the folders. */
  allHabitsPosition: number;
}

/** Is a habit in a recommended folder: due on the marking day (not frozen) and, for
 *  «unfinished», not done yet. */
export function inFolderOfKind(kind: FolderKind, habit: Habit): boolean {
  if (!habit.scheduled_today || habit.frozen_since !== null) {
    return false;
  }
  return kind === "today" || !habit.done_today;
}

/** Is a habit of a type a folder can take in (FolderHabitType). */
export function isOfHabitType(type: FolderHabitType, habit: Habit): boolean {
  const frozen = habit.frozen_since !== null;
  switch (type) {
    case "group":
      return isShared(habit);
    case "personal":
      return !isShared(habit);
    case "frozen":
      return frozen;
    case "unscheduled":
      return !frozen && !habit.scheduled_today;
  }
}

/**
 * The folders after the operations, as the server applies them (services._apply_folder_op):
 * a folder shows only habits that are in `habits` or of its `types` (the view), in their
 * order; a recommended
 * one — the habits of its kind (inFolderOfKind), the server keeps none in it. `displayTask`
 * and `displayFolder` give the ids habits and folders are shown under (store.ts).
 */
export function deriveFolders(
  snapshot: Snapshot,
  ops: readonly Operation[],
  habits: readonly Habit[],
  displayTask: (key: TaskKey) => number,
  displayFolder: (key: FolderKey) => number,
): FoldersView {
  let drafts: {
    key: FolderKey;
    name: string;
    habits: TaskKey[];
    types: FolderHabitType[];
    kind: FolderKind | null;
  }[] = (snapshot.folders ?? []).map((folder) => ({
    key: folder.id,
    name: folder.name,
    habits: folder.habits,
    types: folder.types ?? [],
    kind: folder.kind ?? null,
  }));
  let position = snapshot.all_habits_position ?? 0;
  for (const op of ops) {
    if (op.type === "folder_create") {
      drafts.push({
        key: op.ref,
        name: cleanHabitName(op.folder.name),
        habits: op.folder.kind ? [] : op.folder.habits,
        types: op.folder.kind ? [] : folderTypes(op.folder.types),
        kind: op.folder.kind ?? null,
      });
    } else if (op.type === "folder_update") {
      drafts = drafts.map((draft) =>
        draft.key === op.key
          ? {
              ...draft,
              name: cleanHabitName(op.folder.name),
              habits: draft.kind ? [] : op.folder.habits,
              types: draft.kind ? [] : folderTypes(op.folder.types),
            }
          : draft,
      );
    } else if (op.type === "folder_delete") {
      const index = drafts.findIndex((draft) => draft.key === op.key);
      if (index >= 0) {
        // It stood before «Все привычки»: that one moves into its place.
        if (index < position) {
          position -= 1;
        }
        drafts.splice(index, 1);
      }
    } else if (op.type === "folder_order") {
      const ordered: typeof drafts = [];
      position = 0;
      for (const key of op.order) {
        if (key === null) {
          position = ordered.length;
          continue;
        }
        const draft = drafts.find((item) => item.key === key);
        if (draft && !ordered.includes(draft)) {
          ordered.push(draft);
        }
      }
      drafts = [...ordered, ...drafts.filter((draft) => !ordered.includes(draft))];
    }
  }
  return {
    folders: drafts.map((draft) => {
      const inside = new Set(draft.habits.map(displayTask));
      const kind = draft.kind;
      return {
        id: displayFolder(draft.key),
        name: draft.name,
        habits: habits
          .filter((habit) =>
            kind
              ? inFolderOfKind(kind, habit)
              : inside.has(habit.id) || draft.types.some((type) => isOfHabitType(type, habit)),
          )
          .map((habit) => habit.id),
        types: draft.types,
        picked: habits.filter((habit) => inside.has(habit.id)).map((habit) => habit.id),
        kind,
      };
    }),
    allHabitsPosition: Math.min(position, drafts.length),
  };
}

/** A folder's types as the server keeps them: no repeats, in FOLDER_HABIT_TYPES order. */
function folderTypes(types: readonly FolderHabitType[] | undefined): FolderHabitType[] {
  return FOLDER_HABIT_TYPES.filter((type) => types?.includes(type));
}

function sameHabit(a: Habit, b: Habit): boolean {
  if (a === b) {
    return true;
  }
  const keys = Object.keys(a) as (keyof Habit)[];
  return keys.every((key) => {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((value, index) => value === right[index]);
    }
    return left === right;
  });
}

/**
 * `next` with every habit that did not change replaced by its object from `previous`
 * (and the whole list, if nothing changed): a check-in redraws only its own habit
 * block — each holds a grid of hundreds of dots (HabitBlock is memoized).
 */
export function reuseUnchanged(previous: Habit[], next: Habit[]): Habit[] {
  const byId = new Map(previous.map((habit) => [habit.id, habit]));
  let changed = previous.length !== next.length;
  const merged = next.map((habit, index) => {
    const old = byId.get(habit.id);
    if (old && sameHabit(old, habit)) {
      changed ||= previous[index] !== old;
      return old;
    }
    changed = true;
    return habit;
  });
  return changed ? merged : previous;
}
