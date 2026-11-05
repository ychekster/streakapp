/** Habit statistics: month comparison, the trend line, weekdays and the pie. */

import { describe, expect, it } from "vitest";

import { HISTORY_DAYS } from "../constants";
import type { Habit } from "../types/habit";
import { addDays, daysBetween } from "./dates";
import {
  bestDay,
  dayBreakdown,
  monthsBefore,
  periodStart,
  monthTotals,
  statsKind,
  trend,
  weekdayRates,
} from "./habitStats";

/** A habit with history up to the marking day `day`: the days `marks` done, `frozen`
 *  frozen, `counts` — a day's count (several times a day, seconds). */
const habit = (
  day: string,
  marks: string[],
  options: Partial<Habit> & { frozen?: string[]; counts?: Record<string, number> } = {},
): Habit => {
  const { frozen = [], counts = {}, ...rest } = options;
  const indexOf = (at: string) => HISTORY_DAYS - 1 - daysBetween(at, day);
  const daysOf = (days: string[]) => {
    const flags = Array<boolean>(HISTORY_DAYS).fill(false);
    for (const at of days) {
      if (indexOf(at) >= 0) {
        flags[indexOf(at)] = true;
      }
    }
    return flags;
  };
  const historyCounts = Array<number>(HISTORY_DAYS).fill(0);
  for (const [at, count] of Object.entries(counts)) {
    historyCounts[indexOf(at)] = count;
  }
  return {
    id: 1,
    name: "Бег",
    done_today: marks.includes(day),
    scheduled_today: true,
    frequency_type: "daily",
    days: [],
    start_date: null,
    history: daysOf(marks),
    history_counts: historyCounts,
    current_streak: 0,
    best_streak: 0,
    total_done: marks.length,
    reminder_time: null,
    reminder_times: [],
    color: "blue",
    frozen_since: null,
    frozen_history: daysOf(frozen),
    times_per_day: 1,
    today_count: counts[day] ?? 0,
    created_on: "2026-01-01",
    started_on: [...marks, ...frozen].sort()[0] ?? null,
    auto_mark: false,
    ...rest,
  };
};

/** Every day from `from` to `to`. */
const range = (from: string, to: string): string[] => {
  const days: string[] = [];
  for (let at = from; at <= to; at = addDays(at, 1)) {
    days.push(at);
  }
  return days;
};

describe("statsKind", () => {
  it("tells time, times, once a day and flexible apart", () => {
    const day = "2026-10-07";
    expect(statsKind(habit(day, []))).toBe("check");
    expect(statsKind(habit(day, [], { times_per_day: 3 }))).toBe("times");
    expect(statsKind(habit(day, [], { times_per_day: 1800, goal_unit: "seconds" }))).toBe("time");
    expect(statsKind(habit(day, [], { frequency_type: "flexible", period: "week", period_times: 3 }))).toBe("flexible");
  });
});

describe("monthTotals", () => {
  it("compares the month since a month ago with the month before it", () => {
    const day = "2026-11-05";
    // 6 Sep … 5 Oct: two marks; 6 Oct … 5 Nov: 6 Oct and 1 … 5 Nov.
    const marks = ["2026-08-01", "2026-09-06", "2026-10-05", "2026-10-06"];
    const totals = monthTotals(habit(day, [...marks, ...range("2026-11-01", day)]), day);
    expect(totals.current).toMatchObject({ done: 6, due: 31 });
    expect(totals.previous).toMatchObject({ done: 2, due: 30 });
  });

  it("starts on the 1st when the month before has no such date", () => {
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
    expect(monthsBefore("2026-01-15", 1)).toBe("2025-12-15");
    expect(periodStart("2026-11-05", 1)).toBe("2026-10-06");
    expect(periodStart("2026-10-30", 1)).toBe("2026-10-01");
    expect(periodStart("2026-10-31", 1)).toBe("2026-10-01");
    const day = "2026-03-31";
    // 1 … 31 Mar (today not done: not due yet), and 1 … 28 Feb before it.
    const totals = monthTotals(habit(day, ["2026-01-10", ...range("2026-02-01", "2026-02-28")]), day);
    expect(totals.previous).toMatchObject({ done: 28, due: 28 });
    expect(totals.current).toMatchObject({ done: 0, due: 30 });
  });

  it("has no last month when the habit began after its 1st", () => {
    const day = "2026-10-07";
    expect(monthTotals(habit(day, ["2026-09-10", day]), day).previous).toBeNull();
  });

  it("counts the marking day as due only once done", () => {
    const day = "2026-10-03";
    const { current } = monthTotals(habit(day, ["2026-10-01"]), day);
    expect(current).toMatchObject({ done: 1, due: 2 });
  });

  it("leaves frozen days and days off schedule out of the due ones", () => {
    const day = "2026-10-07"; // Wednesday
    const weekdays = habit(day, ["2026-10-01"], {
      frequency_type: "specific_days",
      days: ["mon", "tue", "wed", "thu", "fri"],
      frozen: ["2026-10-02"],
    });
    // 1 Thu (done), 2 Fri (frozen), 5 Mon, 6 Tue (missed); 7 — today, not done.
    expect(monthTotals(weekdays, day).current).toMatchObject({ done: 1, due: 3 });
  });

  it("sums seconds of time goals only", () => {
    const day = "2026-10-03";
    const timed = habit(day, ["2026-09-01"], {
      times_per_day: 600,
      goal_unit: "seconds",
      counts: { "2026-10-01": 300, "2026-10-02": 900, "2026-10-03": 60 },
    });
    expect(monthTotals(timed, day).current).toMatchObject({ amount: 1260, activeDays: 3 });
  });
});

