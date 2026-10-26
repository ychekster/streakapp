/** The day window's facts about a day: status, the schedule then, period count, streak. */

import { describe, expect, it } from "vitest";

import { HISTORY_DAYS } from "../constants";
import { daysBetween } from "../data/dates";
import type { Habit } from "../types/habit";
import { dayInfo } from "./dayInfo";

const DAY = "2026-10-16"; // a Friday, the marking day

/** A habit with the days `marks` done and `frozen` frozen, up to DAY. */
function habit(marks: string[], fields: Partial<Habit> & { frozen?: string[] } = {}): Habit {
  const { frozen = [], ...rest } = fields;
  const daysOf = (days: string[]) => {
    const flags = Array<boolean>(HISTORY_DAYS).fill(false);
    for (const at of days) {
      flags[HISTORY_DAYS - 1 - daysBetween(at, DAY)] = true;
    }
    return flags;
  };
  return {
    id: 1,
    name: "Бег",
    done_today: marks.includes(DAY),
    scheduled_today: true,
    frequency_type: "daily",
    days: [],
    start_date: null,
    history: daysOf(marks),
    current_streak: 0,
    best_streak: 0,
    total_done: 0,
    reminder_time: null,
    reminder_times: [],
    color: "blue",
    frozen_since: null,
    frozen_history: daysOf(frozen),
    times_per_day: 1,
    today_count: 0,
    started_on: [...marks, ...frozen].sort()[0] ?? null,
    auto_mark: false,
    ...rest,
  };
}

describe("dayInfo", () => {
  it("tells done, missed, open and before the start, with the day of the streak", () => {
    const run = habit(["2026-10-10", "2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(dayInfo(run, "2026-10-14", DAY)).toMatchObject({ status: "done", streak: 3 });
    expect(dayInfo(run, "2026-10-11", DAY).status).toBe("missed");
    expect(dayInfo(run, "2026-10-15", DAY).status).toBe("missed");
    expect(dayInfo(run, DAY, DAY).status).toBe("open");
    expect(dayInfo(run, "2026-10-01", DAY).status).toBe("before");
  });

  it("tells a bonus mark off the schedule and a frozen day; bonus days do not break a run", () => {
    // Mon, Wed, Fri: Tuesday 13th done — a bonus mark.
    const gym = habit(["2026-10-12", "2026-10-13", "2026-10-14"], {
      frequency_type: "specific_days",
      days: ["mon", "wed", "fri"],
      frozen: ["2026-10-09"],
    });
    expect(dayInfo(gym, "2026-10-13", DAY).status).toBe("bonus");
    expect(dayInfo(gym, "2026-10-14", DAY)).toMatchObject({ status: "done", streak: 2 });
    expect(dayInfo(gym, "2026-10-11", DAY).status).toBe("rest");
    expect(dayInfo(gym, "2026-10-09", DAY).status).toBe("frozen");
  });

  it("judges a day by the schedule and goal then in force", () => {
    const water = habit([], {
      times_per_day: 10,
      history_counts: Array<number>(HISTORY_DAYS).fill(0),
      schedule_history: [
        {
          until: "2026-10-12",
          frequency_type: "specific_days",
          days: ["mon"],
          start_date: null,
          times_per_day: 5,
        },
      ],
    });
    const info = dayInfo(water, "2026-10-05", DAY);
    expect(info.schedule.days).toEqual(["mon"]);
    expect([info.goalThen, info.goalNow]).toEqual([5, 10]);
    expect(dayInfo(water, "2026-10-06", DAY).status).toBe("rest");
  });

  it("counts the period of «Гибкий график», past its goal a bonus", () => {
    // Twice a week: Monday, Tuesday and Wednesday done.
    const swim = habit(["2026-10-12", "2026-10-13", "2026-10-14"], {
      frequency_type: "flexible",
      period: "week",
      period_times: 2,
    });
    const info = dayInfo(swim, "2026-10-13", DAY);
    expect(info.period).toEqual({
      kind: "week",
      start: "2026-10-12",
      end: "2026-10-18",
      done: 2,
      quota: 2,
    });
    expect(info.streak).toBeNull();
    expect(dayInfo(swim, "2026-10-14", DAY).status).toBe("bonus");
    expect(dayInfo(swim, "2026-10-15", DAY).status).toBe("free");
  });
});
