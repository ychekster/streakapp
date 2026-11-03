/**
 * Задачи (бета): строка задачи. Кружок слева — отметить выполненной (выполненная уходит в
 * блок «Выполненные» внизу) или вернуть; нажатие на текст — править его прямо в строке
 * (Enter — сохранить, пустой текст — удалить); свайп влево от правого края строки (полоса
 * EDGE_WIDTH) открывает красную кнопку «Удалить» (свайп вправо или нажатие строки
 * закрывает её). Свайп по остальной строке — экрану: «Переключение свайпом» листает
 * списки. Новая задача (карандаш) — пустая строка, сразу в правке (`startEditing`).
 * Задача списка с цветом — кружок его цвета; без списка — серый.
 *
 * Пока задачу пишут, под текстом плашки дня, напоминания и списка (TodoChips). Правка —
 * текст и плашки вместе: она заканчивается, когда фокус ушёл из строки (Enter, закрытая
 * клавиатура, закрытый выбор дня или времени), и всё сохраняется разом (`onSave`).
 * Задача с датой — подпись под текстом («Завтра в 15:00»), прошедший день у открытой —
 * красным.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
} from "react";

import { TODO_TEXT_MAX_LENGTH } from "../constants";
import { useLanguage, useStrings } from "../preferences";
import type { Strings } from "../strings";
import type { Language } from "../types/settings";
import { localDate } from "./DateField";
import { hapticImpact } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { Todo, TodoFolder } from "../types/todo";
import { TodoChips, type TodoChipsValue } from "./TodoChips";
import styles from "./TodoRow.module.css";

/** Ширина кнопки «Удалить» под строкой (px) и сдвиг, после которого она остаётся открытой. */
const DELETE_WIDTH = 88;
const OPEN_AT = DELETE_WIDTH / 2;
/** Сдвиг пальца, после которого это свайп, а не нажатие (px). */
const SWIPE_SLOP = 8;
/** Полоса у правого края строки, с которой свайп открывает «Удалить» (px). */
const EDGE_WIDTH = 28;

/** Задача после правки: текст (непустой) и плашки. */
export interface TodoDraft extends TodoChipsValue {
  text: string;
}

interface TodoRowProps {
  todo: Todo;
  onToggle: () => void;
  /** Правка закончена с непустым текстом (что-то могло и не измениться). */
  onSave: (draft: TodoDraft) => void;
  onDelete: () => void;
  /** Сразу в правке (новая, ещё пустая задача). */
  startEditing?: boolean;
  /** «Галочки справа» (настройки задач): кружок у правого края. */
  checkRight?: boolean;
  /** Свои списки задач: плашка списка и цвет кружка. */
  lists: TodoFolder[];
}

function draftOf(todo: Todo): TodoDraft {
  return {
    text: todo.text,
    due_date: todo.due_date ?? null,
    remind_time: todo.remind_time ?? null,
    folder: todo.folder,
  };
}

/** День задачи подписью: «Сегодня», «Завтра», «чт, 12 нояб.» (год — только не текущий).
 *  День считается по часам устройства — как в выборе даты (DateField). */
export function formatTodoDate(iso: string, strings: Strings, language: Language): string {
  if (iso === localDate()) {
    return strings.dateToday;
  }
  if (iso === localDate(1)) {
    return strings.dateTomorrow;
  }
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(language, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: year === new Date().getFullYear() ? undefined : "numeric",
  }).format(new Date(year, month - 1, day));
}

