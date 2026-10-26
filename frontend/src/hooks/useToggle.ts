/**
 * Отметка привычки за день отметки.
 *
 * Применяется сразу и без ожидания сервера (data/store.ts): можно нажимать сколько
 * угодно быстро — каждое нажатие видно мгновенно, а на сервер уходит итог.
 *
 * «Сверх плана»: серия быстрых нажатий на одну привычку (каждое — не позже BURST_GAP_MS
 * после прошлого) с BURST_MIN_TAPS нажатий показывает плашку «Отменить» (UndoToast) —
 * она возвращает счёт, бывший до серии. Пока плашка видна, серия продолжается и при
 * медленных нажатиях.
 */

import { useCallback } from "react";

import { hideUndo, showUndo } from "../components/UndoToast";
import { dataStore } from "../data/store";
import { hapticImpact } from "../telegram/webapp";

/** Нажатие не позже этого после прошлого (мс) продолжает серию. */
export const BURST_GAP_MS = 700;
/** С какого нажатия серии видна плашка «Отменить». */
export const BURST_MIN_TAPS = 5;

interface Burst {
  id: number;
  /** Счёт до первого нажатия серии. */
  before: number;
  taps: number;
  at: number;
  /** Плашка уже показана (серия идёт и при медленных нажатиях). */
  shown: boolean;
}

let burst: Burst | null = null;

/** Закончить серию (нажатие на другую привычку, окно счёта) и убрать её плашку. */
export function endBurst(): void {
  if (burst?.shown) {
    hideUndo();
  }
  burst = null;
}

/** Учесть нажатие на привычку `taskId` (до самой отметки). */
function countTap(taskId: number): void {
  const habit = dataStore.getState().habits.find((item) => item.id === taskId);
  if (!habit?.overtime || !habit.scheduled_today || habit.frozen_since !== null) {
    endBurst();
    return;
  }
  const now = Date.now();
  if (burst && burst.id === taskId && (burst.shown || now - burst.at <= BURST_GAP_MS)) {
    burst.taps += 1;
    burst.at = now;
  } else {
    endBurst();
    burst = { id: taskId, before: habit.today_count, taps: 1, at: now, shown: false };
  }
  if (burst.taps >= BURST_MIN_TAPS) {
    const { id, before } = burst;
    burst.shown = true;
    showUndo({
      name: habit.name,
      taps: burst.taps,
      undo: () => {
        burst = null;
        hapticImpact("light");
        dataStore.setCount(id, before);
      },
    });
  }
}

/** Нажатие на кнопку отметки привычки `taskId`. */
export function tapHabit(taskId: number): void {
  hapticImpact("light");
  countTap(taskId);
  dataStore.toggle(taskId);
}

export function useToggle(): (taskId: number) => void {
  return useCallback(tapHabit, []);
}
