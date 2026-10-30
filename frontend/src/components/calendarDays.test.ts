/** Habit calendar: «18/25» day counts and the days of a month. */

import { describe, expect, it } from "vitest";

import { HISTORY_DAYS } from "../constants";
import { daysBetween } from "../data/dates";
import type { Habit } from "../types/habit";
import {
  addMonths,
  calendarMonth,
  firstMonth,
  plannedTotal,
  totalTimes,
  trackedDays,
} from "./calendarDays";

/** A habit with history up to the marking day `day`: the days `marks` done, `frozen`
 *  frozen; the first of them comes from the server as `started_on`, as in the API. */
const habit = (
  day: string,
  marks: string[],
  options: Partial<Habit> & { frozen?: string[] } = {},
): Habit => {
  const { frozen = [], ...rest } = options;
  const daysOf = (days: string[]) => {
    const flags = Array<boolean>(HISTORY_DAYS).fill(false);
    for (const at of days) {
      const index = HISTORY_DAYS - 1 - daysBetween(at, day);
      if (index >= 0) {
        flags[index] = true;
      }
    }
    return flags;
  };
  return {
    id: 1,
    name: "Бег",
    done_today: marks.includes(day),
    scheduled_today: true,
    frequency_type: "daily",
    days: [],
    start_date: null,
    history: daysOf(marks),
    current_streak: 0,
    best_streak: 0,
    total_done: marks.length,
    reminder_time: null,
    reminder_times: [],
    color: "blue",
    frozen_since: null,
    frozen_history: daysOf(frozen),
    times_per_day: 1,
    today_count: 0,
    created_on: "2026-09-01",
    started_on: [...marks, ...frozen].sort()[0] ?? null,
    auto_mark: false,
    ...rest,
  };
};

describe("trackedDays", () => {
  it("counts days from the first mark; the marking day only once done", () => {
    // 1…10 October, done on 1, 2, 5; the 10th is not over yet.
    const run = habit("2026-10-10", ["2026-10-01", "2026-10-02", "2026-10-05"]);
    expect(trackedDays(run, "2026-10-10")).toBe(9);
    const doneToday = habit("2026-10-10", ["2026-10-01", "2026-10-10"]);
    expect(trackedDays(doneToday, "2026-10-10")).toBe(10);
  });

  it("is the total when the habit has not started", () => {
    expect(trackedDays(habit("2026-10-10", []), "2026-10-10")).toBe(0);
  });

  it("counts only due days and skips frozen ones", () => {
    // Mon/Wed/Fri from Mon 5 Oct to Fri 16 Oct: 6 due days, Wed 7 frozen.
    const gym = habit("2026-10-16", ["2026-10-05", "2026-10-09"], {
      frequency_type: "specific_days",
      days: ["mon", "wed", "fri"],
      frozen: ["2026-10-07"],
    });
    // 5, 9, 12, 14 (16 — the marking day, not done).
    expect(trackedDays(gym, "2026-10-16")).toBe(4);
  });

  it("leaves out a bonus mark off the schedule", () => {
    const gym = habit("2026-10-16", ["2026-10-05", "2026-10-06"], {
      frequency_type: "specific_days",
      days: ["mon"],
    });
    // 5 (Mon, done), 12 (Mon); 6 (Tue) is a bonus mark.
    expect(trackedDays(gym, "2026-10-16")).toBe(2);
  });

  it("counts due days older than the history by the schedule", () => {
    const old = habit("2026-10-16", ["2026-10-16"], {
      started_on: "2025-10-10",
      total_done: 300,
    });
    expect(trackedDays(old, "2026-10-16")).toBe(daysBetween("2025-10-10", "2026-10-16") + 1);
  });
});

