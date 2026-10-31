/**
 * The screen's view = the server's snapshot + changes made on the device, counted the
 * way the server counts (backend/services.py).
 */

import { describe, expect, it } from "vitest";

import { HISTORY_DAYS } from "../constants";
import type { Habit, HabitInput } from "../types/habit";
import type { Settings } from "../types/settings";
import { addDays, markingDay, weekdayIndex } from "./dates";
import {
  cleanHabitName,
  deriveView,
  goalOn,
  groupFill,
  isDueOn,
  isShared,
  myDay,
  periodBounds,
  periodQuota,
  reuseUnchanged,
  yearStats,
  type Operation,
  type Snapshot,
} from "./derive";
import type { GroupMember, HabitGroup } from "../types/habit";

const TODAY = "2026-10-05"; // a Monday
const NOW = new Date(`${TODAY}T12:00:00Z`);

const SETTINGS: Settings = {
  timezone: "UTC",
  timezone_city: null,
  timezone_display: "UTC",
  timezone_offset: "UTC+0",
  language: "ru",
  theme: "system",
  mark_yesterday: false,
  telegram_notifications: true,
  checkin_reminder_time: null,
  checkin_reminder_days: [],
  is_admin: false,
};

/** History with the days `daysAgo` (0 — `today`) done. */
function history(daysAgo: number[]): boolean[] {
  return Array.from({ length: HISTORY_DAYS }, (_, index) =>
    daysAgo.includes(HISTORY_DAYS - 1 - index),
  );
}

function habit(fields: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Зарядка",
    done_today: false,
    scheduled_today: true,
    frequency_type: "daily",
    days: [],
    start_date: null,
    history: history([]),
    current_streak: 0,
    best_streak: 0,
    total_done: 0,
    reminder_time: null,
    reminder_times: [],
    color: "blue",
    frozen_since: null,
    frozen_history: history([]),
    times_per_day: 1,
    today_count: 0,
    auto_mark: false,
    ...fields,
  };
}

function snapshot(habits: Habit[], settings: Partial<Settings> = {}, today = TODAY): Snapshot {
  return { habits, settings: { ...SETTINGS, ...settings }, today };
}

const ids = (key: number | string): number => (typeof key === "number" ? key : -1);

function view(snap: Snapshot, ops: Operation[] = [], now = NOW) {
  return deriveView(snap, ops, ids, now);
}

describe("dates", () => {
  it("counts days and weekdays", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayIndex(TODAY)).toBe(0);
    expect(weekdayIndex("2026-10-11")).toBe(6);
  });

  it("finds the marking day in the user's zone", () => {
    const lateEvening = new Date("2026-10-05T22:30:00Z");
    expect(markingDay("UTC", false, lateEvening)).toBe("2026-10-05");
    expect(markingDay("Europe/Moscow", false, lateEvening)).toBe("2026-10-06");
    expect(markingDay("Europe/Moscow", true, lateEvening)).toBe("2026-10-05");
    expect(markingDay(null, false, lateEvening)).toBe("2026-10-05");
    expect(markingDay("Not/AZone", false, lateEvening)).toBe("2026-10-05");
  });
});

describe("schedule", () => {
  it("knows due days", () => {
    const weekdays = { frequency_type: "specific_days" as const, days: ["mon", "wed"], start_date: null };
    expect(isDueOn(weekdays, TODAY)).toBe(true);
    expect(isDueOn(weekdays, addDays(TODAY, 1))).toBe(false);
    const everyOther = { frequency_type: "every_other_day" as const, days: [], start_date: TODAY };
    expect(isDueOn(everyOther, addDays(TODAY, -1))).toBe(false);
    expect(isDueOn(everyOther, TODAY)).toBe(true);
    expect(isDueOn(everyOther, addDays(TODAY, 1))).toBe(false);
    expect(isDueOn(everyOther, addDays(TODAY, 4))).toBe(true);
    // Monthly from January 31: the 31st, or the last day of a shorter month.
    const monthly = { frequency_type: "monthly" as const, days: [], start_date: "2026-01-31" };
    expect(isDueOn(monthly, "2026-01-30")).toBe(false);
    expect(isDueOn(monthly, "2026-01-31")).toBe(true);
    expect(isDueOn(monthly, "2026-02-28")).toBe(true);
    expect(isDueOn(monthly, "2026-03-30")).toBe(false);
    expect(isDueOn(monthly, "2026-03-31")).toBe(true);
    expect(isDueOn(monthly, "2026-04-30")).toBe(true);
    expect(isDueOn({ ...monthly, start_date: "2027-12-30" }, "2028-02-29")).toBe(true);
  });

  it("cleans names as the server does", () => {
    expect(cleanHabitName("  Бег\n по\tутрам  ")).toBe("Бег по утрам");
  });
});