describe("trend", () => {
  it("grows by one a day while the habit is kept", () => {
    const day = "2026-10-10";
    const line = trend(habit(day, range("2026-10-01", day)), day, "month");
    // Days before Oct 1 are cut off.
    expect(line.dates[0]).toBe("2026-10-01");
    expect(line.values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("falls by one for a missed day, not below zero; today is −1 until done", () => {
    const day = "2026-10-07";
    const missed = habit(day, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", day]);
    expect(trend(missed, day, "month").values).toEqual([1, 2, 3, 4, 5, 4, 5]);
    const low = habit("2026-10-04", ["2026-10-01", "2026-10-04"]);
    expect(trend(low, "2026-10-04", "month").values).toEqual([1, 0, 0, 1]);
    const open = habit("2026-10-04", range("2026-10-01", "2026-10-03"));
    expect(trend(open, "2026-10-04", "month").values).toEqual([1, 2, 3, 2]);
  });

  it("counts the share of the goal for several times a day", () => {
    const day = "2026-10-03";
    const several = habit(day, ["2026-10-02"], {
      times_per_day: 4,
      started_on: "2026-10-01",
      counts: { "2026-10-01": 2, "2026-10-02": 4, "2026-10-03": 1 },
    });
    // Half the goal — 0, done — +1, today a quarter so far — −0.5.
    expect(trend(several, day, "month").values).toEqual([null, 0, 1, 0.5]);
  });

  it("keeps growing past the goal", () => {
    const day = "2026-10-03";
    const several = habit(day, ["2026-10-01", "2026-10-03"], {
      times_per_day: 4,
      started_on: "2026-10-01",
      counts: { "2026-10-01": 8, "2026-10-02": 3, "2026-10-03": 10 },
    });
    // Twice the goal — +2, three quarters — +0.5, two and a half times — +2.5.
    expect(trend(several, day, "month").values).toEqual([null, 2, 2.5, 5]);
    const timed = habit("2026-10-02", ["2026-10-01"], {
      times_per_day: 6000,
      goal_unit: "seconds",
      started_on: "2026-10-01",
      counts: { "2026-10-01": 7500, "2026-10-02": 0 },
    });
    // 125 of 100 minutes — +1.25; today nothing yet — −1.
    expect(trend(timed, "2026-10-02", "month").values).toEqual([null, null, 1.25, 0.25]);
  });

  it("takes a flexible period's missing marks when it ends", () => {
    const day = "2026-10-12"; // Monday
    const flexible = habit(day, ["2026-10-05", "2026-10-06"], {
      frequency_type: "flexible",
      period: "week",
      period_times: 3,
    });
    expect(trend(flexible, day, "month").values).toEqual([1, 2, 2, 2, 2, 2, 1, 1]);
  });

  it("starts the month and the quarter the day after a month (three) ago", () => {
    const day = "2026-11-05";
    const kept = habit(day, range("2026-07-01", day));
    expect(trend(kept, day, "month").dates[0]).toBe("2026-10-06");
    expect(trend(kept, day, "quarter").dates[0]).toBe("2026-08-06");
  });

  it("takes the end of each week for a year", () => {
    const day = "2026-10-07";
    const line = trend(habit(day, range("2026-01-01", day)), day, "year");
    expect(line.dates[line.dates.length - 1]).toBe(day);
    expect(line.values[line.values.length - 1]).toBe(daysBetween("2026-01-01", day) + 1);
    expect(line.values[line.values.length - 2]).toBe(daysBetween("2026-01-01", day) - 6);
  });
});

describe("weekdayRates", () => {
  it("gives completion by weekday, Monday first", () => {
    const day = "2026-10-11"; // Sunday
    // Two weeks from Monday Sep 28: every day done except both Sundays.
    const marks = range("2026-09-28", day).filter((at) => at !== "2026-10-04" && at !== day);
    const rates = weekdayRates(habit(day, marks), day);
    expect(rates.slice(0, 6)).toEqual([100, 100, 100, 100, 100, 100]);
    // Sunday Oct 4 missed; today (Oct 11) not done yet — not due.
    expect(rates[6]).toBe(0);
  });
});

describe("dayBreakdown", () => {
  it("counts done, partial, missed and frozen days", () => {
    const day = "2026-10-05";
    const several = habit(day, ["2026-10-01", "2026-10-02"], {
      times_per_day: 2,
      frozen: ["2026-10-03"],
      counts: { "2026-10-01": 2, "2026-10-02": 2, "2026-10-04": 1, "2026-10-05": 1 },
    });
    // Oct 5 — today, partial: not over yet.
    expect(dayBreakdown(several, day)).toEqual({ done: 2, partial: 1, missed: 0, frozen: 1 });
  });
});

describe("bestDay", () => {
  it("finds the day with the most reps", () => {
    const day = "2026-10-05";
    const several = habit(day, ["2026-10-01"], {
      times_per_day: 3,
      counts: { "2026-10-01": 3, "2026-10-03": 5 },
    });
    expect(bestDay(several, day)).toEqual({ amount: 5, date: "2026-10-03" });
    expect(bestDay(habit(day, []), day)).toBeNull();
  });
});
