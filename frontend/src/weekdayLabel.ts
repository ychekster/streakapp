/**
 * Подпись набора дней недели — одна для формы привычки («Повтор») и экрана привычки
 * («Цель серии»): все дни — `everyDay` («Каждый день» / «Ежедневно»), «Будние дни»,
 * «Выходные», иначе дни через запятую, последний — через «и» («Пн, Ср и Пт»); ни одного
 * дня — «Никогда».
 */

import { WEEKDAYS } from "./constants";
import type { Strings } from "./strings";

// Наборы дней с собственной подписью (коды в порядке недели, как их хранит бэкенд).
const WORKDAYS_KEY = "mon,tue,wed,thu,fri";
const WEEKENDS_KEY = "sat,sun";

export function weekdayLabel(days: Iterable<string>, strings: Strings, everyDay: string): string {
  const chosen = new Set(days);
  const selected = WEEKDAYS.filter((code) => chosen.has(code));
  if (selected.length === 0) {
    return strings.daysNever;
  }
  if (selected.length === WEEKDAYS.length) {
    return everyDay;
  }
  const key = selected.join(",");
  if (key === WORKDAYS_KEY) {
    return strings.daysWorkdays;
  }
  if (key === WEEKENDS_KEY) {
    return strings.daysWeekends;
  }
  return strings.daysList(selected.map((code) => strings.weekdays[code].abbr));
}
