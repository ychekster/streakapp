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
    color: "blue",
    frozen_since: null,
    frozen_history: history([]),
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
  });

  it("cleans names as the server does", () => {
    expect(cleanHabitName("  Бег\n по\tутрам  ")).toBe("Бег по утрам");
  });
});

describe("deriveView", () => {
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
      },
    };
    const result = view(snapshot([base]), [
      created,
      { type: "mark", task: "device-1", date: TODAY, done: true },
      {
        type: "update",
        task: 1,
        habit: { name: "Бег", frequency_type: "specific_days", days: ["sun"], start_date: null, reminder_time: null, color: "red" },
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
