/**
 * Календарь привычки на экране привычки: месяц по неделям с понедельника, в каждом дне —
 * что было (calendarDays.ts). Выполненный день залит цветом привычки, неполный — долей
 * цвета (как в сетке), пропущенный и незапланированный — бледным цветом привычки,
 * замороженный — голубым; до первого дня и после дня отметки — без кружка. День отметки
 * обведён.
 *
 * Листается стрелками в шапке и свайпом влево-вправо — от месяца начала истории до месяца
 * дня отметки; открывается на нём. С `onPickDay` дни истории по день отметки нажимаются —
 * открывается окно дня (DaySheet), где день можно исправить; без него (страница другого
 * участника) — только просмотр.
 */

import { useRef, useState, type CSSProperties, type TouchEvent } from "react";

import { WEEKDAYS } from "../constants";
import { useStrings } from "../preferences";
import type { Habit } from "../types/habit";
import { addMonths, calendarMonth, firstMonth, monthOf } from "./calendarDays";
import styles from "./HabitCalendar.module.css";

/** Свайп короче — не листание. */
const SWIPE_MIN_PX = 40;

interface HabitCalendarProps {
  habit: Habit;
  /** День отметки («ГГГГ-ММ-ДД»). */
  day: string;
  /** Нажали на день («ГГГГ-ММ-ДД»). */
  onPickDay?: (date: string) => void;
}

function Chevron({ back }: { back: boolean }) {
  return (
    <svg className={styles.chevron} viewBox="0 0 8 14" fill="none" aria-hidden="true">
      <path
        d={back ? "M6.5 1.5L1.5 7l5 5.5" : "M1.5 1.5L6.5 7l-5 5.5"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HabitCalendar({ habit, day, onPickDay }: HabitCalendarProps) {
  const strings = useStrings();
  const last = monthOf(day);
  const first = firstMonth(habit, day);
  const [picked, setPicked] = useState(last);
  // Месяц вне границ (сменился день или первый день) — ближайший из допустимых.
  const month = picked > last ? last : picked < first ? first : picked;
  const touch = useRef<{ x: number; y: number } | null>(null);

  function go(months: number): void {
    const next = addMonths(month, months);
    if (next >= first && next <= last) {
      setPicked(next);
    }
  }

  function onTouchStart(event: TouchEvent): void {
    const point = event.touches[0];
    touch.current = point ? { x: point.clientX, y: point.clientY } : null;
  }

  function onTouchEnd(event: TouchEvent): void {
    const start = touch.current;
    const point = event.changedTouches[0];
    touch.current = null;
    if (!start || !point) {
      return;
    }
    const dx = point.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(point.clientY - start.y)) {
      go(dx < 0 ? 1 : -1);
    }
  }

  const monthIndex = Number(month.slice(5, 7)) - 1;
  const title = `${strings.monthNames[monthIndex]} ${month.slice(0, 4)}`;
  const days = calendarMonth(habit, month, day);

  return (
    <div className={styles.calendar} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.arrow}
          aria-label={strings.calendarPrevMonth}
          disabled={month <= first}
          onClick={() => go(-1)}
        >
          <Chevron back />
        </button>
        <h3 className={styles.title} aria-live="polite">
          {title}
        </h3>
        <button
          type="button"
          className={styles.arrow}
          aria-label={strings.calendarNextMonth}
          disabled={month >= last}
          onClick={() => go(1)}
        >
          <Chevron back={false} />
        </button>
      </div>
      <div className={styles.grid}>
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className={styles.weekday} aria-hidden="true">
            {strings.weekdays[weekday].short}
          </span>
        ))}
        {days.map((cell, place) => {
          if (cell === null) {
            return <span key={place} className={styles.day} />;
          }
          const props = {
            className: `${styles.day} ${styles[cell.state]} ${cell.today ? styles.today : ""}`,
            style:
              cell.state === "partial"
                ? ({ "--dot-fill": cell.fill } as CSSProperties)
                : undefined,
            "aria-label": `${Number(cell.date.slice(8, 10))} ${strings.monthNamesOf[monthIndex]}: ${
              strings.calendarDayStates[cell.state]
            }`,
          };
          const number = Number(cell.date.slice(8, 10));
          // Исправить можно дни истории по день отметки.
          return onPickDay && cell.date <= day && cell.state !== "unknown" ? (
            <button
              key={place}
              type="button"
              {...props}
              className={`${props.className} ${styles.pickable}`}
              onClick={() => onPickDay(cell.date)}
            >
              {number}
            </button>
          ) : (
            <span key={place} {...props}>
              {number}
            </span>
          );
        })}
      </div>
    </div>
  );
}
