/**
 * Задачи (бета): плашки под текстом задачи, пока её пишут (TodoRow), — как в «Напоминаниях»
 * iOS: день, напоминание и список, без отдельного окна.
 *
 * Каждая плашка — подпись с иконкой, а выбор делает нативное поле, прозрачное и растянутое
 * на неё (как DateField / TimeField): <input type="date">, <input type="time">, <select>.
 * Не выбрано — серая подпись («Без срока», «Напоминание», «Без списка»), выбрано —
 * акцентная. Крестик на выбранной плашке (или «Сбросить» в системном выборе) убирает день
 * или напоминание.
 * Напоминание — в день задачи: без дня оно ставит «сегодня» (день отметки `today`), убранный день убирает и его.
 * Список — только свои (рекомендуемые наполняются сами); последний пункт меню — «Новый
 * список…»: окно снизу (NewFolderSheet в TodoRow, `onNewList`) создаёт его и выбирает.
 * Своих нет и создать больше нельзя — плашки нет.
 *
 * Ленту листает и сам палец (`useStripDrag`): iOS с открытой клавиатурой новой задачи не
 * всегда листает её сама. Если система листает, лента и так там, где палец, и подстраховка
 * ничего не делает. Последней в ленте — красный кружок с
 * корзиной (`onRemove`): удалить задачу.
 */

import { useRef, type MouseEvent, type ReactNode, type TouchEvent } from "react";

import { useReminderPush } from "../hooks/useReminderPush";
import { useLanguage, useStrings } from "../preferences";
import type { TodoFolder } from "../types/todo";
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
  /** «Сегодня» задач — день отметки (в «Отмечать за вчера» — вчера). */
  today: string;
  /** «Новый список…» в меню списка; нет — пункта нет (больше списков нельзя). */
  onNewList?: () => void;
  /** Удалить задачу (красный кружок с корзиной в конце ленты). */
  onRemove?: () => void;
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

/** Пункт меню списка «Новый список…». */
const NEW_LIST = "new";

export function TodoChips({
  value,
  onChange,
  lists,
  today,
  onNewList,
  onRemove,
}: TodoChipsProps) {
  const strings = useStrings();
  const language = useLanguage();
  const enableReminderPush = useReminderPush();
  const list = lists.find((item) => item.id === value.folder) ?? null;
  const drag = useStripDrag();

  return (
    <div className={styles.chips} {...drag}>
      <Chip
        set={value.due_date !== null}
        icon={calendarIcon}
        clearLabel={strings.todosClearDate}
        onClear={() => onChange({ ...value, due_date: null, remind_time: null })}
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
        clearLabel={strings.todosClearRemind}
        onClear={() => onChange({ ...value, remind_time: null })}
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
              due_date: time ? (value.due_date ?? today) : value.due_date,
            });
            if (time && value.remind_time === null) {
              void enableReminderPush();
            }
          }}
          onClick={openPickerWithMouse}
        />
      </Chip>
      {lists.length > 0 || onNewList ? (
        <Chip set={list !== null} icon={listIcon} label={list ? list.name : strings.todosNoList}>
          <select
            className={styles.native}
            aria-label={strings.todosList}
            value={list ? String(list.id) : ""}
            onChange={(event) => {
              if (event.target.value === NEW_LIST) {
                // Выбор остаётся прежним, пока список не создан.
                event.target.value = list ? String(list.id) : "";
                onNewList?.();
                return;
              }
              onChange({
                ...value,
                folder: event.target.value === "" ? null : Number(event.target.value),
              });
            }}
          >
            <option value="">{strings.todosNoList}</option>
            {lists.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.name}
              </option>
            ))}
            {onNewList ? <option value={NEW_LIST}>{strings.todosNewList}</option> : null}
          </select>
        </Chip>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          className={styles.remove}
          aria-label={strings.todosDelete}
          // Поле текста не теряет фокус до удаления (клавиатура не прыгает).
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRemove}
        >
          {trashIcon}
        </button>
      ) : null}
    </div>
  );
}

function Chip({
  set,
  icon,
  label,
  clearLabel,
  onClear,
  children,
}: {
  set: boolean;
  icon: ReactNode;
  label: string;
  /** Крестик на выбранной плашке: убрать выбор. */
  clearLabel?: string;
  onClear?: () => void;
  children: ReactNode;
}) {
  return (
    <span className={`${styles.chip} ${set ? styles.set : ""}`}>
      {icon}
      <span className={styles.label}>{label}</span>
      {children}
      {set && onClear ? (
        <button
          type="button"
          className={styles.clear}
          aria-label={clearLabel}
          // Фокус остаётся в поле текста: правка задачи не заканчивается.
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
        >
          {clearIcon}
        </button>
      ) : null}
    </span>
  );
}

const clearIcon = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

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

const trashIcon = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 7h14M10 4h4M7 7l.8 11.2a2 2 0 0 0 2 1.8h4.4a2 2 0 0 0 2-1.8L17 7M10.5 11v5M13.5 11v5"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Сдвиг пальца (px), после которого понятно направление: вбок — листаем ленту. */
const DRAG_SLOP = 6;

/** Лента идёт за пальцем вбок: прокрутка ставится туда, где палец, только если система её
 *  туда не довела (не листает — листаем сами). */
function useStripDrag() {
  const start = useRef<{ x: number; y: number; scroll: number; axis: "x" | "y" | null } | null>(
    null,
  );
  return {
    onTouchStart(event: TouchEvent<HTMLDivElement>): void {
      const touch = event.touches[0];
      start.current =
        touch && event.touches.length === 1
          ? { x: touch.clientX, y: touch.clientY, scroll: event.currentTarget.scrollLeft, axis: null }
          : null;
    },
    onTouchMove(event: TouchEvent<HTMLDivElement>): void {
      const state = start.current;
      const touch = event.touches[0];
      if (!state || !touch) {
        return;
      }
      const dx = touch.clientX - state.x;
      const dy = touch.clientY - state.y;
      if (state.axis === null && Math.hypot(dx, dy) > DRAG_SLOP) {
        state.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (state.axis !== "x") {
        return;
      }
      const strip = event.currentTarget;
      const wanted = state.scroll - dx;
      if (Math.abs(strip.scrollLeft - wanted) > 2) {
        strip.scrollLeft = wanted;
      }
    },
    onTouchEnd(): void {
      start.current = null;
    },
    onTouchCancel(): void {
      start.current = null;
    },
  };
}
