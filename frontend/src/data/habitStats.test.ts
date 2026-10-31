/** Habit statistics: month comparison, the trend line, weekdays and the pie. */

import { describe, expect, it } from "vitest";

import { HISTORY_DAYS } from "../constants";
import type { Habit } from "../types/habit";
import { addDays, daysBetween } from "./dates";
import {
  bestDay,
  dayBreakdown,
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
  it("compares this month so far with the same days of the last one", () => {
    const day = "2026-10-07";
    // September: 1…7 done 3 times, the rest of the month does not count.
    const marks = ["2026-08-20", "2026-09-01", "2026-09-03", "2026-09-05", "2026-09-20"];
    const { current, previous } = monthTotals(habit(day, [...marks, ...range("2026-10-01", day)]), day);
    expect(current.done).toBe(7);
    expect(current.due).toBe(7);
    expect(previous?.done).toBe(3);
    expect(previous?.due).toBe(7);
  });

  it("takes all of a shorter last month", () => {
    const day = "2026-03-31";
    const { previous } = monthTotals(habit(day, ["2026-01-10", ...range("2026-02-01", "2026-02-28")]), day);
    expect(previous?.due).toBe(28);
    expect(previous?.done).toBe(28);
  });

  it("has no last month when the habit began after its 1st", () => {
    const day = "2026-10-07";
    expect(monthTotals(habit(day, ["2026-09-10", day]), day).previous).toBeNull();
  });

  it("counts the marking day as due only once done", () => {
    const day = "2026-10-03";
    const { current } = monthTotals(habit(day, ["2026-09-01", "2026-10-01"]), day);
    expect(current).toMatchObject({ done: 1, due: 2 });
  });

  it("leaves frozen days and days off schedule out of the due ones", () => {
    const day = "2026-10-07"; // Wednesday
    const weekdays = habit(day, ["2026-09-01", "2026-10-01"], {
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
  it("draws completion over 7 days for a once-a-day habit", () => {
    const day = "2026-10-07";
    const line = trend(habit(day, range("2026-10-01", "2026-10-07")), day, "week");
    expect(line.values).toHaveLength(7);
    expect(line.dates[6]).toBe(day);
    // The habit began on Oct 1: the first point is that one day.
    expect(line.values).toEqual([100, 100, 100, 100, 100, 100, 100]);
  });

  it("is null before the habit's first day", () => {
    const day = "2026-10-07";
    expect(trend(habit(day, ["2026-10-06", day]), day, "week").values).toEqual([
      null, null, null, null, null, 100, 100,
    ]);
  });

  it("draws minutes a day, and weeks for a year", () => {
    const day = "2026-10-07";
    const timed = habit(day, ["2026-09-01"], {
      times_per_day: 1800,
      goal_unit: "seconds",
      counts: { "2026-10-06": 1200, "2026-10-07": 2400 },
    });
    const week = trend(timed, day, "week");
    expect(week.values.slice(-2)).toEqual([20, 40]);
    const year = trend(timed, day, "year");
    expect(year.values).toHaveLength(52);
    expect(year.values[51]).toBe(60);
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
