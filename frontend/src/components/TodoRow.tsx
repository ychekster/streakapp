/**
 * Задачи (бета): строка задачи. Кружок слева — отметить выполненной или вернуть (строка
 * остаётся на месте, пока открыт список, — см. TodosScreen); нажатие на текст — править его прямо в строке
 * (Enter — сохранить, пустой текст — удалить); свайп влево от правого края строки (полоса
 * EDGE_WIDTH) открывает красную кнопку «Удалить» (свайп вправо или нажатие строки
 * закрывает её). Свайп по остальной строке — экрану: «Переключение свайпом» листает
 * списки. Новая задача (карандаш) — пустая строка, сразу в правке (`startEditing`).
 * Задача списка с цветом — кружок его цвета; без списка — серый.
 *
 * Пока задачу пишут, под текстом плашки дня, напоминания и списка (TodoChips), а в конце
 * их ленты красный кружок с корзиной: удалить задачу (новую не создавать), как и свайпом.
 * Правка закончилась с текстом: плашки сначала плавно сворачиваются (COLLAPSE_MS), и только
 * потом задача сохраняется, поэтому строка не схлопывается рывком ни в начале блока, ни в
 * конце. Открылась клавиатура, и строка оказалась под ней: экран плавно поднимает строку над
 * клавиатурой (`revealAboveKeyboard`), сразу, ещё до первой буквы. «Новый
 * список…» в плашке списка открывает окно снизу (NewFolderSheet): созданный список сразу
 * выбран, правка продолжается (нажатия в окне её не заканчивают, `data-keeps-todo-edit`). Правка —
 * текст и плашки вместе: выбор дня или времени и закрытая клавиатура её не заканчивают —
 * «Готово» на клавиатуре тоже (прячет клавиатуру). Правку заканчивает нажатие мимо строки
 * (не прокрутка) или залитый кружок «Добавить» (плюс) / «Сохранить» (стрелка) на его месте; тогда всё сохраняется
 * разом (`onSave`). Исключение — новая задача без единого символа: закрылась клавиатура
 * (кроме ухода в её плашки) — задача не создаётся. В правке всегда одна строка
 * (`activeEditor`).
 * Задача с датой — подпись под текстом («Завтра в 15:00»), прошедший день у открытой —
 * красным (раньше дня отметки `markDay`: в «Отмечать за вчера» вчерашняя — ещё нет).
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

import { MAX_TODO_FOLDERS_PER_USER, TODO_TEXT_MAX_LENGTH } from "../constants";
import { dataStore } from "../data/store";
import { useAppData } from "../hooks/useAppData";
import { useLanguage, useStrings } from "../preferences";
import type { Strings } from "../strings";
import type { Language } from "../types/settings";
import { addDays } from "../data/dates";
import { localDate } from "./DateField";
import { hapticImpact } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { Todo, TodoFolder } from "../types/todo";
import { NewFolderSheet } from "./NewFolderSheet";
import { TodoChips, type TodoChipsValue } from "./TodoChips";
import styles from "./TodoRow.module.css";

/** Ширина кнопки «Удалить» под строкой (px) и сдвиг, после которого она остаётся открытой. */
const DELETE_WIDTH = 88;
const OPEN_AT = DELETE_WIDTH / 2;
/** Сдвиг пальца, после которого это свайп, а не нажатие (px). */
const SWIPE_SLOP = 8;
/** Полоса у правого края строки, с которой свайп открывает «Удалить» (px). */
const EDGE_WIDTH = 28;
/** Сколько ждать click после касания (мс): у нижней навигации — прежде чем закончить
 *  правку без него, у остального — сколько гасить его. */
const CLICK_WAIT_MS = 400;

/** Клавиатура выросла на столько (px) — она закрылась (Android: «Назад» прячет её без
 *  потери фокуса). */
