/**
 * Что было с привычкой в день `date` — для окна дня (DaySheet): статус отметки, расписание
 * и цель того дня, счёт периода «Гибкого графика», место дня в серии, у совместной —
 * сколько сделала группа.
 *
 * Всё — по данным устройства (`history`, `history_counts`, `frozen_history`,
 * `schedule_history`), как считают сетка, календарь и серии (data/derive.ts). `day` — день
 * отметки (последний день истории); `date` — не позже него.
 */

import { addDays, daysBetween } from "../data/dates";
import {
  countedHistory,
  flexiblePeriod,
  isDueOn,
  isShared,
  myDay,
  periodBounds,
  periodQuota,
  scheduleOn,
} from "../data/derive";
import type { Habit, Period, SchedulePeriod } from "../types/habit";

/** Статус дня:
 *  - `done` — выполнена и идёт в статистику; `bonus` — выполнена, но не в статистике (не по
 *    расписанию того дня, в заморозку, сверх цели периода);
 *  - `partial` — «несколько раз в день», но меньше цели;
 *  - `missed` — запланирована и не выполнена; `open` — день отметки, ещё не выполнена;
 *  - `free` — «Гибкий график», день не отмечен (пропуском не считается);
 *  - `frozen` — заморожена; `rest` — не запланирована; `before` — до первого дня привычки. */
export type DayStatus =
  | "done"
  | "bonus"
  | "partial"
  | "missed"
  | "open"
  | "free"
  | "frozen"
  | "rest"
  | "before";

/** Расписание, действовавшее в день. */
export type DaySchedule = Pick<
  SchedulePeriod,
  | "frequency_type"
  | "days"
  | "start_date"
  | "period"
  | "period_times"
  | "times_per_day"
  | "goal_unit"
>;

export interface DayInfo {
  status: DayStatus;
  schedule: DaySchedule;
  /** Цель «раз в день» в тот день (по ней день и отмечается, goalOn) и сейчас. */
  goalThen: number;
  goalNow: number;
  /** «Гибкий график» в тот день: период и сколько в нём засчитано дней из цели. */
  period: { kind: Period; start: string; end: string; done: number; quota: number } | null;
  /** Какой это день серии (засчитанный день не «Гибкого графика»); null — не в серии. */
  streak: number | null;
  /** Совместная: сколько человек выполнили свою часть из бывших в счёт; у цели больше 1 —
   *  ещё и доля дня, сделанная всеми (0…1). */
  group: { done: number; people: number; fill: number } | null;
}

export function dayInfo(habit: Habit, date: string, day: string): DayInfo {
  const historyStart = addDays(day, 1 - habit.history.length);
  const index = daysBetween(historyStart, date);
  const schedule: DaySchedule = scheduleOn(habit)(date);
  const goalThen = schedule.times_per_day;
  const frozen = habit.frozen_history[index] ?? false;
  const counted = countedHistory(habit, day);
  const mine = myDay(habit, date, day);
  const flexible = flexiblePeriod(schedule);
  const due = isDueOn(schedule, date);
  const shared = isShared(habit);

  let status: DayStatus;
  if (mine.done) {
    // В совместной `history` — дни группы: моя отметка в статистике, когда день по
    // расписанию и не заморожен.
    const inStats = shared ? (flexible !== null || due) && !frozen : counted[index];
    status = inStats ? "done" : "bonus";
  } else if (frozen) {
    status = "frozen";
  } else if (mine.count > 0) {
    status = "partial";
  } else if (flexible !== null) {
    status = date >= day ? "open" : "free";
  } else if (!due) {
    status = "rest";
  } else if (habit.started_on == null || date < habit.started_on) {
    status = date >= day ? "open" : "before";
  } else {
    status = date >= day ? "open" : "missed";
  }

  let period: DayInfo["period"] = null;
  if (flexible !== null) {
    const [start, end] = periodBounds(flexible, date);
    let done = 0;
    for (let at = start; at <= end && at <= day; at = addDays(at, 1)) {
      const position = daysBetween(historyStart, at);
      done += Number(position >= 0 && (counted[position] ?? false));
    }
    period = {
      kind: flexible,
      start,
      end,
      done,
      quota: periodQuota(schedule.period_times ?? 1, start, end),
    };
  }

  return {
    status,
    schedule,
    goalThen,
    goalNow: habit.times_per_day,
    period,
    streak: status === "done" && flexible === null ? runTo(habit, counted, index, day) : null,
    group: shared ? groupOn(habit, index, mine.done) : null,
  };
}

/** Длина серии, которая кончается днём `index` (засчитанным): назад по засчитанным дням;
 *  бонусные и незапланированные дни серию не рвут, пропуск — рвёт (compute_streaks). */
function runTo(habit: Habit, counted: readonly boolean[], index: number, day: string): number {
  const historyStart = addDays(day, 1 - habit.history.length);
  const on = scheduleOn(habit);
  let run = 0;
  for (let position = index; position >= 0; position -= 1) {
    if (counted[position]) {
      run += 1;
      continue;
    }
    const date = addDays(historyStart, position);
    if (
      !habit.history[position] &&
      !(habit.frozen_history[position] ?? false) &&
      isDueOn(on(date), date)
    ) {
      break;
    }
  }
  return run;
}

/** Совместная: кто сделал свою часть в день `index` (данные ответа сервера). */
function groupOn(habit: Habit, index: number, mineDone: boolean): DayInfo["group"] {
  const group = habit.group;
  const people = group?.people?.[index];
  if (!group || people === undefined) {
    return null;
  }
  const fill = group.fill_history?.[index] ?? 0;
  // У цели «1 раз» остальные сделали по одному разу — их число и есть сделавшие.
  const others = habit.times_per_day === 1 ? (group.others_units?.[index] ?? 0) : 0;
  return { done: others + Number(mineDone), people, fill };
}
