// @vitest-environment jsdom
/**
 * «Сверх плана»: a run of quick presses offers «Отменить» (useToggle.ts) — only from
 * BURST_MIN_TAPS presses, and undoing puts back the count from before the run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Habit } from "../types/habit";

const habits: Partial<Habit>[] = [];
const setCount = vi.fn((id: number, value: number) => {
  const habit = habits.find((item) => item.id === id);
  if (habit) {
    habit.today_count = value;
  }
});
vi.mock("../data/store", () => ({
  dataStore: {
    getState: () => ({ habits }),
    toggle: (id: number) => {
      const habit = habits.find((item) => item.id === id);
      if (habit) {
        habit.today_count = (habit.today_count ?? 0) + 1;
      }
    },
    setCount: (id: number, value: number) => setCount(id, value),
  },
}));

// Whether the toast is on screen; a test sets it to false as if it went away by itself.
let visible = false;
type Offer = { name: string; taps: number; undo: () => void };
const showUndo = vi.fn((offer: Offer) => {
  void offer;
  visible = true;
});
const hideUndo = vi.fn(() => {
  visible = false;
});
vi.mock("../components/UndoToast", () => ({
  showUndo: (offer: Offer) => showUndo(offer),
  hideUndo: () => hideUndo(),
  undoVisible: () => visible,
}));

const { BURST_GAP_MS, BURST_MIN_TAPS, endBurst, tapHabit } = await import("./useToggle");

function overtimeHabit(id: number, fields: Partial<Habit> = {}): Partial<Habit> {
  return { id, name: "Вода", overtime: true, scheduled_today: true, frozen_since: null, today_count: 3, ...fields };
}

beforeEach(() => {
  vi.useFakeTimers();
  habits.length = 0;
  showUndo.mockClear();
  hideUndo.mockClear();
  visible = false;
  setCount.mockClear();
  endBurst();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tapHabit", () => {
  it("offers undo from the fifth quick press and puts the count back", () => {
    habits.push(overtimeHabit(1));
    for (let tap = 1; tap < BURST_MIN_TAPS; tap += 1) {
      tapHabit(1);
      vi.advanceTimersByTime(BURST_GAP_MS - 100);
    }
    expect(showUndo).not.toHaveBeenCalled();
    tapHabit(1);
    expect(showUndo).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Вода", taps: BURST_MIN_TAPS }));
    // While it is shown, a slower press still belongs to the run.
    vi.advanceTimersByTime(BURST_GAP_MS * 2);
    tapHabit(1);
    const offer = showUndo.mock.lastCall![0];
    expect(offer.taps).toBe(BURST_MIN_TAPS + 1);
    offer.undo();
    expect(setCount).toHaveBeenLastCalledWith(1, 3);
  });

  it("counts a new run from zero once the toast went away by itself", () => {
    habits.push(overtimeHabit(1));
    for (let tap = 0; tap < BURST_MIN_TAPS + 2; tap += 1) {
      tapHabit(1);
    }
    expect(showUndo).toHaveBeenLastCalledWith(expect.objectContaining({ taps: BURST_MIN_TAPS + 2 }));
    visible = false;
    showUndo.mockClear();
    for (let tap = 0; tap < BURST_MIN_TAPS - 1; tap += 1) {
      tapHabit(1);
    }
    expect(showUndo).not.toHaveBeenCalled();
    tapHabit(1);
    const offer = showUndo.mock.lastCall![0];
    expect(offer.taps).toBe(BURST_MIN_TAPS);
    offer.undo();
    // Back to the count after the first run, not before it.
    expect(setCount).toHaveBeenLastCalledWith(1, 3 + BURST_MIN_TAPS + 2);
  });

  it("starts over after a pause, on another habit, and never for plain habits", () => {
    habits.push(overtimeHabit(1), overtimeHabit(2), overtimeHabit(3, { overtime: false }));
    for (let tap = 0; tap < BURST_MIN_TAPS - 1; tap += 1) {
      tapHabit(1);
    }
    vi.advanceTimersByTime(BURST_GAP_MS + 1);
    tapHabit(1);
    tapHabit(2);
    for (let tap = 0; tap < BURST_MIN_TAPS * 2; tap += 1) {
      tapHabit(3);
    }
    expect(showUndo).not.toHaveBeenCalled();
  });
});