const KEYBOARD_CLOSED_PX = 120;
/** Касание строки раньше потери фокуса на столько (мс) — фокус ушёл в её плашку. */
const ROW_TOUCH_MS = 600;
/** Сворачивание плашек перед сохранением правки (мс). */
const COLLAPSE_MS = 220;
/** Зазор между строкой в правке и клавиатурой (px). */
const KEYBOARD_GAP = 12;

/** Открыто окно «Новый список» (или ещё уезжает): правка строки идёт дальше. */
function listSheetOpen(): boolean {
  return document.querySelector("[data-keeps-todo-edit]") !== null;
}

/** Строка, которая сейчас в правке: открывается другая — эта сначала заканчивается. Так
 *  в правке всегда одна строка, даже если касание мимо (палец сдвинулся) её не закончило,
 *  а click всё же открыл другую. */
let activeEditor: { finish: () => void } | null = null;

/** Погасить click, который придёт за этим касанием (правка закончена касанием мимо
 *  строки — нажатое под пальцем не срабатывает). Слушатель не зависит от строки: она
 *  успевает выйти из правки до click. Click не пришёл — через CLICK_WAIT_MS снимается. */
function swallowNextClick(): void {
  const swallow = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  const stop = (): void => {
    window.clearTimeout(timer);
    document.removeEventListener("click", swallow, true);
  };
  const timer = window.setTimeout(stop, CLICK_WAIT_MS);
  document.addEventListener("click", swallow, true);
}

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
  /** Правку открыли нажатием на текст — до появления плашек (экран плавно сдвигает строки
   *  ниже). */
  onEditStart?: () => void;
  /** Сразу в правке (новая, ещё пустая задача). */
  startEditing?: boolean;
  /** «Галочки справа» (настройки задач): кружок у правого края. */
  checkRight?: boolean;
  /** Свои списки задач: плашка списка и цвет кружка. */
  lists: TodoFolder[];
  /** «Сегодня» задач — день отметки (как у привычек; в «Отмечать за вчера» — вчера): от
   *  него подписи «Сегодня» / «Завтра», раньше него — просрочена (красная подпись). Не
   *  задан — сегодня. */
  markDay?: string;
  /** Новая задача сверху (первой строкой блока): правка как до «Новые задачи: Снизу». Без
   *  подстройки под клавиатуру (строка и так у верха), а сохраняется сразу: плашки убирает
   *  плавный переезд строк экрана (todoMotion), а не своё сворачивание, которое у верха
   *  дёргало строку. */
  topDraft?: boolean;
}

function draftOf(todo: Todo): TodoDraft {
  return {
    text: todo.text,
    due_date: todo.due_date ?? null,
    remind_time: todo.remind_time ?? null,
    folder: todo.folder,
  };
}

/** День задачи подписью: «Вчера», «Сегодня», «Завтра», «чт, 12 нояб.» (год — только не
 *  текущий). «Сегодня» — `today`, настоящий день по часам устройства: в «Отмечать за вчера»
 *  вчерашняя задача — «Вчера», а не просрочена ли она, решает день отметки (TodoRow). */
