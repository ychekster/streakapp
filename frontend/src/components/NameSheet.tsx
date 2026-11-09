/**
 * Окно названия: долгое нажатие на день в календаре привычки (HabitCalendar `onHoldDay` →
 * openNameSheet) открывает снизу окно (BottomSheet) — как привычка называлась в тот день,
 * какое у неё было описание и сколько дней к тому дню они уже не менялись (namesOn по
 * name_history: прежние названия запоминает сервер при смене в форме). Для дня до первой
 * смены — первое название, счёт дней — со дня создания привычки.
 *
 * Шапка — как у окна дня: день, название того дня и «×». Только просмотр.
 */

import { useEffect, useSyncExternalStore } from "react";

import { daysBetween, markingDay, todayIn } from "../data/dates";
import { namesOn } from "../data/derive";
import { useAppData } from "../hooks/useAppData";
import { useStrings } from "../preferences";
import { hapticImpact } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import { BottomSheet, SheetHeader, useSheetContent } from "./BottomSheet";
import { dayLabel } from "./DaySheet";
import styles from "./NameSheet.module.css";

interface OpenDay {
  habitId: number;
  date: string;
}

let opened: OpenDay | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openNameSheet(habitId: number, date: string): void {
  opened = { habitId, date };
  hapticImpact("medium");
  emit();
}

export function closeNameSheet(): void {
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

export function NameSheet() {
  const strings = useStrings();
  const { habits, settings } = useAppData();
  const { shown, closing, gone } = useSheetContent(useOpenDay());
  const habit = shown ? habits.find((item) => item.id === shown.habitId) : undefined;

  // Привычку удалили — окну нечего показывать.
  useEffect(() => {
    if (!closing && shown && !habit) {
      closeNameSheet();
    }
  }, [closing, shown, habit]);

  if (!shown || !habit || !settings) {
    return null;
  }
  const date = shown.date;
  const today = todayIn(settings.timezone);
  const day = markingDay(settings.timezone, settings.mark_yesterday);
  const names = namesOn(habit, date);
  const label = dayLabel(strings, date, today);
  const since = (from: string | null): string | null =>
    from === null || from > day ? null : strings.nameSheetSince(Math.max(1, daysBetween(from, date) + 1));

  return (
    <BottomSheet
      closing={closing}
      onClose={closeNameSheet}
      onGone={gone}
      label={strings.nameSheetLabel(names.name, label)}
      style={habitColorStyle(habit.color)}
    >
      <SheetHeader day={label} name={names.name} onClose={closeNameSheet} />
      <div className={styles.rows}>
        <Row title={strings.nameSheetName} value={names.name} caption={since(names.nameSince)} />
        <Row
          title={strings.nameSheetDescription}
          value={names.description ?? strings.nameSheetNoDescription}
          muted={names.description === null}
          caption={since(names.descriptionSince)}
        />
      </div>
    </BottomSheet>
  );
}

function Row({
  title,
  value,
  caption,
  muted = false,
}: {
  title: string;
  value: string;
  caption: string | null;
  muted?: boolean;
}) {
  return (
    <div className={styles.row}>
      <p className={styles.title}>{title}</p>
      <p className={`${styles.value} ${muted ? styles.muted : ""}`}>{value}</p>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
    </div>
  );
}
