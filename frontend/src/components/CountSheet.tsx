/**
 * Окно счёта привычки «несколько раз в день»: открывается удержанием кнопки отметки или
 * нажатием на неё, когда цель уже набрана (HabitBlock → openCountSheet), и всплывает снизу
 * поверх экрана (BottomSheet). Выше цели и быстрые «+1 … +100» — только у «Сверх плана».
 *
 * Шапка — день отметки, название привычки и «×»; под ней счёт за день (CountControls:
 * прогресс, «−» / число / «+», быстрые «+1 … +100», «Сбросить» и «Заполнить день»). Всё
 * применяется сразу (dataStore.setCount).
 */

import { useEffect, useSyncExternalStore } from "react";

import { dayMost, isTimed } from "../data/derive";
import { dataStore } from "../data/store";
import { useAppData } from "../hooks/useAppData";
import { useRunningTimer } from "../hooks/useTimer";
import { useStrings } from "../preferences";
import { hapticImpact } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import { BottomSheet, SheetHeader, useSheetContent } from "./BottomSheet";
import { CountControls } from "./CountControls";

// --- Какая привычка открыта (одно окно на всё приложение) ---

let openId: number | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openCountSheet(habitId: number): void {
  openId = habitId;
  hapticImpact("medium");
  emit();
}

export function closeCountSheet(): void {
  if (openId !== null) {
    openId = null;
    emit();
  }
}

/** Id привычки открытого окна; null — окно закрыто. */
export function useCountSheetHabit(): number | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => openId,
  );
}

export function CountSheet() {
  const strings = useStrings();
  const { habits, settings } = useAppData();
  // Показанная привычка: после закрытия окно ещё уезжает вниз (closing) с ней же.
  const { shown: habitId, closing, gone } = useSheetContent(useCountSheetHabit());
  const habit = habitId === null ? undefined : habits.find((item) => item.id === habitId);
  // Идёт таймер этой привычки — время дня вместе с натиканным (как на таймере).
  const running = useRunningTimer();
  // Привычку удалили, заморозили, сделали «раз в день» — окну нечего показывать.
  const usable = habit !== undefined && habit.times_per_day > 1 && habit.frozen_since === null;

  useEffect(() => {
    if (!closing && habitId !== null && !usable) {
      closeCountSheet();
    }
  }, [closing, habitId, usable]);

  if (!habit || !usable) {
    return null;
  }
  const id = habit.id;
  const live =
    running !== null && running.timer.habitId === id ? running.seconds : habit.today_count;
  return (
    <BottomSheet
      closing={closing}
      onClose={closeCountSheet}
      onGone={gone}
      label={habit.name}
      style={habitColorStyle(habit.color)}
    >
      <SheetHeader
        day={settings?.mark_yesterday ? strings.countSheetYesterday : strings.countSheetToday}
        name={habit.name}
        onClose={closeCountSheet}
      />
      <CountControls
        key={id}
        count={live}
        goal={habit.times_per_day}
        max={dayMost({
          goal: habit.times_per_day,
          overtime: habit.overtime === true,
          unit: habit.goal_unit ?? "times",
        })}
        quick={habit.overtime === true}
        timed={isTimed(habit)}
        current={() => {
          const day = dataStore.getState().today;
          return day ? dataStore.liveCount(id, day) : 0;
        }}
        onSet={(value) => dataStore.setCount(id, value)}
      />
    </BottomSheet>
  );
}
