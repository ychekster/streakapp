/**
 * The screen's view = the server's snapshot + changes made on the device, counted the
 * way the server counts (backend/services.py).
 */

import { describe, expect, it } from "vitest";

import { HISTORY_DAYS } from "../constants";
import type { Habit } from "../types/habit";
import type { Settings } from "../types/settings";
import { addDays, markingDay, weekdayIndex } from "./dates";
import { cleanHabitName, deriveView, isDueOn, reuseUnchanged, type Operation, type Snapshot } from "./derive";

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
