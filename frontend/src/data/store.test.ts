// @vitest-environment jsdom
/**
 * Changes kept on the device and sent to the server later (store.ts): quick taps go as
 * one request, nothing is lost without a connection, the app opens on the kept data.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../api/client";
import { HISTORY_DAYS, SYNC_DELAY_MS } from "../constants";
import type { Habit, HabitGroup } from "../types/habit";
import type { Settings } from "../types/settings";
import type { SyncOperation, SyncResponse } from "../types/sync";

const syncChanges = vi.fn<(ops: SyncOperation[], keepalive?: boolean) => Promise<SyncResponse>>();
vi.mock("../api/sync", () => ({ syncChanges: (...args: [SyncOperation[], boolean?]) => syncChanges(...args) }));

const TODAY = "2026-10-05";

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

function habit(fields: Partial<Habit> = {}): Habit {
  return {
    id: 1,
    name: "Зарядка",
    done_today: false,
    scheduled_today: true,
    frequency_type: "daily",
    days: [],
    start_date: null,
    history: Array<boolean>(HISTORY_DAYS).fill(false),
    current_streak: 0,
    best_streak: 0,
    total_done: 0,
    reminder_time: null,
    reminder_times: [],
    color: "blue",
    frozen_since: null,
    frozen_history: Array<boolean>(HISTORY_DAYS).fill(false),
    times_per_day: 1,
    today_count: 0,
    auto_mark: false,
    ...fields,
  };
}

/** A habit marked done on the marking day, as the server returns it. */
function doneHabit(fields: Partial<Habit> = {}): Habit {
  const history = Array<boolean>(HISTORY_DAYS).fill(false);
  history[HISTORY_DAYS - 1] = true;
  return habit({ done_today: true, history, current_streak: 1, best_streak: 1, total_done: 1, ...fields });
}

function answer(habits: Habit[], results: SyncResponse["results"] = []): SyncResponse {
  return { results, habits, settings: SETTINGS, folders: [], all_habits_position: 0, today: TODAY };
}

async function freshStore() {
  vi.resetModules();
  const module = await import("./store");
  return module.dataStore;
}

