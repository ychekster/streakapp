/**
 * Форматирование чисел, дат и имён в админ-панели — по-английски, как и вся панель.
 * Моменты времени приходят из API в UTC («…Z») и показываются в поясе устройства; дни
 * графиков («ГГГГ-ММ-ДД») — дни по UTC, поэтому подписываются без перевода в пояс.
 */

import { ADMIN_STRINGS } from "./adminStrings";
import type { AdminUserRef } from "./types/admin";

const LOCALE = "en-US";

const countFormat = new Intl.NumberFormat(LOCALE);
const decimalFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const percentFormat = new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 0 });
const dayFormat = new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const BYTES_IN_MB = 1024 * 1024;
const BYTES_IN_KB = 1024;

/** 1234 → «1,234». */
export function formatCount(value: number): string {
  return countFormat.format(value);
}

/** 2.456 → «2.5». */
export function formatDecimal(value: number): string {
  return decimalFormat.format(value);
}

/** 0.724 → «72%». */
export function formatPercent(value: number): string {
  return percentFormat.format(value);
}

/** День графика «2026-09-22» (UTC) → «Sep 22». */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

/** Момент → «Sep 22, 2026». */
export function formatDate(moment: string): string {
  return dateFormat.format(new Date(moment));
}

/** Момент → «Sep 22, 2026 at 14:03». */
export function formatDateTime(moment: string): string {
  const date = new Date(moment);
  return `${dateFormat.format(date)} at ${timeFormat.format(date)}`;
}

/** Давность: «now», «5 minutes ago», «3 hours ago», «yesterday», дальше недели — дата. */
export function formatRelative(moment: string, now: number = Date.now()): string {
  const elapsed = now - new Date(moment).getTime();
  if (elapsed < MINUTE_MS) {
    return relativeFormat.format(0, "second");
  }
  if (elapsed < HOUR_MS) {
    return relativeFormat.format(-Math.floor(elapsed / MINUTE_MS), "minute");
  }
  if (elapsed < DAY_MS) {
    return relativeFormat.format(-Math.floor(elapsed / HOUR_MS), "hour");
  }
  if (elapsed < 7 * DAY_MS) {
    return relativeFormat.format(-Math.floor(elapsed / DAY_MS), "day");
  }
  return formatDate(moment);
}

/** Размер файла: «840 KB», «12.4 MB». */
export function formatBytes(bytes: number): string {
  return bytes >= BYTES_IN_MB
    ? `${decimalFormat.format(bytes / BYTES_IN_MB)} MB`
    : `${Math.max(1, Math.round(bytes / BYTES_IN_KB))} KB`;
}

/** Имя пользователя: имя из Telegram, иначе @username, иначе «User 123». */
export function userName(user: AdminUserRef): string {
  const name = user.first_name?.trim();
  if (name) {
    return name;
  }
  return user.username ? `@${user.username}` : ADMIN_STRINGS.unnamedUser(user.telegram_id);
}