describe("calendarMonth", () => {
  it("lays the month from Monday in 6 weeks with day states", () => {
    const run = habit("2026-10-10", ["2026-10-01", "2026-10-05"], { frozen: ["2026-10-03"] });
    const days = calendarMonth(run, "2026-10", "2026-10-10");
    expect(days).toHaveLength(42);
    // 1 October 2026 is a Thursday.
    expect(days.slice(0, 3)).toEqual([null, null, null]);
    const state = (date: string) => days.find((cell) => cell?.date === date)?.state;
    expect(state("2026-10-01")).toBe("done");
    expect(state("2026-10-02")).toBe("missed");
    expect(state("2026-10-03")).toBe("frozen");
    expect(state("2026-10-10")).toBe("missed");
    expect(state("2026-10-11")).toBe("off");
    expect(days.find((cell) => cell?.today)?.date).toBe("2026-10-10");
    const before = calendarMonth(run, "2026-09", "2026-10-10");
    expect(before.find((cell) => cell?.date === "2026-09-30")?.state).toBe("off");
  });

  it("tints days off the schedule from the first day", () => {
    // Mon/Wed/Fri from Mon 5 Oct; the marking day is Fri 16 Oct.
    const gym = habit("2026-10-16", ["2026-10-05"], {
      frequency_type: "specific_days",
      days: ["mon", "wed", "fri"],
    });
    const days = calendarMonth(gym, "2026-10", "2026-10-16");
    const state = (date: string) => days.find((cell) => cell?.date === date)?.state;
    expect(state("2026-10-04")).toBe("off");
    expect(state("2026-10-06")).toBe("rest");
    expect(state("2026-10-07")).toBe("missed");
    expect(state("2026-10-17")).toBe("off");
  });

  it("starts at the first month of the history: any of its days can be changed", () => {
    const run = habit("2026-10-10", ["2026-08-20"]);
    expect(firstMonth(run, "2026-10-10")).toBe("2025-10");
    const old = habit("2026-10-10", [], { started_on: "2024-01-01" });
    expect(firstMonth(old, "2026-10-10")).toBe("2025-10");
  });
});

describe("schedule history", () => {
  it("tints past days by the schedule then in force", () => {
    // Every other day from 2026-09-01 until 2026-09-10, then daily.
    const day = "2026-09-12";
    const item = habit(day, ["2026-09-01", "2026-09-03"], {
      schedule_history: [
        {
          until: "2026-09-10",
          frequency_type: "every_other_day",
          days: [],
          start_date: "2026-09-01",
          times_per_day: 1,
        },
      ],
    });
    const states = Object.fromEntries(
      calendarMonth(item, "2026-09", day)
        .filter((cell) => cell !== null)
        .map((cell) => [cell!.date.slice(8), cell!.state]),
    );
    expect(states["02"]).toBe("rest");
    expect(states["05"]).toBe("missed");
    expect(states["06"]).toBe("rest");
    expect(states["11"]).toBe("missed");
    // 01..09: 01, 03, 05, 07, 09 due; 10, 11 daily (the marking day 12 is not over).
    expect(trackedDays(item, day)).toBe(7);
  });
});

describe("times a day", () => {
  it("counts times done out of times planned", () => {
    // 4 times a day from 6 October: 2, 3, 4, 4, and once on the marking day (the 10th).
    const day = "2026-10-10";
    const counts = Array<number>(HISTORY_DAYS).fill(0);
    counts.splice(HISTORY_DAYS - 5, 5, 2, 3, 4, 4, 1);
    const water = habit(day, ["2026-10-08", "2026-10-09"], {
      times_per_day: 4,
      history_counts: counts,
      today_count: 1,
      started_on: "2026-10-06",
    });
    expect(totalTimes(water, day)).toBe(14);
    // 5 days × 4: the marking day counts by the schedule, it is not over.
    expect(plannedTotal(water, day, "times")).toBe(20);
    expect(plannedTotal(water, day, "seconds")).toBe(0);
  });
});

describe("addMonths", () => {
  it("moves across years", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });
});
