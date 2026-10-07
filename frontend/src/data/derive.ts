/**
 * What the screen shows = the server's last answer (snapshot) + the changes made on the
 * device since (operations not yet confirmed by the server), counted for the current
 * marking day. Pure functions: the store (store.ts) calls them after every change.
 *
 * Computed here exactly as the server computes it (backend/services.py, schedule.py):
 * the marking day, whether a habit is due, history, frozen days, streaks, totals. When the server
 * answers, its numbers replace these — normally they are the same.
 */

import { HISTORY_DAYS, WEEKDAYS } from "../constants";
import type { FrequencyType, Habit, HabitInput } from "../types/habit";
import type { Settings } from "../types/settings";
import type { SyncOperation, TaskKey } from "../types/sync";
import { addDays, daysBetween, markingDay, weekdayIndex } from "./dates";

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
  /** Marking day of the answer: the last day of every habit's history. */
  today: string;
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
}

/** Is the habit due on `day` (schedule.is_due_on). */
export function isDueOn(habit: Schedule, day: string): boolean {
  if (habit.frequency_type === "every_other_day") {
    if (habit.start_date === null) {
      return false;
    }
    const offset = daysBetween(habit.start_date, day);
    return offset >= 0 && offset % 2 === 0;
  }
  if (habit.frequency_type === "daily") {
    return true;
  }
  return habit.days.includes(WEEKDAYS[weekdayIndex(day)]);
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
  if (patch.telegram_notifications !== undefined) {
    next.telegram_notifications = patch.telegram_notifications;
  }
  if (patch.checkin_reminder !== undefined) {
    next.checkin_reminder_time = patch.checkin_reminder.time;
    next.checkin_reminder_days = patch.checkin_reminder.days;
  }
  return { ...next, ...op.preview };
}

/** Form fields of a habit as the server stores them. */
function habitFields(input: HabitInput): Pick<
  Habit,
  | "name"
  | "frequency_type"
  | "days"
  | "start_date"
  | "reminder_time"
  | "color"
  | "times_per_day"
  | "auto_mark"
> {
  // Kept on the device before "several times a day" existed: once.
  const timesPerDay = input.times_per_day ?? 1;
  return {
    name: cleanHabitName(input.name),
    frequency_type: input.frequency_type,
    days:
      input.frequency_type === "specific_days"
        ? WEEKDAYS.filter((code) => input.days.includes(code))
        : [],
    start_date: input.frequency_type === "every_other_day" ? input.start_date : null,
    reminder_time: input.reminder_time,
    color: input.color,
    times_per_day: timesPerDay,
    // As the server: auto check-off only for once-a-day habits.
    auto_mark: (input.auto_mark ?? false) && timesPerDay === 1,
  };
}

/** Does an undone day at `index` of `history` break a run (compute_streaks): a due day
 *  before the marking day that was not frozen. */
function breaksRun(
  history: boolean[],
  frozen: readonly boolean[],
  index: number,
  lastDay: string,
  schedule: Schedule,
): boolean {
  return (
    index < history.length - 1 &&
    !frozen[index] &&
    isDueOn(schedule, addDays(lastDay, index - history.length + 1))
  );
}

/** Run of done days ending on the last day of `history` (compute_streaks): an undone
 *  marking day does not break it (the day is not over), an undone due day before it
 *  does, unless frozen. `exhausted` — the run goes on past the start of the history. */
function currentRun(
  history: boolean[],
  frozen: readonly boolean[],
  lastDay: string,
  schedule: Schedule,
): { count: number; exhausted: boolean } {
  let count = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]) {
      count += 1;
    } else if (breaksRun(history, frozen, index, lastDay, schedule)) {
      return { count, exhausted: false };
    }
  }
  return { count, exhausted: true };
}

