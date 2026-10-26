/**
 * Окно дня: нажатие на день в календаре привычки (HabitCalendar → openDaySheet) открывает
 * снизу окно (BottomSheet), где этот день можно исправить — любой день истории до дня
 * отметки, и пропущенный, и уже отмеченный.
 *
 * Шапка — день, название привычки и «×». Под ней отметка по текущим настройкам привычки:
 * у «раз в день» — одна кнопка (отметить / снять), у «несколько раз в день» — счёт за день
 * (CountControls, до текущей цели; быстрые прибавки — у «Сверх плана»). В совместной —
 * моя часть. Не запланированный в тот день (или замороженный) — тоже можно: отметка
 * бонусная, в числах её нет (data/derive.ts, countedDays). Ниже — заметка к дню:
 * сохраняется, когда поле теряет фокус, при смене дня и при закрытии.
 *
 * Свайп влево — следующий день, вправо — предыдущий: новый день въезжает сбоку.
 * Отметки применяются сразу (dataStore.markDay / setDayCount / setNote).
 */

import { useEffect, useRef, useState, useSyncExternalStore, type TouchEvent } from "react";

import { NOTE_MAX_LENGTH, OVERTIME_MAX_COUNT, WEEKDAYS } from "../constants";
import { addDays, markingDay, todayIn, weekdayIndex } from "../data/dates";
import { myDay } from "../data/derive";
import { dataStore } from "../data/store";
import { useAppData } from "../hooks/useAppData";
import { useStrings } from "../preferences";
import { hapticImpact, hapticSelection } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import { BottomSheet, SheetHeader, useSheetContent } from "./BottomSheet";
import { CountControls } from "./CountControls";
import styles from "./DaySheet.module.css";

/** Свайп короче — не смена дня. */
const SWIPE_MIN_PX = 40;

// --- Какой день открыт (одно окно на всё приложение) ---

interface OpenDay {
  habitId: number;
  date: string;
}

let opened: OpenDay | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openDaySheet(habitId: number, date: string): void {
  opened = { habitId, date };
  hapticImpact("light");
  emit();
}

export function closeDaySheet(): void {
  if (opened !== null) {
    opened = null;
    emit();
  }
}

function useOpenDay(): OpenDay | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => opened,
  );
}

export function DaySheet() {
  const strings = useStrings();
  const { habits, settings } = useAppData();
  // Показанный день: после закрытия окно ещё уезжает вниз (closing) с ним же.
  const { shown, closing, gone } = useSheetContent(useOpenDay());
  // День внутри окна: свайпы меняют его, не трогая открытый.
  const [date, setDate] = useState(shown?.date ?? "");
  // Откуда въехал день: 1 — следующий (справа), -1 — предыдущий (слева), 0 — открыт.
  const [direction, setDirection] = useState(0);
  // Вводимая заметка; null — поле показывает заметку из стора.
  const [note, setNote] = useState<string | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const habit = shown ? habits.find((item) => item.id === shown.habitId) : undefined;

  useEffect(() => {
    if (shown) {
      setDate(shown.date);
      setDirection(0);
      setNote(null);
    }
  }, [shown]);
  // Привычку удалили — окну нечего показывать.
  useEffect(() => {
    if (!closing && shown && !habit) {
      closeDaySheet();
    }
  }, [closing, shown, habit]);

  if (!shown || !habit || !settings || !date) {
    return null;
  }
  const id = habit.id;
  const day = markingDay(settings.timezone, settings.mark_yesterday);
  const today = todayIn(settings.timezone);
  const mine = myDay(habit, date, day);
  const multi = habit.times_per_day > 1;

  /** Записать вводимую заметку (если её меняли). */
  function saveNote(): void {
    if (note !== null) {
      dataStore.setNote(id, date, note);
      setNote(null);
    }
  }

  function close(): void {
    saveNote();
    closeDaySheet();
  }

  function go(days: number): void {
    const next = addDays(date, days);
    if (!dataStore.editableDay(next)) {
      return;
    }
    saveNote();
    setDirection(days);
    setDate(next);
    hapticSelection();
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

  const label =
    date === today
      ? strings.countSheetToday
      : addDays(date, 1) === today
        ? strings.countSheetYesterday
        : strings.daySheetDate(
            strings.weekdays[WEEKDAYS[weekdayIndex(date)]].abbr,
            Number(date.slice(8, 10)),
            strings.monthNamesOf[Number(date.slice(5, 7)) - 1],
          );
  const noteText = note ?? habit.notes?.[date] ?? "";
  return (
    <BottomSheet
      closing={closing}
      onClose={close}
      onGone={gone}
      label={strings.daySheetLabel(habit.name, label)}
      style={habitColorStyle(habit.color)}
    >
      <SheetHeader day={label} name={habit.name} onClose={close} />
      <div className={styles.body} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          key={date}
          className={
            direction > 0 ? styles.fromNext : direction < 0 ? styles.fromPrevious : undefined
          }
        >
          {multi ? (
            <div className={styles.count}>
              <CountControls
                count={mine.count}
                goal={habit.times_per_day}
                max={habit.overtime ? OVERTIME_MAX_COUNT : habit.times_per_day}
                quick={habit.overtime === true}
                current={() => {
                  const now = dataStore.getState().habits.find((item) => item.id === id);
                  return now ? myDay(now, date, day).count : 0;
                }}
                onSet={(value) => dataStore.setDayCount(id, date, value)}
              />
            </div>
          ) : (
            <button
              type="button"
              className={`${styles.mark} ${mine.done ? styles.markDone : ""}`}
              aria-pressed={mine.done}
              aria-label={mine.done ? strings.daySheetUnmark : strings.daySheetMark}
              onClick={() => {
                hapticSelection();
                dataStore.markDay(id, date, !mine.done);
              }}
            >
              <span className={styles.markCircle} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12.75l4.5 4.5L19 7.75"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {mine.done ? strings.daySheetDone : strings.daySheetMark}
            </button>
          )}
          <textarea
            className={styles.note}
            placeholder={strings.daySheetNote}
            aria-label={strings.daySheetNote}
            maxLength={NOTE_MAX_LENGTH}
            rows={1}
            value={noteText}
            ref={grow}
            onChange={(event) => {
              setNote(event.target.value);
              grow(event.target);
            }}
            onBlur={saveNote}
          />
        </div>
      </div>
    </BottomSheet>
  );
}

/** Поле заметки — по высоте текста (окно растёт вверх), но не выше предела из стилей:
 *  дальше прокручивается. */
function grow(field: HTMLTextAreaElement | null): void {
  if (field) {
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }
}