describe("deriveView", () => {
  it("marks today at once when auto check-off is turned on without a reminder", () => {
    const input = { name: "Зарядка", frequency_type: "daily" as const, days: [], start_date: null, color: "blue" as const, times_per_day: 1 };
    const on = view(snapshot([habit()]), [
      { type: "update", task: 1, habit: { ...input, reminder_time: null, auto_mark: true } },
    ]).habits[0];
    expect(on).toMatchObject({ auto_mark: true, done_today: true });
    const withReminder = view(snapshot([habit()]), [
      { type: "update", task: 1, habit: { ...input, reminder_time: "23:59", auto_mark: true } },
    ]).habits[0];
    expect(withReminder).toMatchObject({ auto_mark: true, done_today: false });
    const several = view(snapshot([habit()]), [
      { type: "update", task: 1, habit: { ...input, times_per_day: 2, reminder_time: null, auto_mark: true } },
    ]).habits[0];
    expect(several).toMatchObject({ auto_mark: false, done_today: false });
  });

  it("cleans the description, keeps it when a change has none, clears it when empty", () => {
    const input = { name: "Зарядка", frequency_type: "daily" as const, days: [], start_date: null, reminder_time: null, color: "blue" as const, times_per_day: 1, auto_mark: false };
    const described = habit({ description: "10 минут" });
    const set = view(snapshot([habit()]), [
      { type: "update", task: 1, habit: { ...input, description: "  5\n минут " } },
    ]).habits[0];
    expect(set.description).toBe("5 минут");
    const kept = view(snapshot([described]), [{ type: "update", task: 1, habit: input }]).habits[0];
    expect(kept.description).toBe("10 минут");
    const cleared = view(snapshot([described]), [
      { type: "update", task: 1, habit: { ...input, description: " " } },
    ]).habits[0];
    expect(cleared.description).toBeNull();
  });

  it("shows auto check-off on the device as soon as it is due", () => {
    const auto = { auto_mark: true, auto_mark_ahead: true };
    // Without reminders — from the start of the day; with them — after the last one
    // (NOW is 12:00 UTC).
    expect(view(snapshot([habit(auto)])).habits[0].done_today).toBe(true);
    const passed = habit({ ...auto, reminder_time: "08:00", reminder_times: ["08:00", "11:59"] });
    expect(view(snapshot([passed])).habits[0]).toMatchObject({ done_today: true, total_done: 1 });
    const later = habit({ ...auto, reminder_time: "08:00", reminder_times: ["08:00", "18:00"] });
    expect(view(snapshot([later])).habits[0].done_today).toBe(false);
    // The server has a record for the day (the user removed the check-off): left as is.
    expect(view(snapshot([habit({ ...auto, auto_mark_ahead: false })])).habits[0].done_today).toBe(false);
    // An answer from yesterday: today has no record on the server yet.
    const yesterday = snapshot([habit({ ...auto, auto_mark_ahead: false })], {}, addDays(TODAY, -1));
    expect(view(yesterday).habits[0].done_today).toBe(true);
    // Not due, frozen, several times a day, or unchecked on the device — no check-off.
    const tuesdays = habit({ ...auto, frequency_type: "specific_days", days: ["tue"] });
    expect(view(snapshot([tuesdays])).habits[0].done_today).toBe(false);
    expect(view(snapshot([habit({ ...auto, frozen_since: TODAY })])).habits[0].done_today).toBe(false);
    expect(view(snapshot([habit({ ...auto, times_per_day: 2 })])).habits[0].done_today).toBe(false);
    const unchecked = view(snapshot([habit(auto)]), [{ type: "mark", task: 1, date: TODAY, done: false }]);
    expect(unchecked.habits[0].done_today).toBe(false);
  });

  it("marks again after the reminder when auto check-off is turned back on", () => {
    // Today unchecked (the server has the record), then auto check-off turned on with a
    // reminder: once it has come, today is shown done; before it — not yet.
    const unchecked = habit({ auto_mark: false, auto_mark_ahead: false });
    const input = { name: "Зарядка", frequency_type: "daily" as const, days: [], start_date: null, color: "blue" as const, times_per_day: 1, auto_mark: true };
    const passed = view(snapshot([unchecked]), [
      { type: "update", task: 1, habit: { ...input, reminder_time: "11:00", reminder_times: ["11:00"] } },
    ]).habits[0];
    expect(passed.done_today).toBe(true);
    const ahead = view(snapshot([unchecked]), [
      { type: "update", task: 1, habit: { ...input, reminder_time: "18:00", reminder_times: ["18:00"] } },
    ]).habits[0];
    expect(ahead.done_today).toBe(false);
    const later = view(
      snapshot([unchecked]),
      [{ type: "update", task: 1, habit: { ...input, reminder_time: "18:00", reminder_times: ["18:00"] } }],
      new Date(`${TODAY}T18:00:00Z`),
    ).habits[0];
    expect(later.done_today).toBe(true);
  });

  it("marks again on unfreezing when auto check-off was turned on while frozen", () => {
    // Today unchecked, frozen, auto check-off (no reminder) turned on, then unfrozen the
    // same day: today is done at once, as the bot will mark it.
    const frozen = habit({ auto_mark: false, auto_mark_ahead: false, frozen_since: TODAY });
    const input = { name: "Зарядка", frequency_type: "daily" as const, days: [], start_date: null, reminder_time: null, color: "blue" as const, times_per_day: 1, auto_mark: true };
    const frozenView = view(snapshot([frozen]), [{ type: "update", task: 1, habit: input }]);
    expect(frozenView.habits[0].done_today).toBe(false);
    const unfrozen = view(snapshot([frozen]), [
      { type: "update", task: 1, habit: input },
      { type: "freeze", task: 1, date: TODAY, frozen: false },
    ]);
    expect(unfrozen.habits[0]).toMatchObject({ frozen_since: null, done_today: true });
  });

  it("keeps several reminders in order, as the server", () => {
    const input = { name: "Вода", frequency_type: "daily" as const, days: [], start_date: null, color: "blue" as const, times_per_day: 1, auto_mark: false };
    const several = view(snapshot([habit()]), [
      { type: "update", task: 1, habit: { ...input, reminder_time: "09:00", reminder_times: ["21:00", "09:00", "13:00", "09:00"] } },
    ]).habits[0];
    expect(several).toMatchObject({ reminder_time: "09:00", reminder_times: ["09:00", "13:00", "21:00"] });
    // A change made before several reminders existed: the one reminder_time.
    const old = view(snapshot([habit()]), [
      { type: "update", task: 1, habit: { ...input, reminder_time: "08:00" } },
    ]).habits[0];
    expect(old).toMatchObject({ reminder_time: "08:00", reminder_times: ["08:00"] });
  });

  it("keeps the times done each day for shading unfinished days", () => {
    const counts = Array<number>(HISTORY_DAYS).fill(0);
    counts[HISTORY_DAYS - 2] = 1; // yesterday: 1 of 4
    const base = habit({ times_per_day: 4, history_counts: counts });
    const marked = view(snapshot([base]), [
      { type: "mark", task: 1, date: TODAY, done: false, count: 2 },
    ]).habits[0];
    expect(marked.history_counts?.slice(-2)).toEqual([1, 2]);
    // Shading only: an unfinished day is not done and does not count in streaks.
    expect(marked).toMatchObject({ done_today: false, current_streak: 0, total_done: 0 });
    // Once-a-day habits have none.
    expect(view(snapshot([habit()]), [{ type: "mark", task: 1, date: TODAY, done: true }]).habits[0].history_counts).toEqual([]);
  });

  it("counts a habit done several times a day", () => {
    const base = habit({ times_per_day: 3, today_count: 1 });
    expect(view(snapshot([base])).habits[0]).toBe(base);
    const two = view(snapshot([base]), [
      { type: "mark", task: 1, date: TODAY, done: false, count: 2 },
    ]).habits[0];
    expect(two).toMatchObject({ today_count: 2, done_today: false, total_done: 0 });
    const three = view(snapshot([base]), [
      { type: "mark", task: 1, date: TODAY, done: true, count: 3 },
    ]).habits[0];
    expect(three).toMatchObject({ today_count: 3, done_today: true, current_streak: 1 });
    // A lower goal: the day's count already reaches it.
    const lowered = view(snapshot([base]), [
      { type: "update", task: 1, habit: { name: "Зарядка", frequency_type: "daily", days: [], start_date: null, reminder_time: null, color: "blue", times_per_day: 2, auto_mark: false } },
      { type: "mark", task: 1, date: TODAY, done: true, count: 2 },
    ]).habits[0];
    expect(lowered).toMatchObject({ times_per_day: 2, today_count: 2, done_today: true });
  });

  it("stops a count at the goal without «Сверх плана»", () => {
    const mark = { type: "mark" as const, task: 1, date: TODAY, done: true, count: 5 };
    expect(view(snapshot([habit({ times_per_day: 3 })]), [mark]).habits[0].today_count).toBe(3);
    const over = view(snapshot([habit({ times_per_day: 3, overtime: true })]), [mark]).habits[0];
    expect(over).toMatchObject({ today_count: 5, done_today: true, current_streak: 1 });
  });

  it("marks a past day by the goal of that day", () => {
    // Once a day until today, now 3 times with «Сверх плана»: yesterday counts to 1 and is
    // done at 1; today counts to the new goal and past it.
    const yesterday = addDays(TODAY, -1);
    const base = habit({
      times_per_day: 3,
      overtime: true,
      schedule_history: [{ until: TODAY, frequency_type: "daily", days: [], start_date: null, times_per_day: 1 }],
    });
    const [result] = view(snapshot([base]), [
      { type: "mark", task: 1, date: yesterday, done: true, count: 5 },
      { type: "mark", task: 1, date: TODAY, done: true, count: 5 },
    ]).habits;
    expect(result.history.slice(-2)).toEqual([true, true]);
    expect(result.history_counts?.slice(-2)).toEqual([1, 5]);
    expect(myDay(result, yesterday, TODAY)).toEqual({ done: true, count: 1 });
    expect(goalOn(result, yesterday)).toEqual({ goal: 1, overtime: false, unit: "times" });
    expect(goalOn(result, TODAY)).toEqual({ goal: 3, overtime: true, unit: "times" });
  });

  it("returns the server's habits as they are when nothing changed", () => {
    const base = habit();
    expect(view(snapshot([base])).habits[0]).toBe(base);
  });

  it("applies a check-in for the marking day", () => {
    const base = habit({ history: history([1, 2]), current_streak: 2, best_streak: 2, total_done: 2 });
    const [result] = view(snapshot([base]), [{ type: "mark", task: 1, date: TODAY, done: true }]).habits;
    expect(result.done_today).toBe(true);
    expect(result.history[result.history.length - 1]).toBe(true);
    expect([result.current_streak, result.best_streak, result.total_done]).toEqual([3, 3, 3]);
  });

  it("takes a check-in back exactly", () => {
    const base = habit({
      done_today: true,
      history: history([0, 1, 2]),
      current_streak: 3,
      best_streak: 3,
      total_done: 3,
    });
    const [result] = view(snapshot([base]), [{ type: "mark", task: 1, date: TODAY, done: false }]).habits;
    expect([result.current_streak, result.best_streak, result.total_done]).toEqual([2, 2, 2]);
  });

  it("keeps a best streak older than the history", () => {
    const base = habit({ history: history([1]), current_streak: 1, best_streak: 40, total_done: 90 });
    const [result] = view(snapshot([base]), [{ type: "mark", task: 1, date: TODAY, done: true }]).habits;
    expect([result.current_streak, result.best_streak, result.total_done]).toEqual([2, 40, 91]);
  });

  it("moves to the next day at midnight", () => {
    const base = habit({ done_today: true, history: history([0, 1]), current_streak: 2, best_streak: 2, total_done: 2 });
    const tomorrow = new Date(`${addDays(TODAY, 1)}T08:00:00Z`);
    const [result] = view(snapshot([base]), [], tomorrow).habits;
    expect(result.done_today).toBe(false);
    expect(result.history.slice(-3)).toEqual([true, true, false]);
    // Today is not over: the streak still runs from yesterday.
    expect(result.current_streak).toBe(2);
    const later = new Date(`${addDays(TODAY, 2)}T08:00:00Z`);
    expect(view(snapshot([base]), [], later).habits[0].current_streak).toBe(0);
  });

  it("does not break a streak on days the habit is not due", () => {
    // Mon and Fri; done last Friday and Monday the week before.
    const base = habit({
      frequency_type: "specific_days",
      days: ["mon", "fri"],
      history: history([3, 7]),
      current_streak: 2,
      best_streak: 2,
      total_done: 2,
    });
    const [result] = view(snapshot([base]), [{ type: "mark", task: 1, date: TODAY, done: true }]).habits;
    expect(result.current_streak).toBe(3);
  });

  it("shows a bonus mark off the schedule: in the total, not in the streaks", () => {
    // Mon and Fri; Monday (today) done. Sunday (yesterday) is not due: a bonus mark.
    const base = habit({
      frequency_type: "specific_days",
      days: ["mon", "fri"],
      history: history([0, 3]),
      done_today: true,
      current_streak: 2,
      best_streak: 2,
      total_done: 2,
    });
    const [result] = view(snapshot([base]), [
      { type: "mark", task: 1, date: addDays(TODAY, -1), done: true },
    ]).habits;
    expect(result.history.slice(-2)).toEqual([true, true]);
    expect([result.current_streak, result.best_streak, result.total_done]).toEqual([2, 2, 3]);
  });

  it("fixes a missed past day: the runs join up", () => {
    // Daily: done 1–2 and 4–5 days ago, 3 days ago missed.
    const base = habit({
      history: history([1, 2, 4, 5]),
      current_streak: 2,
      best_streak: 2,
      total_done: 4,
    });
    const [result] = view(snapshot([base]), [
      { type: "mark", task: 1, date: addDays(TODAY, -3), done: true },
    ]).habits;
    expect([result.current_streak, result.best_streak, result.total_done]).toEqual([5, 5, 5]);
  });

  it("keeps notes to days, removes an empty one", () => {
    const day = addDays(TODAY, -2);
    const base = habit({ notes: { [addDays(TODAY, -5)]: "Болел" } });
    const [result] = view(snapshot([base]), [
      { type: "note", task: 1, date: day, text: "  Бегал\r\n\r\n\r\n5   км " },
      { type: "note", task: 1, date: addDays(TODAY, -5), text: "" },
    ]).habits;
    expect(result.notes).toEqual({ [day]: "Бегал\n\n5 км" });
  });

  it("continues a streak longer than the history from the server's count", () => {
    const all = Array.from({ length: HISTORY_DAYS - 1 }, (_, index) => index + 1);
    const base = habit({ history: history(all), current_streak: 500, best_streak: 500, total_done: 500 });
    const [result] = view(snapshot([base]), [{ type: "mark", task: 1, date: TODAY, done: true }]).habits;
    expect([result.current_streak, result.best_streak, result.total_done]).toEqual([501, 501, 501]);
  });

  it("keeps the streak through a freeze and shows its days", () => {
    const base = habit({ history: history([1, 2]), current_streak: 2, best_streak: 2, total_done: 2 });
    const freeze: Operation = { type: "freeze", task: 1, date: TODAY, frozen: true };
    const [frozen] = view(snapshot([base]), [freeze]).habits;
    expect(frozen.frozen_since).toBe(TODAY);
    expect(frozen.frozen_history.slice(-2)).toEqual([false, true]);
    // Three days later, nothing marked: the frozen days do not break the streak.
    const later = new Date(`${addDays(TODAY, 3)}T08:00:00Z`);
    const [still] = view(snapshot([base]), [freeze], later).habits;
    expect(still.frozen_history.slice(-5)).toEqual([false, true, true, true, true]);
    expect(still.current_streak).toBe(2);
  });

  it("ends the server's freeze on the unfreeze day", () => {
    const base = habit({
      history: history([4]),
      frozen_since: addDays(TODAY, -3),
      frozen_history: history([0, 1, 2, 3]),
      current_streak: 1,
      best_streak: 1,
      total_done: 1,
    });
    const unfreeze: Operation = { type: "freeze", task: 1, date: TODAY, frozen: false };
    const [result] = view(snapshot([base]), [unfreeze]).habits;
    expect(result.frozen_since).toBeNull();
    expect(result.frozen_history.slice(-5)).toEqual([false, true, true, true, false]);
    expect(result.current_streak).toBe(1);
    // Next day: today (the unfreeze day) was not marked — it breaks the streak.
    const tomorrow = new Date(`${addDays(TODAY, 1)}T08:00:00Z`);
    const [next] = view(snapshot([base]), [unfreeze], tomorrow).habits;
    expect(next.frozen_history.slice(-2)).toEqual([false, false]);
    expect(next.current_streak).toBe(0);
  });

  it("leaves no frozen days after unfreezing on the same day", () => {
    const [result] = view(snapshot([habit()]), [
      { type: "freeze", task: 1, date: TODAY, frozen: true },
      { type: "freeze", task: 1, date: TODAY, frozen: false },
    ]).habits;
    expect(result.frozen_since).toBeNull();
    expect(result.frozen_history.some(Boolean)).toBe(false);
  });

  it("archives a habit and brings it back, keeping it working", () => {
    const base = habit({ history: history([1]), current_streak: 1, best_streak: 1, total_done: 1 });
    const archive: Operation = { type: "archive", task: 1, archived: true };
    const [archived] = view(snapshot([base]), [
      archive,
      { type: "mark", task: 1, date: TODAY, done: true },
    ]).habits;
    expect(archived.archived).toBe(true);
    expect(archived.current_streak).toBe(2);
    const [back] = view(snapshot([{ ...base, archived: true }]), [
      { type: "archive", task: 1, archived: false },
    ]).habits;
    expect(back.archived).toBe(false);
    // Saved on the device before the archive: not in it.
    expect(view(snapshot([base]), []).habits[0].archived).toBeFalsy();
  });

  it("dates a habit created on the device by the calendar day, as the server", () => {
    const created: Operation = {
      type: "create",
      ref: "device-1",
      habit: {
        name: "Чтение",
        frequency_type: "daily",
        days: [],
        start_date: null,
        reminder_time: null,
        color: "green",
        times_per_day: 1,
        auto_mark: false,
      },
    };
    const kept = habit({ created_on: "2026-09-01" });
    const [server, device] = view(snapshot([kept], { mark_yesterday: true }), [created]).habits;
    expect(server.created_on).toBe("2026-09-01");
    // «Отмечать за вчера»: the marking day is yesterday, the habit is created today.
    expect(device.created_on).toBe(TODAY);
  });

  it("creates, edits and deletes habits", () => {
    const base = habit();
    const created: Operation = {
      type: "create",
      ref: "device-1",
      habit: {
        name: " Чтение ",
        frequency_type: "specific_days",
        days: ["tue", "mon"],
        start_date: null,
        reminder_time: "09:00",
        color: "green",
        times_per_day: 1,
        auto_mark: false,
      },
    };
    const result = view(snapshot([base]), [
      created,
      { type: "mark", task: "device-1", date: TODAY, done: true },
      {
        type: "update",
        task: 1,
        habit: { name: "Бег", frequency_type: "specific_days", days: ["sun"], start_date: null, reminder_time: null, color: "red", times_per_day: 1, auto_mark: false },
      },
    ]).habits;
    expect(result.map((item) => [item.id, item.name, item.scheduled_today])).toEqual([
      [1, "Бег", false],
      [-1, "Чтение", true],
    ]);
    expect(result[1]).toMatchObject({ days: ["mon", "tue"], done_today: true, current_streak: 1, total_done: 1 });

    const deleted = view(snapshot([base]), [created, { type: "delete", task: 1 }]).habits;
    expect(deleted.map((item) => item.id)).toEqual([-1]);
  });

  it("counts from yesterday in the «Отмечать за вчера» mode", () => {
    const base = habit({ done_today: true, history: history([0]), current_streak: 1, best_streak: 1, total_done: 1 });
    const result = view(snapshot([base]), [
      { type: "settings", patch: { mark_yesterday: true } },
    ]);
    expect(result.today).toBe(addDays(TODAY, -1));
    expect(result.settings.mark_yesterday).toBe(true);
    // Today's check-in is not seen until tomorrow, as on the server.
    expect(result.habits[0]).toMatchObject({ done_today: false, total_done: 0 });
  });

  it("switches «Отмечать за вчера» at once, with the server's days on both sides", () => {
    // On: yesterday's state and times done come from the history.
    const counts = Array<number>(HISTORY_DAYS).fill(0);
    counts[HISTORY_DAYS - 2] = 2;
    const water = habit({ times_per_day: 3, history_counts: counts });
    const on = view(snapshot([water]), [{ type: "settings", patch: { mark_yesterday: true } }]);
    expect(on.habits[0].today_count).toBe(2);
    // Off: the answer ended yesterday, but tells today's state (next_day_*).
    const yesterdayMode = snapshot(
      [habit({ next_day_done: true, total_done: 0 }), habit({ id: 2, name: "Вода", times_per_day: 3, next_day_count: 1 })],
      { mark_yesterday: true },
      addDays(TODAY, -1),
    );
    const off = view(yesterdayMode, [{ type: "settings", patch: { mark_yesterday: false } }]);
    expect(off.today).toBe(TODAY);
    expect(off.habits[0]).toMatchObject({ done_today: true, total_done: 1, current_streak: 1 });
    expect(off.habits[1]).toMatchObject({ done_today: false, today_count: 1 });
    expect(off.habits[1].history_counts?.slice(-1)).toEqual([1]);
  });

  it("shows a chosen time zone at once", () => {
    const result = view(snapshot([]), [
      {
        type: "settings",
        patch: { timezone_city: 7 },
        preview: { timezone: "Asia/Tokyo", timezone_city: 7, timezone_display: "Токио" },
      },
    ]);
    expect(result.settings).toMatchObject({ timezone: "Asia/Tokyo", timezone_display: "Токио" });
    expect(result.today).toBe(markingDay("Asia/Tokyo", false, NOW));
  });
});