export function TodoRow({
  todo,
  onToggle,
  onSave,
  onDelete,
  startEditing = false,
  checkRight = false,
  lists,
}: TodoRowProps) {
  const strings = useStrings();
  const language = useLanguage();
  const done = todo.done_at !== null;
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(() => draftOf(todo));
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const swipe = useRef<{ x: number; y: number; from: number; moving: boolean } | null>(null);
  const moved = useRef(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Для конца правки, который приходит позже отрисовки (см. leaveEdit): свежая правка и
  // то, что она ещё не закончена (повторный уход фокуса не сохраняет второй раз).
  const latest = useRef(draft);
  latest.current = draft;
  const editingRef = useRef(editing);
  editingRef.current = editing;

  // Кружок — цвета списка (в правке — выбранного в плашке).
  const folder = editing ? draft.folder : todo.folder;
  const color = lists.find((item) => item.id === folder)?.color ?? null;

  // Поле правки растёт по тексту.
  useLayoutEffect(() => {
    const field = textRef.current;
    if (editing && field) {
      field.style.height = "0px";
      field.style.height = `${field.scrollHeight}px`;
    }
  }, [editing, draft.text]);

  useEffect(() => {
    if (editing) {
      const field = textRef.current;
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: "nearest" });
      field?.setSelectionRange(field.value.length, field.value.length);
    }
  }, [editing]);

  const startEdit = (): void => {
    setDraft(draftOf(todo));
    setEditing(true);
  };

  const finishEdit = (): void => {
    if (!editingRef.current) {
      return;
    }
    editingRef.current = false;
    setEditing(false);
    const text = latest.current.text.trim();
    if (text === "") {
      onDelete();
    } else {
      onSave({ ...latest.current, text });
    }
  };

  /** Фокус ушёл из поля или плашки: правка кончена, если он ушёл из строки совсем. На
   *  iPhone фокус может прийти в плашку чуть позже, чем ушёл из поля, — проверка после. */
  const leaveEdit = (event: FocusEvent<HTMLDivElement>): void => {
    const box = event.currentTarget;
    if (event.relatedTarget instanceof Node && box.contains(event.relatedTarget)) {
      return;
    }
    window.setTimeout(() => {
      if (!box.contains(document.activeElement)) {
        finishEdit();
      }
    }, 0);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    moved.current = false;
    // Открыть «Удалить» — только от правого края; открытую закрывает свайп откуда угодно.
    const right = event.currentTarget.getBoundingClientRect().right;
    if (editing || (!open && right - event.clientX > EDGE_WIDTH)) {
      swipe.current = null;
      return;
    }
    swipe.current = { x: event.clientX, y: event.clientY, from: open ? -DELETE_WIDTH : 0, moving: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const start = swipe.current;
    if (!start) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moving) {
      if (Math.abs(dy) > SWIPE_SLOP && Math.abs(dy) > Math.abs(dx)) {
        // Прокрутка списка — не свайп.
        swipe.current = null;
        return;
      }
      if (Math.abs(dx) <= SWIPE_SLOP) {
        return;
      }
      start.moving = true;
      moved.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setOffset(Math.min(0, Math.max(-DELETE_WIDTH * 1.5, start.from + dx)));
  };

  const onPointerUp = (): void => {
    const start = swipe.current;
    swipe.current = null;
    if (!start?.moving) {
      return;
    }
    const opened = offset < -OPEN_AT;
    if (opened && !open) {
      hapticImpact("light");
    }
    setOpen(opened);
    setOffset(0);
  };

  const shift = swipe.current?.moving ? offset : open ? -DELETE_WIDTH : 0;

  return (
    <div
      className={`${styles.row} ${color ? styles.colored : ""}`}
      style={color ? habitColorStyle(color) : undefined}
      data-todo={todo.id}
    >
      <button
        type="button"
        className={styles.delete}
        style={{ width: DELETE_WIDTH }}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={onDelete}
      >
        {strings.todosDelete}
      </button>
      <div
        className={[
          styles.content,
          swipe.current?.moving ? styles.dragging : "",
          checkRight ? styles.checkRight : "",
          open ? styles.open : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(event) => {
          // Конец свайпа или нажатие открытой строки — только закрыть её.
          if (moved.current || open) {
            event.stopPropagation();
            event.preventDefault();
            moved.current = false;
            setOpen(false);
          }
        }}
      >
        <button
          type="button"
          className={`${styles.check} ${done ? styles.checked : ""}`}
          aria-label={done ? strings.todosUncheck : strings.todosCheck}
          aria-pressed={done}
          onClick={onToggle}
        >
          {done ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 12.5l3.2 3.2L17 9" />
            </svg>
          ) : null}
        </button>
        <div className={styles.body} onBlur={editing ? leaveEdit : undefined}>
        {editing ? (
          <>
            <textarea
              ref={textRef}
              className={`${styles.text} ${styles.field} ${styles.withChips}`}
              value={draft.text}
              rows={1}
              maxLength={TODO_TEXT_MAX_LENGTH}
              enterKeyHint="done"
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  editingRef.current = false;
                  setEditing(false);
                }
              }}
            />
            <TodoChips
              value={draft}
              onChange={(value) => setDraft({ ...draft, ...value })}
              lists={lists}
            />
          </>
        ) : (
          <button
            type="button"
            className={`${styles.text} ${done ? styles.doneText : ""}`}
            onClick={startEdit}
          >
            {todo.text}
          </button>
        )}
        {todo.due_date && !done && !editing ? (
          <span
            className={`${styles.caption} ${todo.due_date < localDate() ? styles.overdue : ""}`}
          >
            {todo.remind_time
              ? strings.todosDateTime(
                  formatTodoDate(todo.due_date, strings, language),
                  todo.remind_time,
                )
              : formatTodoDate(todo.due_date, strings, language)}
          </span>
        ) : null}
        </div>
        {editing ? null : (
          // Полоса у правого края: с неё свайп открывает «Удалить» (экран её свайп не
          // листает); нажатие — как по тому, что под ней.
          <span
            className={styles.edge}
            style={{ width: EDGE_WIDTH }}
            aria-hidden="true"
            onClick={() => (checkRight ? onToggle() : startEdit())}
          />
        )}
      </div>
    </div>
  );
}
