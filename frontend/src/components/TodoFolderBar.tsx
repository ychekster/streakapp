/**
 * Задачи (бета): папки над списком задач — та же таблетка, что у папок привычек
 * (FolderBar: стили, подложка, прокрутка), с тремя отличиями:
 *  - последней стоит вкладка-заготовка «Новая папка»: нажал — в ней курсор, ввёл название,
 *    Enter — папка создана и выбрана, а заготовка снова в конце ряда;
 *  - нажатие уже выбранной папки делает её название полем: Enter — переименовать, пустое —
 *    спросить и удалить (задачи из неё остаются без папки);
 *  - папку можно перетащить: подержать (как кнопку таймера, LONG_PRESS_MS) и вести вбок.
 *    Дальше «Все задачи» и заготовки она не уходит.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { FOLDER_NAME_MAX_LENGTH, MAX_TODO_FOLDERS_PER_USER } from "../constants";
import { LONG_PRESS_MS } from "../hooks/useLongPress";
import { useStrings } from "../preferences";
import { hapticImpact } from "../telegram/webapp";
import type { TodoFolder } from "../types/todo";
import styles from "./FolderBar.module.css";
import { useFolderThumb } from "./FolderBar";
import extra from "./TodoFolderBar.module.css";

/** На сколько можно сдвинуть палец, пока ждём долгое нажатие (px). */
const HOLD_SLOP = 8;

interface TodoFolderBarProps {
  folders: readonly TodoFolder[];
  /** Выбранная папка; null — «Все задачи». */
  active: number | null;
  onSelect: (id: number | null) => void;
  /** Создать папку; её id или null — не создана. */
  onCreate: (name: string) => number | null;
  onRename: (id: number, name: string) => void;
  /** Название стёрли: спросить и удалить. */
  onDelete: (id: number) => void;
  onReorder: (ids: number[]) => void;
}

/** Перетаскивание папки: какая, откуда и куда сдвинута. */
interface Drag {
  index: number;
  startX: number;
  dx: number;
  /** Края папок на ленте в начале перетаскивания. */
  boxes: { left: number; width: number }[];
}