describe("schedule history", () => {
  // TODAY is a Monday. «Every other day» from last Monday: Mon, Wed, Fri, Sun done.
  const lastMonday = addDays(TODAY, -7);
  const everyOtherDay = {
    frequency_type: "every_other_day" as const,
    days: [],
    start_date: lastMonday,
  };
  const done = [7, 5, 3, 1];

  it("judges past days by the schedule then in force", () => {
    const base = habit({
      ...everyOtherDay,
      history: history(done),
      current_streak: 4,
      best_streak: 4,
      total_done: 4,
      created_on: lastMonday,
    });
    // Switched to Saturdays only today: the past keeps «every other day», so Tuesday and
    // Thursday never break the run.
    const result = view(snapshot([base]), [
      {
        type: "update",
        task: 1,
        habit: {
          name: "Зарядка",
          frequency_type: "specific_days",
          days: ["sat"],
          start_date: null,
          reminder_time: null,
          color: "blue",
          times_per_day: 1,
          auto_mark: false,
        },
      },
    ]);
    const [changed] = result.habits;
    expect(changed.schedule_history).toEqual([
      {
        until: TODAY,
        ...everyOtherDay,
        period: null,
        period_times: null,
        times_per_day: 1,
        overtime: false,
        goal_unit: "times",
      },
    ]);
    expect(changed.current_streak).toBe(4);
    expect(changed.scheduled_today).toBe(false);
  });

  it("uses the server's periods for streaks", () => {
    const base = habit({
      frequency_type: "specific_days",
      days: ["sat"],
      start_date: null,
      history: history(done),
      current_streak: 4,
      best_streak: 4,
      total_done: 4,
      schedule_history: [{ until: TODAY, ...everyOtherDay, times_per_day: 1 }],
    });
    // A mark on the device recounts the habit: the periods still apply.
    const result = view(snapshot([base]), [
      { type: "mark", task: 1, date: addDays(TODAY, -1), done: false },
    ]);
    expect(result.habits[0].current_streak).toBe(0);
    const again = view(snapshot([base]), [
      { type: "mark", task: 1, date: addDays(TODAY, -1), done: true },
    ]);
    expect(again.habits[0].current_streak).toBe(4);
  });
});

