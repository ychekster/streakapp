/**
 * Форматирование чисел, дат и имён в админ-панели — на языке интерфейса (useAdminFormat).
 * Моменты времени приходят из API в UTC («…Z») и показываются в поясе устройства; дни
 * графиков («ГГГГ-ММ-ДД») — дни по UTC, поэтому подписываются без перевода в пояс.
 */

import { ADMIN_STRINGS } from "./adminStrings";
import { useLanguage } from "./preferences";
import type { AdminUserRef } from "./types/admin";
import type { Language } from "./types/settings";

const LOCALES: Record<Language, string> = { ru: "ru-RU", en: "en-US" };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const BYTES_IN_MB = 1024 * 1024;
const BYTES_IN_KB = 1024;

export interface AdminFormat {
  /** 1234 → «1 234» / «1,234». */
  count: (value: number) => string;
  /** 2.456 → «2,5» / «2.5». */
  decimal: (value: number) => string;
  /** 0.724 → «72 %» / «72%». */
  percent: (value: number) => string;
  /** День графика «2026-09-22» (UTC) → «22 сент.» / «Sep 22». */
  day: (day: string) => string;
  /** Момент → «22 сент. 2026 г.» / «Sep 22, 2026». */
  date: (moment: string) => string;
  /** Момент → «22 сент. 2026 г., 14:03» / «Sep 22, 2026 at 2:03 PM». */
  dateTime: (moment: string) => string;
  /** Давность: «сейчас», «5 минут назад», «вчера»; дальше недели — дата. */
  relative: (moment: string, now?: number) => string;
  /** Размер файла: «840 КБ», «12,4 МБ». */
  bytes: (bytes: number) => string;
  /** Имя: имя из Telegram, иначе @username, иначе «Пользователь 123». */
  userName: (user: AdminUserRef) => string;
}

function createFormat(language: Language): AdminFormat {
  const locale = LOCALES[language];
  const strings = ADMIN_STRINGS[language];
  const countFormat = new Intl.NumberFormat(locale);
  const decimalFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percentFormat = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const dayFormat = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const dateFormat = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const relativeFormat = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const date = (moment: string): string => dateFormat.format(new Date(moment));

  return {
    count: (value) => countFormat.format(value),
    decimal: (value) => decimalFormat.format(value),
    percent: (value) => percentFormat.format(value),
    day: (day) => dayFormat.format(new Date(`${day}T00:00:00Z`)),
    date,
    dateTime: (moment) => strings.dateAtTime(date(moment), timeFormat.format(new Date(moment))),
    relative: (moment, now = Date.now()) => {
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
      return date(moment);
    },
    bytes: (bytes) =>
      bytes >= BYTES_IN_MB
        ? `${decimalFormat.format(bytes / BYTES_IN_MB)} ${strings.megabytes}`
        : `${Math.max(1, Math.round(bytes / BYTES_IN_KB))} ${strings.kilobytes}`,
    userName: (user) => {
      const name = user.first_name?.trim();
      if (name) {
        return name;
      }
      return user.username ? `@${user.username}` : strings.unnamedUser(user.telegram_id);
    },
  };
}

const formats = new Map<Language, AdminFormat>();

/** Форматирование на языке `language` (форматтеры создаются один раз на язык). */
export function adminFormat(language: Language): AdminFormat {
  let format = formats.get(language);
  if (!format) {
    format = createFormat(language);
    formats.set(language, format);
  }
  return format;
}

/** Форматирование на текущем языке интерфейса. */
export function useAdminFormat(): AdminFormat {
  return adminFormat(useLanguage());
}
