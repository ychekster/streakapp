/**
 * Задачи (бета): окно задачи — дата и напоминание. Открывается иконкой календаря в строке
 * задачи, пока её пишут (TodoRow → openTodoSheet), и всплывает снизу (BottomSheet), как
 * окно счёта привычки.
 *
 * Шапка — день задачи («Без даты», «Сегодня», «12 нояб.»), текст задачи и «×». Ниже:
 * «Дата» (переключатель и выбор дня) и «Напоминать» (переключатель и время). Напоминание —
 * в день задачи, поэтому без даты его нет: включённое без даты ставит сегодня, выключенная
 * дата убирает и его. Всё применяется сразу (dataStore.updateTodo); напоминание присылает
 * бот или push (bot/reminders.py).
 */

import { useEffect, useState, useSyncExternalStore } from "react";

import { dataStore } from "../data/store";
import { useAppData } from "../hooks/useAppData";
import { useReminderPush } from "../hooks/useReminderPush";
import { usePlatform } from "../platform";
import { useLanguage, useStrings } from "../preferences";
import { hapticImpact } from "../telegram/webapp";
import { pushPermission } from "../web/push";
import { BottomSheet, SheetHeader, useSheetContent } from "./BottomSheet";
import { DateField, localDate } from "./DateField";
import { ListItem } from "./ListItem";
import { Switch } from "./Switch";
import { TimeField } from "./TimeField";
import { formatTodoDate } from "./TodoRow";
import styles from "./TodoSheet.module.css";

/** Время напоминания, которое ставится при включении. */
const DEFAULT_REMIND_TIME = "09:00";

// --- Какая задача открыта (одно окно на всё приложение) ---

let openId: number | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openTodoSheet(todoId: number): void {
  openId = todoId;
  hapticImpact("light");
  emit();
}

export function closeTodoSheet(): void {
  if (openId !== null) {
    openId = null;
    emit();
  }
}

/** Id задачи открытого окна; null — окно закрыто. */
export function useTodoSheetTodo(): number | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => openId,
  );
}

export function TodoSheet() {
  const strings = useStrings();
  const language = useLanguage();
  const { todos } = useAppData();
  const web = usePlatform() === "web";
  const enableReminderPush = useReminderPush();
  const [permission, setPermission] = useState(pushPermission);
  const { shown: todoId, closing, gone } = useSheetContent(useTodoSheetTodo());
  const todo = todoId === null ? undefined : todos.find((item) => item.id === todoId);

  // Задачу удалили (здесь или на другом устройстве) — окну нечего показывать.
  useEffect(() => {
    if (!closing && todoId !== null && !todo) {
      closeTodoSheet();
    }
  }, [closing, todoId, todo]);

  if (!todo) {
    return null;
  }
  const id = todo.id;
  const date = todo.due_date ?? null;
  const time = todo.remind_time ?? null;

  const switchDate = (on: boolean): void => {
    dataStore.updateTodo(id, on ? { due_date: localDate() } : { due_date: null, remind_time: null });
  };

  const switchReminder = (on: boolean): void => {
    if (!on) {
      dataStore.updateTodo(id, { remind_time: null });
      return;
    }
    dataStore.updateTodo(id, {
      due_date: date ?? localDate(),
      remind_time: DEFAULT_REMIND_TIME,
    });
    if (web) {
      void enableReminderPush().then(setPermission);
    }
  };

  return (
    <BottomSheet closing={closing} onClose={closeTodoSheet} onGone={gone} label={todo.text}>
      <SheetHeader
        day={date ? formatTodoDate(date, strings, language) : strings.todosNoDate}
        name={todo.text}
        onClose={closeTodoSheet}
      />
      <div className={styles.rows}>
        <ListItem label={strings.todosDate}>
          <Switch checked={date !== null} onChange={switchDate} label={strings.todosDate} />
        </ListItem>
        {date !== null ? (
          <ListItem label={strings.todosDay}>
            <DateField
              value={date}
              onChange={(value) => dataStore.updateTodo(id, { due_date: value })}
              label={strings.todosDay}
            />
          </ListItem>
        ) : null}
        <ListItem label={strings.formReminderToggle}>
          <Switch
            checked={time !== null}
            onChange={switchReminder}
            label={strings.formReminderToggle}
          />
        </ListItem>
        {time !== null ? (
          <ListItem label={strings.formReminderTime}>
            <TimeField
              value={time}
              onChange={(value) => dataStore.updateTodo(id, { remind_time: value })}
              label={strings.formReminderTime}
            />
          </ListItem>
        ) : null}
      </div>
      {web && time !== null && permission === "denied" ? (
        <p className={styles.note}>{strings.notificationsDenied}</p>
      ) : null}
    </BottomSheet>
  );
}