describe("shared habit", () => {
  const member = (fields: Partial<GroupMember>): GroupMember => ({
    user_id: 2,
    name: "@petya",
    is_me: false,
    is_owner: false,
    done: false,
    count: 0,
    frozen: false,
    ...fields,
  });
  const group = (others: boolean[], members: GroupMember[]): HabitGroup => ({
    id: 7,
    is_owner: true,
    notify_marks: false,
    members: [member({ user_id: 1, name: "@me", is_me: true, is_owner: true }), ...members],
    others_history: others,
    others_next_day: false,
    open_from: TODAY,
  });

  it("is a group day only when the others did it too", () => {
    // Yesterday the friend did it, today not yet.
    const shared = habit({
      group: group(history([1]), [member({})]),
      history: history([]),
    });
    expect(isShared(shared)).toBe(true);
    const marked = view(snapshot([shared]), [
      { type: "mark", task: 1, date: TODAY, done: true },
      { type: "mark", task: 1, date: addDays(TODAY, -1), done: true },
    ]).habits[0];
    // My part today is done; the group's day is not.
    expect(marked.done_today).toBe(true);
    expect(marked.history.slice(-2)).toEqual([true, false]);
    expect(marked.total_done).toBe(1);
    expect(marked.current_streak).toBe(1);
  });

  it("shades a day by everyone's presses, without flicker", () => {
    // Three people, 3 times a day: today the others pressed 3 times in all.
    const base = group(history([]), [member({ count: 3 }), member({ user_id: 3 })]);
    const shared = habit({
      times_per_day: 3,
      group: {
        ...base,
        others_units: Array<number>(HISTORY_DAYS).fill(3),
        people: Array<number>(HISTORY_DAYS).fill(3),
        fill_history: Array<number>(HISTORY_DAYS).fill(3 / 9),
      },
    });
    expect(groupFill(shared)?.[HISTORY_DAYS - 1]).toBeCloseTo(3 / 9);
    // Each of my presses adds 1/9 on the device — the same share the server will count.
    const presses = [1, 2, 3].map(
      (count) =>
        view(snapshot([shared]), [
          { type: "mark", task: 1, date: TODAY, done: count === 3, count },
        ]).habits[0],
    );
    expect(presses.map((item) => item.group?.fill_history?.[HISTORY_DAYS - 1])).toEqual([
      4 / 9,
      5 / 9,
      6 / 9,
    ]);
    // My part is done, the group's day is not.
    expect(presses[2].done_today).toBe(true);
    expect(presses[2].history[HISTORY_DAYS - 1]).toBe(false);
  });

  it("keeps my part when «Отмечать за вчера» is switched, before the server answers", () => {
    // I did it today and yesterday, the friend did neither: no group days.
    const mine = Array<number>(HISTORY_DAYS).fill(0);
    mine[HISTORY_DAYS - 1] = 1;
    mine[HISTORY_DAYS - 2] = 1;
    const shared = habit({ done_today: true, history_counts: mine, group: group(history([]), [member({})]) });
    const on = view(snapshot([shared]), [{ type: "settings", patch: { mark_yesterday: true } }]);
    expect(on.habits[0].done_today).toBe(true);
    // Switched off: the answer (yesterday mode) tells today's part in next_day_count.
    const yesterdayMode = snapshot(
      [{ ...shared, history_counts: mine.slice(1).concat(0), next_day_count: 1 }],
      { mark_yesterday: true },
      addDays(TODAY, -1),
    );
    const off = view(yesterdayMode, [{ type: "settings", patch: { mark_yesterday: false } }]);
    expect(off.habits[0].done_today).toBe(true);
    expect(off.habits[0].history[HISTORY_DAYS - 1]).toBe(false);
  });

  it("stays shared while alone, my days are the group's", () => {
    const alone = habit({ group: group(history([]), []) });
    expect(isShared(alone)).toBe(true);
    const marked = view(snapshot([alone]), [{ type: "mark", task: 1, date: TODAY, done: true }]);
    expect(marked.habits[0].history[HISTORY_DAYS - 1]).toBe(true);
  });

  it("is shared from the moment it is created on the device", () => {
    const input = (): HabitInput => ({
      name: "Бег",
      frequency_type: "daily",
      days: [],
      start_date: null,
      reminder_time: null,
      color: "green",
      times_per_day: 1,
      auto_mark: false,
    });
    const created = view(snapshot([]), [
      {
        type: "create",
        ref: "r1",
        habit: { ...input(), shared: true },
      },
    ]);
    const [mine] = created.habits;
    expect(isShared(mine)).toBe(true);
    expect(mine.group?.members.map((member) => member.is_me)).toEqual([true]);
    const plain = view(snapshot([]), [{ type: "create", ref: "r2", habit: { ...input(), name: "Сон" } }]);
    expect(isShared(plain.habits[0])).toBe(false);
  });

  it("is switched on and off on the device before the server answers", () => {
    const update = (shared?: boolean): Operation => ({
      type: "update",
      task: 1,
      habit: {
        name: "Бег",
        frequency_type: "daily",
        days: [],
        start_date: null,
        reminder_time: null,
        color: "green",
        times_per_day: 1,
        auto_mark: false,
        ...(shared === undefined ? {} : { shared }),
      },
    });
    const on = view(snapshot([habit()]), [update(true), update()]);
    expect(on.habits[0].group?.members.map((member) => member.is_me)).toEqual([true]);
    const alone = habit({ group: group(history([]), []) });
    expect(isShared(view(snapshot([alone]), [update(false)]).habits[0])).toBe(false);
    expect(isShared(view(snapshot([alone]), [update()]).habits[0])).toBe(true);
  });
});

