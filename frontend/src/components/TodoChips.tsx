/**
 * Задачи (бета): плашки под текстом задачи, пока её пишут (TodoRow), — как в «Напоминаниях»
 * iOS: день, напоминание и список, без отдельного окна.
 *
 * Каждая плашка — подпись с иконкой, а выбор делает нативное поле, прозрачное и растянутое
 * на неё (как DateField / TimeField): <input type="date">, <input type="time">, <select>.
 * Не выбрано — серая подпись («Без срока», «Напоминание», «Без списка»), выбрано —
 * акцентная. «Сбросить» в системном выборе (пустое значение) убирает день или напоминание.
 * Напоминание — в день задачи: без дня оно ставит сегодня, убранный день убирает и его.
 * Список — только свои (рекомендуемые наполняются сами); нет своих — плашки нет.
 */

import type { MouseEvent, ReactNode } from "react";

import { useReminderPush } from "../hooks/useReminderPush";
import { useLanguage, useStrings } from "../preferences";
import type { TodoFolder } from "../types/todo";
import { localDate } from "./DateField";
import { formatTodoDate } from "./TodoRow";
import styles from "./TodoChips.module.css";

/** Что выбрано в плашках. */
export interface TodoChipsValue {
  due_date: string | null;
  remind_time: string | null;
  folder: number | null;
}

interface TodoChipsProps {
  value: TodoChipsValue;
  onChange: (value: TodoChipsValue) => void;
  /** Свои списки задач (без рекомендуемых). */
  lists: TodoFolder[];
}

function openPickerWithMouse(event: MouseEvent<HTMLInputElement>): void {
  if (!window.matchMedia("(pointer: fine)").matches) {
    return;
  }
  try {
    event.currentTarget.showPicker();
  } catch {
    // Старый браузер без showPicker — остаётся ввод с клавиатуры.
  }
}

export function TodoChips({ value, onChange, lists }: TodoChipsProps) {
  const strings = useStrings();
  const language = useLanguage();
  const enableReminderPush = useReminderPush();
  const list = lists.find((item) => item.id === value.folder) ?? null;

  return (
    <div className={styles.chips}>
      <Chip
        set={value.due_date !== null}
        icon={calendarIcon}
        label={
          value.due_date ? formatTodoDate(value.due_date, strings, language) : strings.todosAnyDay
        }
      >
        <input
          type="date"
          className={styles.native}
          aria-label={strings.todosAnyDay}
          value={value.due_date ?? ""}
          onChange={(event) => {
            const date = event.target.value || null;
            onChange({ ...value, due_date: date, remind_time: date ? value.remind_time : null });
          }}
          onClick={openPickerWithMouse}
        />
      </Chip>
      <Chip
        set={value.remind_time !== null}
        icon={clockIcon}
        label={value.remind_time ?? strings.todosRemind}
      >
        <input
          type="time"
          className={styles.native}
          aria-label={strings.todosRemind}
          value={value.remind_time ?? ""}
          onChange={(event) => {
            const time = event.target.value || null;
            onChange({
              ...value,
              remind_time: time,
              due_date: time ? (value.due_date ?? localDate()) : value.due_date,
            });
            if (time && value.remind_time === null) {
              void enableReminderPush();
            }
          }}
          onClick={openPickerWithMouse}
        />
      </Chip>
      {lists.length > 0 ? (
        <Chip set={list !== null} icon={listIcon} label={list ? list.name : strings.todosNoList}>
          <select
            className={styles.native}
            aria-label={strings.todosList}
            value={list ? String(list.id) : ""}
            onChange={(event) =>
              onChange({
                ...value,
                folder: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          >
            <option value="">{strings.todosNoList}</option>
            {lists.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.name}
              </option>
            ))}
          </select>
        </Chip>
      ) : null}
    </div>
  );
}

function Chip({
  set,
  icon,
  label,
  children,
}: {
  set: boolean;
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className={`${styles.chip} ${set ? styles.set : ""}`}>
      {icon}
      <span className={styles.label}>{label}</span>
      {children}
    </span>
  );
}

const calendarIcon = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="4" y="5.5" width="16" height="14.5" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const clockIcon = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 7.5V12l3 2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const listIcon = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M9.5 7h10M9.5 12h10M9.5 17h10"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <circle cx="5" cy="7" r="1.3" fill="currentColor" />
    <circle cx="5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="5" cy="17" r="1.3" fill="currentColor" />
  </svg>
);
