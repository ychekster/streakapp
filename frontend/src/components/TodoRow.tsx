/**
 * Задачи (бета): строка задачи. Кружок слева — отметить выполненной (выполненная уходит в
 * блок «Выполненные» внизу) или вернуть; нажатие на текст — править его прямо в строке
 * (Enter — сохранить, пустой текст — удалить); свайп влево открывает красную кнопку
 * «Удалить» (свайп вправо или нажатие строки закрывает её). Новая задача (карандаш) —
 * пустая строка, сразу в правке (`startEditing`).
 */

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";

import { TODO_TEXT_MAX_LENGTH } from "../constants";
import { useStrings } from "../preferences";
import { hapticImpact } from "../telegram/webapp";
import type { Todo } from "../types/todo";
import styles from "./TodoRow.module.css";

/** Ширина кнопки «Удалить» под строкой (px) и сдвиг, после которого она остаётся открытой. */
const DELETE_WIDTH = 88;
const OPEN_AT = DELETE_WIDTH / 2;
/** Сдвиг пальца, после которого это свайп, а не нажатие (px). */
const SWIPE_SLOP = 8;

interface TodoRowProps {
  todo: Todo;
  onToggle: () => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
  /** Сразу в правке (новая, ещё пустая задача). */
  startEditing?: boolean;
}

export function TodoRow({ todo, onToggle, onEdit, onDelete, startEditing = false }: TodoRowProps) {
  const strings = useStrings();
  const done = todo.done_at !== null;
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(todo.text);
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const swipe = useRef<{ x: number; y: number; from: number; moving: boolean } | null>(null);
  const moved = useRef(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Поле правки растёт по тексту.
  useLayoutEffect(() => {
    const field = textRef.current;
    if (editing && field) {
      field.style.height = "0px";
      field.style.height = `${field.scrollHeight}px`;
    }
  }, [editing, draft]);

  useEffect(() => {
    if (editing) {
      const field = textRef.current;
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: "nearest" });
      field?.setSelectionRange(field.value.length, field.value.length);
    }
  }, [editing]);

  const finishEdit = (): void => {
    setEditing(false);
    const text = draft.trim();
    if (text === "") {
      onDelete();
    } else if (text !== todo.text) {
      onEdit(text);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (editing) {
      return;
    }
    moved.current = false;
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
    <div className={styles.row} data-todo={todo.id}>
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
        className={`${styles.content} ${swipe.current?.moving ? styles.dragging : ""}`}
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
        {editing ? (
          <textarea
            ref={textRef}
            className={`${styles.text} ${styles.field}`}
            value={draft}
            rows={1}
            maxLength={TODO_TEXT_MAX_LENGTH}
            enterKeyHint="done"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setDraft(todo.text);
                setEditing(false);
              }
            }}
            onBlur={finishEdit}
          />
        ) : (
          <button
            type="button"
            className={`${styles.text} ${done ? styles.doneText : ""}`}
            onClick={() => {
              setDraft(todo.text);
              setEditing(true);
            }}
          >
            {todo.text}
          </button>
        )}
      </div>
    </div>
  );
}