describe("reuseUnchanged", () => {
  it("keeps the objects of habits that did not change", () => {
    const one = habit({ id: 1 });
    const two = habit({ id: 2 });
    const same = reuseUnchanged([one, two], [habit({ id: 1 }), habit({ id: 2 })]);
    expect(same[0]).toBe(one);
    expect(same[1]).toBe(two);
    const next = reuseUnchanged([one, two], [habit({ id: 1 }), habit({ id: 2, name: "Сон" })]);
    expect(next[0]).toBe(one);
    expect(next[1].name).toBe("Сон");
    const list = [one, two];
    expect(reuseUnchanged(list, [habit({ id: 1 }), habit({ id: 2 })])).toBe(list);
  });
});

describe("flexible schedule", () => {
  // TODAY is Monday 5 October: the month began on Thursday the 1st.
  const flexible = (period: "week" | "month" | "year", times: number) => ({
    frequency_type: "flexible" as const,
    period,
    period_times: times,
  });

  it("knows calendar periods and their goals", () => {
    expect(periodBounds("week", "2026-10-08")).toEqual(["2026-10-05", "2026-10-11"]);
    expect(periodBounds("month", "2026-02-14")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(periodBounds("year", TODAY)).toEqual(["2026-01-01", "2026-12-31"]);
    expect(periodQuota(31, "2026-02-01", "2026-02-28")).toBe(28);
    expect(isDueOn({ ...flexible("week", 3), days: [], start_date: null }, TODAY)).toBe(false);
  });

  it("adds the current period to the streak once its goal is reached", () => {
    const base = habit({
      ...flexible("month", 3),
      history: history([4, 3]),
      total_done: 2,
      period_done: 2,
      prior_streak: 4,
      prior_best: 6,
      current_streak: 4,
      best_streak: 6,
    });
    const marked = view(snapshot([base]), [{ type: "mark", task: 1, date: TODAY, done: true }]);
    const [habitNow] = marked.habits;
    expect(habitNow.period_done).toBe(3);
    expect([habitNow.current_streak, habitNow.best_streak]).toEqual([5, 6]);
    // The day the goal was reached stays «today» with its mark.
    expect(habitNow.scheduled_today).toBe(true);
    // The next day the month's goal is closed: not «today» any more.
    const tomorrow = view(
      snapshot([base]),
      [{ type: "mark", task: 1, date: TODAY, done: true }],
      new Date(`${addDays(TODAY, 1)}T12:00:00Z`),
    );
    expect(tomorrow.habits[0].scheduled_today).toBe(false);
    expect(tomorrow.habits[0].current_streak).toBe(5);
  });

  it("counts a week that ended after the server's answer", () => {
    // The answer was for Wednesday 30 September: once a week, done on Tuesday.
    const base = habit({
      ...flexible("week", 1),
      history: history([1]),
      total_done: 1,
      period_done: 1,
      prior_streak: 2,
      prior_best: 2,
      current_streak: 3,
      best_streak: 3,
    });
    const [now] = view(snapshot([base], {}, "2026-09-30")).habits;
    expect([now.prior_streak, now.current_streak, now.period_done]).toEqual([3, 3, 0]);
    expect(now.scheduled_today).toBe(true);
  });

  it("marks past the goal as a bonus: the first days of the period count", () => {
    // Once a month, done today (5 October).
    const base = habit({
      ...flexible("month", 1),
      history: history([0]),
      done_today: true,
      total_done: 1,
      period_done: 1,
      current_streak: 1,
      best_streak: 1,
    });
    // 2 October is in the same month and earlier: it counts, today becomes a bonus mark.
    const [result] = view(snapshot([base]), [
      { type: "mark", task: 1, date: addDays(TODAY, -3), done: true },
    ]).habits;
    expect(result.history.slice(-4)).toEqual([true, false, false, true]);
    expect([result.period_done, result.total_done, result.current_streak]).toEqual([1, 2, 1]);
    expect(result.done_today).toBe(true);
    expect(result.scheduled_today).toBe(false);
  });

  it("auto check-off closes the goal and then stops", () => {
    const base = habit({
      ...flexible("week", 1),
      auto_mark: true,
      auto_mark_ahead: true,
    });
    const tuesday = view(snapshot([base]), [], new Date(`${addDays(TODAY, 1)}T12:00:00Z`));
    const [result] = tuesday.habits;
    // Monday was marked; Tuesday is past the week's goal.
    expect(result.history.slice(-2)).toEqual([true, false]);
    expect(result.scheduled_today).toBe(false);
  });

  it("tells how often to do a year goal and when it is reached", () => {
    const gym = (fields: Partial<Habit>) =>
      habit({ ...flexible("year", 120), created_on: "2026-01-01", ...fields });
    // 100 of 120 by Monday 5 October, done today: 87 days left, 20 to go.
    const onTrack = yearStats(gym({ period_done: 100, done_today: true, history: history([0, 2]) }), TODAY);
    expect(onTrack.need).toEqual({ per: "week", times: 2 });
    expect(onTrack.thisWeek).toBe(1);
    // 100 days in 278 — 20 more in 56 days.
    expect(onTrack.forecast).toEqual({ kind: "date", date: "2026-11-30" });

    const behind = yearStats(gym({ period_times: 300, period_done: 100 }), TODAY);
    expect(behind.need).toEqual({ per: "late" });
    expect(behind.forecast).toEqual({ kind: "total", total: 131 });

    const reached = yearStats(gym({ period_times: 10, period_done: 10, history: history([3, 10]) }), TODAY);
    expect(reached.need).toEqual({ per: "week", times: 0 });
    expect(reached.forecast).toEqual({ kind: "reached", date: "2026-10-02" });

    expect(yearStats(gym({ period_done: 0 }), TODAY).forecast).toEqual({ kind: "none" });
    // The goal changed today (150 → 300): the pace is still the whole year's, so out of
    // reach means no forecast date.
    const raised = yearStats(
      gym({
        period_times: 300,
        period_done: 100,
        schedule_history: [
          { until: TODAY, frequency_type: "flexible", days: [], start_date: null, period: "year", period_times: 150, times_per_day: 1 },
        ],
      }),
      TODAY,
    );
    expect(raised.need).toEqual({ per: "late" });
    expect(raised.forecast).toEqual({ kind: "total", total: 131 });
    // The last, short week: what is left.
    expect(yearStats(gym({ period_done: 117 }), "2026-12-28").need).toEqual({ per: "week", times: 3 });
  });

  it("keeps my own days in a shared habit", () => {
    const member = (fields: Partial<GroupMember>): GroupMember => ({
      user_id: 2,
      name: "Петя",
      is_me: false,
      is_owner: false,
      done: false,
      count: 0,
      frozen: false,
      ...fields,
    });
    const group: HabitGroup = {
      id: 7,
      is_owner: true,
      notify_marks: false,
      members: [member({ user_id: 1, is_me: true, is_owner: true }), member({})],
      others_history: history([]),
      others_next_day: false,
      open_from: null,
      others_reached: false,
    };
    const base = habit({ ...flexible("week", 1), group });
    const [mine] = view(snapshot([base]), [{ type: "mark", task: 1, date: TODAY, done: true }]).habits;
    // My day counts as mine, but the week is the group's only when the others are done too.
    expect([mine.history[HISTORY_DAYS - 1], mine.period_done, mine.current_streak]).toEqual([
      true,
      1,
      0,
    ]);
    const reached = habit({ ...flexible("week", 1), group: { ...group, others_reached: true } });
    const [both] = view(snapshot([reached]), [{ type: "mark", task: 1, date: TODAY, done: true }]).habits;
    expect(both.current_streak).toBe(1);
  });
});
