/**
 * Calendar days as «YYYY-MM-DD» strings — the API's format. Arithmetic goes through UTC
 * midnight, so it never meets a daylight saving jump.
 */

const DAY_MS = 86_400_000;

function toTime(day: string): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

function fromTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** `day` moved by `days` (negative — back). */
export function addDays(day: string, days: number): string {
  return fromTime(toTime(day) + days * DAY_MS);
}

/** Days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

/** Number of days in the month of `day` (28…31). */
export function daysInMonth(day: string): number {
  return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();
}

/** Clock time «HH:MM» in the IANA zone `timezone` (null or unknown — UTC, as the server). */
export function clockIn(timezone: string | null, now: Date = new Date()): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
  try {
    return format(timezone ?? "UTC");
  } catch {
    return format("UTC");
  }
}

/** Weekday like Python's date.weekday(): Monday 0 … Sunday 6. */
export function weekdayIndex(day: string): number {
  return (new Date(toTime(day)).getUTCDay() + 6) % 7;
}

/** The next midnight in the IANA zone `timezone` after the moment `at` (ms) — when the
 *  day there changes (services.timer_day_end on the server). The day is taken as 24 hours:
 *  on a night the clocks change it is off by that hour. */
export function nextMidnight(timezone: string | null, at: number): number {
  const parts = (zone: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
  let list: Intl.DateTimeFormatPart[];
  try {
    list = parts(timezone ?? "UTC");
  } catch {
    list = parts("UTC");
  }
  const part = (type: string) => Number(list.find((item) => item.type === type)?.value ?? 0);
  const sinceMidnight =
    (part("hour") * 3600 + part("minute") * 60 + part("second")) * 1000 + (((at % 1000) + 1000) % 1000);
  return at - sinceMidnight + 24 * 3600 * 1000;
}

/** Today's date in the IANA zone `timezone` (null or unknown — UTC, as the server). */
export function todayIn(timezone: string | null, now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The app's marking day — as services.user_today on the server: today in the user's
 *  zone, or yesterday in the «Отмечать за вчера» mode. */
export function markingDay(
  timezone: string | null,
  markYesterday: boolean,
  now: Date = new Date(),
): string {
  const today = todayIn(timezone, now);
  return markYesterday ? addDays(today, -1) : today;
}