/** Let pending promises (the request and its handling) run. */
async function settle(): Promise<void> {
  for (let step = 0; step < 5; step += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  localStorage.clear();
  localStorage.setItem("streak:session", "token-1");
  syncChanges.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dataStore", () => {
  it("loads the state, then sends quick taps as one change", async () => {
    syncChanges.mockResolvedValueOnce(answer([habit()]));
    const store = await freshStore();
    store.start();
    expect(store.getState().status).toBe("loading");
    await settle();
    expect(syncChanges).toHaveBeenLastCalledWith([], false);
    expect(store.getState().status).toBe("ready");

    store.toggle(1);
    store.toggle(1);
    store.toggle(1);
    expect(store.getState().habits[0].done_today).toBe(true);
    expect(syncChanges).toHaveBeenCalledTimes(1);

    syncChanges.mockResolvedValueOnce(answer([doneHabit()], [{ ok: true, id: null, error: null }]));
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(syncChanges).toHaveBeenCalledTimes(2);
    expect(syncChanges.mock.calls[1][0]).toEqual([
      { type: "mark", task: 1, date: TODAY, done: true },
    ]);
    expect(store.getState().habits[0].done_today).toBe(true);
    expect(localStorage.getItem("streak:changes")).toContain('"value":[]');
  });

  it("counts past the goal with «Сверх плана» and sets the count from the count window", async () => {
    syncChanges.mockResolvedValueOnce(answer([habit({ times_per_day: 2, today_count: 1, overtime: true })]));
    const store = await freshStore();
    store.start();
    await settle();

    store.toggle(1);
    expect(store.getState().habits[0]).toMatchObject({ today_count: 2, done_today: true });
    // Past the goal a press keeps counting instead of starting the day over.
    store.toggle(1);
    expect(store.getState().habits[0]).toMatchObject({ today_count: 3, done_today: true });
    store.setCount(1, 1);
    expect(store.getState().habits[0]).toMatchObject({ today_count: 1, done_today: false });
    store.setCount(1, 2500000);
    expect(store.getState().habits[0]).toMatchObject({ today_count: 999999, done_today: true });
    store.setCount(1, -3);
    expect(store.getState().habits[0]).toMatchObject({ today_count: 0, done_today: false });
  });

  it("changes any day of the history from the day window, and notes to it", async () => {
    syncChanges.mockResolvedValueOnce(
      answer([habit({ times_per_day: 3, history_counts: Array<number>(HISTORY_DAYS).fill(0) })]),
    );
    const store = await freshStore();
    store.start();
    await settle();

    const past = "2026-09-30";
    store.setDayCount(1, past, 2);
    store.setDayCount(1, past, 9); // past the goal without «Сверх плана» — the goal
    store.markDay(1, "2026-10-06", true); // after the marking day — nothing
    store.setNote(1, past, "  Бегал  ");
    store.setNote(1, past, "Бегал 5 км");
    const [shown] = store.getState().habits;
    expect(shown.history_counts?.[HISTORY_DAYS - 6]).toBe(3);
    expect(shown.history[HISTORY_DAYS - 6]).toBe(true);
    expect(shown.notes).toEqual({ [past]: "Бегал 5 км" });

    syncChanges.mockResolvedValueOnce(answer([habit()]));
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(syncChanges.mock.calls[1][0]).toEqual([
      { type: "mark", task: 1, date: past, done: true, count: 3 },
      { type: "note", task: 1, date: past, text: "Бегал 5 км" },
    ]);
  });

  it("a tap on a calendar day counts up to the goal and starts over, «Сверх плана» too", async () => {
    syncChanges.mockResolvedValueOnce(
      answer([
        habit({ times_per_day: 2, overtime: true, history_counts: Array<number>(HISTORY_DAYS).fill(0) }),
      ]),
    );
    const store = await freshStore();
    store.start();
    await settle();
    const past = "2026-10-01";
    const countOf = () => store.getState().habits[0].history_counts?.[HISTORY_DAYS - 5];
    store.toggleDay(1, past);
    store.toggleDay(1, past);
    expect(countOf()).toBe(2);
    expect(store.getState().habits[0].history[HISTORY_DAYS - 5]).toBe(true);
    store.toggleDay(1, past);
    expect(countOf()).toBe(0);
    // Past the goal (set in the day window) — a tap starts the day over too.
    store.setDayCount(1, past, 7);
    store.toggleDay(1, past);
    expect(countOf()).toBe(0);
  });

  it("marks a habit not due today: a bonus mark", async () => {
    syncChanges.mockResolvedValueOnce(answer([habit({ scheduled_today: false })]));
    const store = await freshStore();
    store.start();
    await settle();
    store.toggle(1);
    const [shown] = store.getState().habits;
    expect(shown.done_today).toBe(true);
  });

  it("sends every unsent change before logging out, or says it could not", async () => {
    syncChanges.mockResolvedValueOnce(answer([habit()]));
    const store = await freshStore();
    store.start();
    await settle();

    syncChanges.mockRejectedValueOnce(new ApiRequestError(0, "network_error", ""));
    store.toggle(1);
    expect(await store.sendAll()).toBe(false);

    syncChanges.mockResolvedValueOnce(answer([doneHabit()], [{ ok: true, id: null, error: null }]));
    expect(await store.sendAll()).toBe(true);
    expect(syncChanges.mock.lastCall?.[0]).toEqual([
      { type: "mark", task: 1, date: TODAY, done: true },
    ]);
  });

  it("keeps changes without a connection and opens on them", async () => {
    syncChanges.mockResolvedValueOnce(answer([habit()]));
    const store = await freshStore();
    store.start();
    await settle();

    syncChanges.mockRejectedValue(new ApiRequestError(0, "network_error", ""));
    store.toggle(1);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(store.getState().habits[0].done_today).toBe(true);

    // The app is closed and opened again, still offline: the change is there.
    const reopened = await freshStore();
    reopened.start();
    expect(reopened.getState().status).toBe("ready");
    expect(reopened.getState().habits[0].done_today).toBe(true);

    // The connection is back: the change goes out.
    syncChanges.mockResolvedValue(answer([doneHabit()], [{ ok: true, id: null, error: null }]));
    window.dispatchEvent(new Event("online"));
    await settle();
    const sent = syncChanges.mock.calls[syncChanges.mock.calls.length - 1][0];
    expect(sent).toEqual([{ type: "mark", task: 1, date: TODAY, done: true }]);
    expect(reopened.getState().habits[0].done_today).toBe(true);
  });

  it("keeps the id of a habit created on the device after the server answers", async () => {
    syncChanges.mockResolvedValueOnce(answer([]));
    const store = await freshStore();
    store.start();
    await settle();

    const created = store.createHabit({
      name: "Чтение",
      frequency_type: "daily",
      days: [],
      start_date: null,
      reminder_time: null,
      color: "green",
      times_per_day: 1,
      auto_mark: false,
    });
    expect(created.id).toBeLessThan(0);
    store.toggle(created.id);

    syncChanges.mockResolvedValueOnce(
      answer([doneHabit({ id: 42, name: "Чтение", color: "green" })], [
        { ok: true, id: 42, error: null },
        { ok: true, id: null, error: null },
      ]),
    );
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    const [op] = syncChanges.mock.calls[1][0];
    expect(op).toMatchObject({ type: "create", habit: { name: "Чтение" } });
    expect(store.getState().habits.map((item) => item.id)).toEqual([created.id]);

    // Later changes reach the habit by its server id.
    store.toggle(created.id);
    syncChanges.mockResolvedValueOnce(answer([habit({ id: 42 })], [{ ok: true, id: null, error: null }]));
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(syncChanges.mock.calls[2][0]).toEqual([{ type: "mark", task: 42, date: TODAY, done: false }]);
  });

  it("checks a new habit as the server would", async () => {
    syncChanges.mockResolvedValueOnce(answer([habit()]));
    const store = await freshStore();
    store.start();
    await settle();
    const input = { name: "  зарядка ", frequency_type: "daily" as const, days: [], start_date: null, reminder_time: null, color: "blue" as const, times_per_day: 1, auto_mark: false };
    // Names may repeat; an empty one may not.
    expect(() => store.createHabit(input)).not.toThrow();
    expect(() => store.updateHabit(1, input)).not.toThrow();
    expect(() => store.createHabit({ ...input, name: "  " })).toThrow(expect.objectContaining({ code: "invalid_name" }));
  });

  it("does not send a habit created and deleted before sending", async () => {
    syncChanges.mockResolvedValueOnce(answer([]));
    const store = await freshStore();
    store.start();
    await settle();
    const created = store.createHabit({
      name: "Черновик",
      frequency_type: "daily",
      days: [],
      start_date: null,
      reminder_time: null,
      color: "blue",
      times_per_day: 1,
      auto_mark: false,
    });
    store.toggle(created.id);
    store.deleteHabit(created.id);
    expect(store.getState().habits).toEqual([]);
    syncChanges.mockResolvedValueOnce(answer([]));
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(syncChanges.mock.calls[1][0]).toEqual([]);
  });

  it("reports a change the server refused", async () => {
    syncChanges.mockResolvedValueOnce(answer([]));
    const store = await freshStore();
    store.start();
    await settle();
    store.saveSettings({ theme: "dark" });
    expect(store.getState().settings?.theme).toBe("dark");
    syncChanges.mockResolvedValueOnce(
      answer([], [{ ok: false, id: null, error: { code: "invalid_theme", message: "" } }]),
    );
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(store.getState().settings?.theme).toBe("system");
    expect(store.getState().saveError).toMatchObject({ code: "invalid_theme" });
  });

  it("does not show another account's data", async () => {
    syncChanges.mockResolvedValueOnce(answer([habit()]));
    const store = await freshStore();
    store.start();
    await settle();

    localStorage.setItem("streak:session", "token-2");
    syncChanges.mockReturnValueOnce(new Promise(() => undefined));
    const other = await freshStore();
    other.start();
    expect(other.getState().status).toBe("loading");
    expect(other.getState().habits).toEqual([]);
  });
  it("keeps folders on the device and names them by server id once created", async () => {
    syncChanges.mockResolvedValueOnce(answer([habit(), habit({ id: 2, name: "Бег" })]));
    const store = await freshStore();
    store.start();
    await settle();

    const id = store.createFolder(" Утро ", [2]);
    store.orderFolders([id, null]);
    expect(store.getState().folders).toEqual([
      { id, name: "Утро", habits: [2], types: [], picked: [2], kind: null },
    ]);
    expect(store.getState().allHabitsPosition).toBe(1);

    const ref = (JSON.parse(localStorage.getItem("streak:changes")!).value[0].ref);
    syncChanges.mockResolvedValueOnce({
      ...answer(
        [habit(), habit({ id: 2, name: "Бег" })],
        [
          { ok: true, id: 7, error: null },
          { ok: true, id: null, error: null },
        ],
      ),
      folders: [{ id: 7, name: "Утро", habits: [2], kind: null }],
      all_habits_position: 1,
    });
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(syncChanges.mock.calls[1][0]).toEqual([
      { type: "folder_create", ref, folder: { name: " Утро ", habits: [2], types: [] } },
      { type: "folder_order", order: [ref, null] },
    ]);
    // The same id on screen after the server answered.
    expect(store.getState().folders).toEqual([
      { id, name: "Утро", habits: [2], types: [], picked: [2], kind: null },
    ]);

    store.updateFolder(id, "Вечер", [1, 2]);
    expect(store.getState().folders).toEqual([
      { id, name: "Вечер", habits: [1, 2], types: [], picked: [1, 2], kind: null },
    ]);
    expect(JSON.parse(localStorage.getItem("streak:changes")!).value).toEqual([
      { type: "folder_update", key: 7, folder: { name: "Вечер", habits: [1, 2], types: [] } },
    ]);
    store.deleteFolder(id);
    expect(store.getState().folders).toEqual([]);
    expect(store.getState().allHabitsPosition).toBe(0);
  });

  it("puts all habits of a folder's types into it, new ones too", async () => {
    syncChanges.mockResolvedValueOnce(
      answer([habit(), habit({ id: 2, name: "Бег", group: { id: 5 } as HabitGroup })]),
    );
    const store = await freshStore();
    store.start();
    await settle();

    const id = store.createFolder("Вместе", [1], undefined, ["group"]);
    expect(store.getState().folders[0]).toMatchObject({
      habits: [1, 2],
      types: ["group"],
      picked: [1],
    });
    store.updateFolder(id, "Вместе", [], ["personal"]);
    expect(store.getState().folders[0]).toMatchObject({ habits: [1], picked: [] });
  });

  it("tells frozen habits from those not due today", async () => {
    syncChanges.mockResolvedValueOnce(
      answer([
        habit(),
        habit({ id: 2, name: "Бег", frozen_since: "2026-10-01", scheduled_today: false }),
        habit({ id: 3, name: "Йога", scheduled_today: false }),
      ]),
    );
    const store = await freshStore();
    store.start();
    await settle();

    store.createFolder("Лёд", [], undefined, ["frozen"]);
    store.createFolder("Потом", [], undefined, ["unscheduled"]);
    expect(store.getState().folders.map((folder) => folder.habits)).toEqual([[2], [3]]);
  });

  it("fills a recommended folder with today's unfinished habits by itself", async () => {
    syncChanges.mockResolvedValueOnce(
      answer([
        habit(),
        habit({ id: 2, name: "Бег" }),
        habit({ id: 3, name: "Йога", scheduled_today: false }),
      ]),
    );
    const store = await freshStore();
    store.start();
    await settle();

    const id = store.createFolder("Невыполненные", [3], "unfinished");
    store.updateFolder(id, "Не сделано", [3]);
    expect(store.getState().folders).toEqual([
      { id, name: "Не сделано", habits: [1, 2], types: [], picked: [], kind: "unfinished" },
    ]);
    // The habits are worked out on the device; the server is told only the kind.
    expect(JSON.parse(localStorage.getItem("streak:changes")!).value[0].folder).toEqual({
      name: "Не сделано",
      habits: [],
      kind: "unfinished",
    });

    store.toggle(2);
    expect(store.getState().folders[0].habits).toEqual([1]);
  });

  it("runs a timer of a time goal: its time goes to the day when stopped", async () => {
    const timed = habit({ times_per_day: 600, goal_unit: "seconds", history_counts: [] });
    syncChanges.mockResolvedValueOnce(answer([timed]));
    const store = await freshStore();
    store.start();
    await settle();

    store.toggle(1);
    expect(store.getState().timer).toEqual({
      habitId: 1,
      date: TODAY,
      startedAt: Date.parse(`${TODAY}T12:00:00Z`),
    });
    vi.setSystemTime(new Date(`${TODAY}T12:03:00Z`));
    expect(store.timerSeconds()).toBe(180);
    expect(store.tickTimer()).toBe(false);

    store.toggle(1);
    expect(store.getState().timer).toBeNull();
    expect(store.getState().habits[0]).toMatchObject({ today_count: 180, done_today: false });

    syncChanges.mockResolvedValueOnce(answer([timed]));
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    // The start merged away: only the day's seconds and the timer taken off.
    expect(syncChanges.mock.calls[1][0]).toEqual([
      { type: "mark", task: 1, date: TODAY, done: false, count: 180 },
      { type: "timer", task: null },
    ]);
  });

  it("marks the day done when the timer reaches the goal, and goes on with «Сверх плана»", async () => {
    const plain = habit({ times_per_day: 600, goal_unit: "seconds" });
    const overtime = habit({ id: 2, name: "Чтение", times_per_day: 600, goal_unit: "seconds", overtime: true });
    syncChanges.mockResolvedValueOnce(answer([plain, overtime]));
    const store = await freshStore();
    store.start();
    await settle();

    store.startTimer(1);
    vi.setSystemTime(new Date(`${TODAY}T12:11:00Z`));
    // Without «Сверх плана» it stops at the goal.
    expect(store.tickTimer()).toBe(true);
    expect(store.getState().timer).toBeNull();
    expect(store.getState().habits[0]).toMatchObject({ today_count: 600, done_today: true });

    store.startTimer(2);
    vi.setSystemTime(new Date(`${TODAY}T12:21:30Z`));
    expect(store.tickTimer()).toBe(true);
    expect(store.getState().habits[1]).toMatchObject({ today_count: 630, done_today: true });
    // Still running, from the moment the goal was banked.
    expect(store.getState().timer).toMatchObject({ habitId: 2, startedAt: Date.now() });
    expect(store.tickTimer()).toBe(false);
  });

  it("stops the running timer when another one starts", async () => {
    const first = habit({ times_per_day: 600, goal_unit: "seconds" });
    const second = habit({ id: 2, name: "Чтение", times_per_day: 600, goal_unit: "seconds" });
    syncChanges.mockResolvedValueOnce(answer([first, second]));
    const store = await freshStore();
    store.start();
    await settle();

    store.startTimer(1);
    vi.setSystemTime(new Date(`${TODAY}T12:01:00Z`));
    store.startTimer(2);
    expect(store.getState().habits[0].today_count).toBe(60);
    expect(store.getState().timer?.habitId).toBe(2);
  });

  it("edits the day's time with the timer running: from what the timer shows, it goes on", async () => {
    const timed = habit({ times_per_day: 4800, goal_unit: "seconds", today_count: 3600 });
    syncChanges.mockResolvedValueOnce(answer([timed]));
    const store = await freshStore();
    store.start();
    await settle();

    store.startTimer(1);
    vi.setSystemTime(new Date(`${TODAY}T12:03:00Z`));
    // The window shows the timer's time, not only the banked hour.
    expect(store.liveCount(1, TODAY)).toBe(3780);
    store.setCount(1, store.liveCount(1, TODAY) + 60);
    expect(store.getState().habits[0].today_count).toBe(3840);
    expect(store.getState().timer).toMatchObject({ habitId: 1, startedAt: Date.now() });
    vi.setSystemTime(new Date(`${TODAY}T12:04:00Z`));
    expect(store.timerSeconds()).toBe(3900);
  });

  it("shows a timer started on another device", async () => {
    const timed = habit({ times_per_day: 600, goal_unit: "seconds", today_count: 120 });
    syncChanges.mockResolvedValueOnce({
      ...answer([timed]),
      timer: { task: 1, date: TODAY, started_at: `${TODAY}T11:58:00Z` },
    });
    const store = await freshStore();
    store.start();
    await settle();
    expect(store.getState().timer?.habitId).toBe(1);
    expect(store.timerSeconds()).toBe(240);
  });
});