export function TodoFolderBar({
  folders,
  active,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onReorder,
}: TodoFolderBarProps) {
  const strings = useStrings();
  const trackRef = useRef<HTMLDivElement>(null);
  // Какая вкладка — поле: "new" — заготовка, число — переименование папки.
  const [editing, setEditing] = useState<"new" | number | null>(null);
  const [draft, setDraft] = useState("");
  const [drag, setDrag] = useState<Drag | null>(null);
  const hold = useRef<{ timer: number; x: number; y: number; index: number } | null>(null);
  // Долгое нажатие сработало — следующий click не выбор вкладки.
  const swallowClick = useRef(false);

  const activeIndex = active === null ? 0 : folders.findIndex((folder) => folder.id === active) + 1;
  const { thumbStyle, animated } = useFolderThumb(
    trackRef,
    Math.max(0, activeIndex),
    folders.map((folder) => folder.name).join("\u0000") + String(editing) + draft,
  );

  // Пока папку тащат, лента не прокручивается пальцем. Обработчик (не пассивный) стоит с
  // самого начала: добавленный посреди касания, он бы не остановил прокрутку на iPhone.
  const dragging = useRef(false);
  dragging.current = drag !== null;
  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const block = (event: TouchEvent): void => {
      if (dragging.current && event.cancelable) {
        event.preventDefault();
      }
    };
    track.addEventListener("touchmove", block, { passive: false });
    return () => track.removeEventListener("touchmove", block);
  }, []);

  useEffect(() => () => window.clearTimeout(hold.current?.timer), []);

  const startEdit = (target: "new" | number, value: string): void => {
    setEditing(target);
    setDraft(value);
  };

  const finishEdit = (): void => {
    const name = draft.trim();
    if (editing === "new") {
      const id = name !== "" ? onCreate(name) : null;
      if (id !== null) {
        onSelect(id);
      }
    } else if (editing !== null) {
      const folder = folders.find((item) => item.id === editing);
      if (folder && name === "") {
        onDelete(folder.id);
      } else if (folder && name !== folder.name) {
        onRename(folder.id, name);
      }
    }
    setEditing(null);
    setDraft("");
  };

  const onFieldKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setEditing(null);
      setDraft("");
    }
  };

  // ------------------------------------------------------------------ //
  //  Перетаскивание
  // ------------------------------------------------------------------ //

  const cancelHold = (): void => {
    window.clearTimeout(hold.current?.timer);
    hold.current = null;
  };

  const onFolderPointerDown = (event: PointerEvent<HTMLElement>, index: number): void => {
    if (editing !== null || event.button !== 0) {
      return;
    }
    swallowClick.current = false;
    const x = event.clientX;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    cancelHold();
    hold.current = {
      x,
      y: event.clientY,
      index,
      timer: window.setTimeout(() => {
        const track = trackRef.current;
        if (!track) {
          return;
        }
        const trackLeft = track.getBoundingClientRect().left - track.scrollLeft;
        const boxes = [...track.querySelectorAll<HTMLElement>("[data-folder]")].map((element) => {
          const box = element.getBoundingClientRect();
          return { left: box.left - trackLeft, width: box.width };
        });
        try {
          target.setPointerCapture(pointerId);
        } catch {
          // The pointer is gone already.
        }
        swallowClick.current = true;
        hold.current = null;
        hapticImpact("light");
        dragging.current = true;
        setDrag({ index, startX: x, dx: 0, boxes });
      }, LONG_PRESS_MS),
    };
  };

  const onFolderPointerMove = (event: PointerEvent<HTMLElement>): void => {
    const pending = hold.current;
    if (pending) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > HOLD_SLOP) {
        cancelHold();
      }
      return;
    }
    if (!drag) {
      return;
    }
    const first = drag.boxes[0];
    const last = drag.boxes[drag.boxes.length - 1];
    const box = drag.boxes[drag.index];
    // Не левее первой папки (за ней «Все задачи») и не правее последней (за ней заготовка).
    const dx = Math.min(
      Math.max(event.clientX - drag.startX, first.left - box.left),
      last.left + last.width - (box.left + box.width),
    );
    const target = targetIndex({ ...drag, dx });
    if (target !== targetIndex(drag)) {
      hapticImpact("light");
    }
    setDrag({ ...drag, dx });
  };

  const onFolderPointerUp = (): void => {
    cancelHold();
    if (!drag) {
      return;
    }
    const target = targetIndex(drag);
    setDrag(null);
    if (target !== drag.index) {
      const ids = folders.map((folder) => folder.id);
      const [moved] = ids.splice(drag.index, 1);
      ids.splice(target, 0, moved);
      onReorder(ids);
    }
  };

  /** Сдвиг папки `index` во время перетаскивания: тащимая — за пальцем, соседи
   *  расступаются на её ширину. */
  const shiftOf = (index: number): number => {
    if (!drag) {
      return 0;
    }
    if (index === drag.index) {
      return drag.dx;
    }
    const target = targetIndex(drag);
    const width = drag.boxes[drag.index].width;
    if (drag.index < index && index <= target) {
      return -width;
    }
    if (target <= index && index < drag.index) {
      return width;
    }
    return 0;
  };

  const activeShift = active === null ? 0 : shiftOf(activeIndex - 1);
  const thumb: CSSProperties | undefined = thumbStyle
    ? { ...thumbStyle, transform: activeShift ? `translateX(${activeShift}px)` : undefined }
    : undefined;

  const field = (placeholder: string) => (
    <span className={extra.field} data-value={draft || placeholder}>
      <input
        className={extra.input}
        value={draft}
        placeholder={placeholder}
        maxLength={FOLDER_NAME_MAX_LENGTH}
        size={1}
        autoFocus
        enterKeyHint="done"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onFieldKey}
        onBlur={finishEdit}
      />
    </span>
  );

  return (
    <div className={styles.bar}>
      <div ref={trackRef} className={styles.track} role="tablist">
        {thumb ? (
          <span
            className={`${styles.thumb} ${animated && !drag ? styles.animated : ""}`}
            style={thumb}
            aria-hidden="true"
          />
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={active === null}
          className={styles.tab}
          onClick={() => onSelect(null)}
        >
          {strings.todosAll}
        </button>
        {folders.map((folder, index) => {
          const selected = folder.id === active;
          const shift = shiftOf(index);
          const style: CSSProperties | undefined = shift
            ? { transform: `translateX(${shift}px)` }
            : undefined;
          if (editing === folder.id) {
            return (
              <div key={folder.id} role="tab" aria-selected className={styles.tab} data-folder>
                {field(folder.name)}
              </div>
            );
          }
          return (
            <button
              key={folder.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`${styles.tab} ${drag ? extra.moving : ""} ${
                drag?.index === index ? extra.dragged : ""
              }`}
              style={style}
              data-folder
              onPointerDown={(event) => onFolderPointerDown(event, index)}
              onPointerMove={onFolderPointerMove}
              onPointerUp={onFolderPointerUp}
              onPointerCancel={onFolderPointerUp}
              onContextMenu={(event) => event.preventDefault()}
              onClick={() => {
                if (swallowClick.current) {
                  swallowClick.current = false;
                  return;
                }
                if (selected) {
                  startEdit(folder.id, folder.name);
                } else {
                  onSelect(folder.id);
                }
              }}
            >
              {folder.name}
            </button>
          );
        })}
        {folders.length < MAX_TODO_FOLDERS_PER_USER ? (
          editing === "new" ? (
            <div className={`${styles.tab} ${extra.newFolder}`}>{field(strings.todosNewFolder)}</div>
          ) : (
            <button
              type="button"
              className={`${styles.tab} ${extra.newFolder}`}
              onClick={() => startEdit("new", "")}
            >
              {strings.todosNewFolder}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

/** Куда встанет тащимая папка: по её середине среди середин остальных. */
function targetIndex(drag: Drag): number {
  const box = drag.boxes[drag.index];
  const center = box.left + box.width / 2 + drag.dx;
  let target = 0;
  drag.boxes.forEach((other, index) => {
    if (index !== drag.index && other.left + other.width / 2 < center) {
      target += 1;
    }
  });
  return target;
}