/** Longest run inside `history` (days before it unknown). */
function bestRun(
  history: boolean[],
  frozen: readonly boolean[],
  lastDay: string,
  schedule: Schedule,
): number {
  let best = 0;
  let current = 0;
  history.forEach((done, index) => {
    if (done) {
      current += 1;
      best = Math.max(best, current);
    } else if (breaksRun(history, frozen, index, lastDay, schedule)) {
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
  /** Freezes changed on the device; null — as on the server. */
  freezes: Freezes | null;
}

/** The habit for `today` (the marking day) from its draft; `snapshotToday` — the day the
 *  server's version was counted for. */
function buildHabit(draft: Draft, id: number, today: string, snapshotToday: string): Habit {
  const { base, marks } = draft;
  if (
    base &&
    !draft.fields &&
    marks.size === 0 &&
    !draft.freezes &&
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
  const baseDone = (day: string): boolean => {
    if (!base) {
      return false;
    }
    const index = base.history.length - 1 - daysBetween(day, snapshotToday);
    return index >= 0 && index < base.history.length ? base.history[index] : false;
  };
  const baseFrozenHistory: boolean[] = base?.frozen_history ?? [];
  const freezes = draft.freezes ?? serverFreezes(base);
  const frozenOn = (day: string): boolean => {
    const index = baseFrozenHistory.length - 1 - daysBetween(day, snapshotToday);
    const baseFrozen = index >= 0 && index < baseFrozenHistory.length && baseFrozenHistory[index];
    return (
      (baseFrozen && (freezes.cut === null || day < freezes.cut)) ||
      freezes.ended.some(([start, end]) => start <= day && day < end) ||
      (freezes.since !== null && freezes.since <= day)
    );
  };
  const history: boolean[] = [];
  const frozenHistory: boolean[] = [];
  for (let index = 0; index < HISTORY_DAYS; index += 1) {
    const day = addDays(today, index - HISTORY_DAYS + 1);
    history.push(marks.get(day) ?? baseDone(day));
    frozenHistory.push(frozenOn(day));
  }

  // Done days the server counted (up to its day), changed or no longer counted here.
  let total = base?.total_done ?? 0;
  marks.forEach((done, day) => {
    if (day <= today) {
      total += Number(done) - Number(baseDone(day));
    }
  });
  if (base && snapshotToday > today) {
    for (let day = addDays(today, 1); day <= snapshotToday; day = addDays(day, 1)) {
      if (!marks.has(day)) {
        total -= Number(baseDone(day));
      }
    }
  }

  const run = currentRun(history, frozenHistory, today, fields);
  let current = run.count;
  let best = Math.max(current, bestRun(history, frozenHistory, today, fields));
  if (base) {
    if (run.exhausted) {
      // The run started before the history: the server knows how much earlier.
      const baseHistory = base.history;
      const baseRun = currentRun(baseHistory, baseFrozenHistory, snapshotToday, fields);
      current += Math.max(0, base.current_streak - baseRun.count);
      best = Math.max(best, current);
    }
    // A best run older than the history is known only from the server (the current one
    // is counted above).
    if (base.best_streak > base.current_streak) {
      best = Math.max(best, base.best_streak);
    }
  }

  return {
    id,
    ...fields,
    done_today: history[history.length - 1],
    scheduled_today: isDueOn(fields, today),
    history,
    current_streak: current,
    best_streak: best,
    total_done: Math.max(0, total),
    frozen_since: freezes.since,
    frozen_history: frozenHistory,
    times_per_day: fields.times_per_day,
    today_count:
      draft.counts.get(today) ?? (base && today === snapshotToday ? base.today_count ?? 0 : 0),
  };
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
        freezes: null,
      });
    } else if (op.type === "update" || op.type === "mark" || op.type === "freeze") {
      const draft = drafts.find((item) => item.key === op.task);
      if (draft && op.type === "update") {
        const before = draft.fields ?? (draft.base ? habitFields(draft.base) : null);
        draft.fields = habitFields(op.habit);
        // As the server (services.update_habit): auto check-off turned on for a habit
        // without a reminder marks today (calendar day) at once, unless today has a mark.
        // With a reminder, the server marks it if the reminder already came today.
        const frozen = draft.freezes ? draft.freezes.since !== null : draft.base?.frozen_since != null;
        if (
          draft.fields.auto_mark &&
          !before?.auto_mark &&
          draft.fields.reminder_time === null &&
          !frozen &&
          isDueOn(draft.fields, calendarToday) &&
          !draft.marks.has(calendarToday)
        ) {
          draft.marks.set(calendarToday, true);
        }
      } else if (draft && op.type === "mark") {
        // As the server: with a count, the day is done once the habit's times are reached.
        const fields = draft.fields ?? (draft.base ? habitFields(draft.base) : null);
        if (op.count === undefined) {
          draft.counts.set(op.date, 0);
          draft.marks.set(op.date, op.done);
        } else {
          draft.counts.set(op.date, op.count);
          draft.marks.set(op.date, op.count >= (fields?.times_per_day ?? 1));
        }
      } else if (draft && op.type === "freeze") {
        draft.freezes ??= serverFreezes(draft.base);
        applyFreeze(draft.freezes, op, draft.base);
      }
    } else if (op.type === "delete") {
      drafts = drafts.filter((item) => item.key !== op.task);
    }
  }

  return {
    settings,
    today,
    habits: drafts.map((draft) => buildHabit(draft, displayId(draft.key), today, snapshot.today)),
  };
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
