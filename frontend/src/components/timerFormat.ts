/** Время «Цели по времени» на экране: часы таймера («12:34», «1:02:03») и словами
 *  («1 ч 30 мин», «45 мин»). */

import type { Strings } from "../strings";

/** Часы таймера: «мм:сс», с часа — «ч:мм:сс». */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

/** Словами, с точностью до минуты (неполная не считается): «1 ч 30 мин», «2 ч», «0 мин». */
export function duration(seconds: number, strings: Strings): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(strings.durationHours(hours));
  }
  if (minutes % 60 > 0 || hours === 0) {
    parts.push(strings.durationMinutes(minutes % 60));
  }
  return parts.join(" ");
}