export function formatTodoDate(
  iso: string,
  strings: Strings,
  language: Language,
  today: string = localDate(),
): string {
  if (iso === today) {
    return strings.dateToday;
  }
  if (iso === addDays(today, 1)) {
    return strings.dateTomorrow;
  }
  if (iso === addDays(today, -1)) {
    return strings.dateYesterday;
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
  onEditStart,
  startEditing = false,
  checkRight = false,
  lists,
  markDay = localDate(),
  topDraft = false,
}: TodoRowProps) {
  const strings = useStrings();
  const language = useLanguage();
  const done = todo.done_at !== null;
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(() => draftOf(todo));
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  // Правка сохранена, плашки ещё сворачиваются: на месте «Сохранить» уже кружок отметки.
  const [collapsing, setCollapsing] = useState(false);
  // Окно «Новый список» (плашка списка): списков меньше предела — пункт есть.
  const [listSheet, setListSheet] = useState(false);
  const canCreateList = useAppData().todoFolders.length < MAX_TODO_FOLDERS_PER_USER;
  const swipe = useRef<{ x: number; y: number; from: number; moving: boolean } | null>(null);
  const moved = useRef(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // Для конца правки из слушателей документа: свежая правка и то, что она ещё не
  // закончена (второй конец не сохраняет второй раз).
  const latest = useRef(draft);
  latest.current = draft;
  const editingRef = useRef(editing);
  editingRef.current = editing;

  // Кружок — цвета списка (в правке — выбранного в плашке).
  const folder = editing ? draft.folder : todo.folder;
  const color = lists.find((item) => item.id === folder)?.color ?? null;

  // Поле правки растёт по тексту. Как поле сообщения в Telegram — вверх: с каждой новой
  // строкой экран сдвигается ровно на её высоту (стёрли строку — обратно), низ строки стоит
  // на месте. Только у строки в нижней половине видимой области (над клавиатурой): строка у
  // верха растёт вниз, как обычно, и не уезжает под шапку.
  const lastHeight = useRef(0);
  useLayoutEffect(() => {
    const field = textRef.current;
    if (!editing || !field) {
      lastHeight.current = 0;
      return;
    }
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight}px`;
    const height = field.offsetHeight;
    const grown = lastHeight.current > 0 ? height - lastHeight.current : 0;
    lastHeight.current = height;
    const row = rowRef.current;
    if (grown === 0 || !row || topDraft) {
      return;
    }
    const viewport = window.visualViewport;
    const top = viewport ? viewport.offsetTop : 0;
    const visible = viewport ? viewport.height : window.innerHeight;
    if (row.getBoundingClientRect().bottom - grown > top + visible / 2) {
      window.scrollBy(0, grown);
    }
  }, [editing, draft.text, topDraft]);

  useEffect(() => {
    if (editing) {
      const field = textRef.current;
      field?.focus({ preventScroll: true });
      // Вся строка с плашками — в видимую часть, не под шапку (scroll-margin в CSS).
      rowRef.current?.scrollIntoView({ block: "nearest" });
      field?.setSelectionRange(field.value.length, field.value.length);
    }
  }, [editing]);

  // Клавиатура открылась (видимая область стала ниже) и закрыла строку — плавно поднять
  // строку над ней. Видимая область меняется много раз, пока клавиатура выезжает: поднимаем
  // один раз, когда она остановилась.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!editing || !viewport || topDraft) {
      return undefined;
    }
    let timer: number | undefined;
    const revealAboveKeyboard = (): void => {
      const row = rowRef.current;
      if (!row) {
        return;
      }
      const bottom = viewport.offsetTop + viewport.height - KEYBOARD_GAP;
      const overlap = row.getBoundingClientRect().bottom - bottom;
      if (overlap > 0) {
        window.scrollBy({ top: overlap, behavior: "smooth" });
      }
    };
    const onResize = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(revealAboveKeyboard, 120);
    };
    viewport.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      viewport.removeEventListener("resize", onResize);
    };
  }, [editing, topDraft]);

  const startEdit = (): void => {
    onEditStart?.();
    setDraft(draftOf(todo));
    setEditing(true);
  };

  /** Закрыть правку. Поле сначала теряет фокус: убранное из страницы в фокусе, на iPhone
   *  оно не присылает focusout — приложение считало бы клавиатуру открытой и не
   *  возвращало нижнюю навигацию (useTextFieldFocused). */
  const closeEdit = (): void => {
    editingRef.current = false;
    textRef.current?.blur();
    setEditing(false);
  };

  /** Сохранить правку; false — текст пуст, задача удалена (или новая не создана). С
   *  текстом плашки сначала сворачиваются, правка закрывается и сохраняется после. */
  const finishEdit = (): boolean => {
    if (!editingRef.current) {
      return false;
    }
    const text = latest.current.text.trim();
    if (text === "") {
      closeEdit();
      onDelete();
      return false;
    }
    if (topDraft) {
      closeEdit();
      onSave({ ...latest.current, text });
      return true;
    }
    editingRef.current = false;
    textRef.current?.blur();
    const next = { ...latest.current, text };
    setCollapsing(true);
    collapseChips(() => {
      setCollapsing(false);
      setEditing(false);
      onSave(next);
    });
    return true;
  };

  /** Удалить задачу кнопкой с корзиной (новая просто не создаётся). */
  const removeNow = (): void => {
    closeEdit();
    onDelete();
  };

  /** Плавно свернуть плашки (высота и прозрачность), потом `done`. Таймер, а не конец
   *  анимации: ушли с экрана посреди неё — правка всё равно сохраняется. */
  const chipsRef = useRef<HTMLDivElement>(null);
  const collapseChips = (done: () => void): void => {
    const element = chipsRef.current;
    if (!element || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      done();
      return;
    }
    element.animate(
      [
        { height: `${element.offsetHeight}px`, opacity: 1 },
        { height: "0px", opacity: 0 },
      ],
      { duration: COLLAPSE_MS, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" },
    );
    window.setTimeout(done, COLLAPSE_MS);
  };

  const finishRef = useRef(finishEdit);
  finishRef.current = finishEdit;

  // Одна строка в правке: открылась эта — прежняя заканчивается (сохраняется, пустая
  // новая пропадает).
  const editor = useRef({ finish: () => finishRef.current() }).current;
  useEffect(() => {
    if (!editing) {
      return undefined;
    }
    if (activeEditor && activeEditor !== editor) {
      activeEditor.finish();
    }
    activeEditor = editor;
    return () => {
      if (activeEditor === editor) {
        activeEditor = null;
      }
    };
  }, [editing, editor]);

  // Новая задача, в которой не написано ни символа: клавиатура закрылась (любым способом:
  // «Готово», касание, «Назад» на Android) — задача не создаётся. Плашки дня, времени и
  // списка не в счёт: выбрать день можно и до текста.
  const lastRowTouch = useRef(0);
  const cancelIfEmpty = (): void => {
    if (
      !startEditing ||
      !editingRef.current ||
      latest.current.text.trim() !== "" ||
      listSheetOpen()
    ) {
      return;
    }
    const active = document.activeElement;
    if (active instanceof Node && active !== textRef.current && rowRef.current?.contains(active)) {
      return;
    }
    if (Date.now() - lastRowTouch.current < ROW_TOUCH_MS) {
      return;
    }
    finishEdit();
  };
  const cancelRef = useRef(cancelIfEmpty);
  cancelRef.current = cancelIfEmpty;

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!startEditing || !editing || !viewport) {
      return undefined;
    }
    let lowest = viewport.height;
    const onResize = (): void => {
      lowest = Math.min(lowest, viewport.height);
      if (viewport.height - lowest > KEYBOARD_CLOSED_PX) {
        lowest = viewport.height;
        cancelRef.current();
      }
    };
    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
  }, [startEditing, editing]);

  // Нажатие мимо строки только заканчивает правку: другая задача не открывается, галочка не
  // ставится — само нажатие гасится (swallowNextClick). Палец, который сдвинулся
  // (прокрутка), правку не заканчивает. Исключение — нижняя навигация (вкладки, карандаш):
  // там правка заканчивается в click — до обработчика кнопки, и кнопка срабатывает (iPhone
  // не доводит касание до click, если страница поменялась уже на отпускании пальца).
  useEffect(() => {
    if (!editing) {
      return undefined;
    }
    let tap: { x: number; y: number } | null = null;
    let waitingClick: number | undefined;
    const finish = (): void => {
      window.clearTimeout(waitingClick);
      waitingClick = undefined;
      finishRef.current();
    };
    const onDown = (event: globalThis.PointerEvent): void => {
      const inside =
        event.target instanceof Element &&
        (rowRef.current?.contains(event.target) || event.target.closest("[data-keeps-todo-edit]"));
      tap = inside ? null : { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: globalThis.PointerEvent): void => {
      const isTap =
        tap !== null &&
        Math.abs(event.clientX - tap.x) <= SWIPE_SLOP &&
        Math.abs(event.clientY - tap.y) <= SWIPE_SLOP;
      tap = null;
      if (!isTap) {
        return;
      }
      if (event.target instanceof Element && event.target.closest("[data-tab-bar]")) {
        // Click не пришёл (браузер его не дал, или мимо кнопки) — всё равно закончить.
        waitingClick = window.setTimeout(finish, CLICK_WAIT_MS);
      } else {
        swallowNextClick();
        finish();
      }
    };
    const onClick = (): void => {
      if (waitingClick !== undefined) {
        finish();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearTimeout(waitingClick);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [editing]);

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
      ref={rowRef}
      className={`${styles.row} ${color ? styles.colored : ""}`}
      style={color ? habitColorStyle(color) : undefined}
      data-todo={todo.id}
      onPointerDownCapture={() => {
        lastRowTouch.current = Date.now();
      }}
    >
      <button
        type="button"
        // Пока строка не сдвинута, кнопки нет: иначе её красный край просвечивал по скруглению
        // угла карточки.
        className={`${styles.delete} ${shift ? "" : styles.deleteHidden}`}
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
        {editing && !collapsing ? (
          // В правке на месте кружка — залитый кружок «Добавить» (плюс) / «Сохранить»
          // (стрелка вверх, как «отправить»). Пустой текст — нечего.
          <button
            type="button"
            className={styles.save}
            aria-label={startEditing ? strings.todosAdd : strings.todosSave}
            disabled={draft.text.trim() === ""}
            onClick={finishEdit}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={startEditing ? "M12 5.5v13M5.5 12h13" : "M12 18.5V6M6.5 11.5L12 6l5.5 5.5"} />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.check} ${done ? styles.checked : ""}`}
            aria-label={done ? strings.todosUncheck : strings.todosCheck}
            aria-pressed={done}
            onClick={onToggle}
          >
            {done ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12.75l4.5 4.5L19 7.75" />
              </svg>
            ) : null}
          </button>
        )}
        <div className={styles.body}>
        {editing ? (
          <>
            <textarea
              ref={textRef}
              className={`${styles.text} ${styles.field} ${styles.withChips}`}
              value={draft.text}
              rows={1}
              maxLength={TODO_TEXT_MAX_LENGTH}
              enterKeyHint="done"
              // Автоисправление и подсказки клавиатуры — явно: фокус приходит сюда из поля,
              // державшего клавиатуру (startNewTodo), iPhone берёт настройки у них обоих.
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              // Фокус ушёл: куда — видно только после события (плашка строки — не в счёт).
              onBlur={() => window.setTimeout(() => cancelRef.current(), 0)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  // «Готово» на клавиатуре прячет её, правка остаётся (как ✓ над клавиатурой).
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  closeEdit();
                  if (startEditing) {
                    // Новая задача отменена — строка уходит.
                    onDelete();
                  }
                }
              }}
            />
            <div ref={chipsRef} className={styles.chipsWrap}>
              <TodoChips
                value={draft}
                onChange={(value) => setDraft({ ...draft, ...value })}
                lists={lists}
                today={markDay}
                onNewList={canCreateList ? () => setListSheet(true) : undefined}
                onRemove={removeNow}
              />
            </div>
            <NewFolderSheet
              open={listSheet}
              title={strings.todoListCreateTitle}
              placeholder={strings.todoListNameHeading}
              submit={strings.todoListCreateSubmit}
              failed={strings.todoListSaveFailed}
              withColor
              onCreate={(name, color) => {
                const id = dataStore.createTodoFolder(name, undefined, color ?? undefined);
                setDraft((current) => ({ ...current, folder: id }));
              }}
              onClose={() => {
                setListSheet(false);
                // Курсор — обратно в текст задачи (в том же нажатии: клавиатура остаётся).
                textRef.current?.focus({ preventScroll: true });
              }}
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
            className={`${styles.caption} ${todo.due_date < markDay ? styles.overdue : ""}`}
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
