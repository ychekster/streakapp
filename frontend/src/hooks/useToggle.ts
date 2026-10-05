/**
 * Отметка привычки за день отметки.
 *
 * Применяется сразу и без ожидания сервера (data/store.ts): можно нажимать сколько
 * угодно быстро — каждое нажатие видно мгновенно, а на сервер уходит итог.
 */

import { useCallback } from "react";

import { dataStore } from "../data/store";
import { hapticImpact } from "../telegram/webapp";

export function useToggle(): (taskId: number) => void {
  return useCallback((taskId: number) => {
    hapticImpact("light");
    dataStore.toggle(taskId);
  }, []);
}
