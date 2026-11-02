/**
 * Вкладка «Задачи» (бета; включается в Настройки → «Задачи (Beta)»): разовые дела, не
 * привычки — блокнот по сферам жизни. Сверху таблетка списков (TodoFolderBar: «Все задачи»,
 * списки, заготовка «Новый список»). Список:
 *  - «Все задачи»: сначала задачи без списка, потом списки с заголовками, по порядку;
 *  - список: его задачи; рекомендуемый (`kind`) — подходящие задачи всех списков
 *    («Сегодня» — на сегодня и просроченные, «Запланированные» — с датой, «Без даты»), а
 *    новая задача в «Сегодня» и «Запланированных» — на сегодня;
 * задачи на будущие дни — внизу, в блоке «Не запланированы на сегодня» (по дню и времени,
 * как у привычек); в свой день они поднимаются наверх, к остальным. В конце — блок
 * «Выполненные» (последние отмеченные — выше). Просроченная остаётся наверху с красной
 * подписью дня.
 *
 * Новая задача — карандаш в нижней навигации (на месте «+»): в конце списка выбранной
 * папки появляется пустая строка с курсором, пишешь прямо в ней; Enter или закрытая
 * клавиатура — задача сохранена (пустая — пропадает); иконка календаря в строке — окно
 * даты и напоминания (TodoSheet). Заголовок — крупный, как у
 * «Привычек»; подзаголовки групп — как «Не запланированы на сегодня». С привычками не
 * связаны. Данные — на устройстве, на сервер уходят через /sync (store.ts).
 *
 * Настройки задач: «Переключение свайпом» (свайп по экрану мимо задач — соседний список;
 * по самой задаче свайп открывает «Удалить») и «Галочки справа».
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, Section } from "../components/Section";
import { Screen } from "../components/Screen";
import { StatusMessage } from "../components/StatusMessage";
import { TodoFolderBar } from "../components/TodoFolderBar";
import { localDate } from "../components/DateField";
import { TodoRow } from "../components/TodoRow";
import { closeTodoSheet, openTodoSheet } from "../components/TodoSheet";
import { dataStore } from "../data/store";
import { describeError } from "../errors";
import { useAppData } from "../hooks/useAppData";
import { useHorizontalSwipe, type SwipeDirection } from "../hooks/useHorizontalSwipe";
import { useStrings } from "../preferences";
import { confirmAction, hapticImpact, showAlert } from "../telegram/webapp";
import type { Todo, TodoFolderKind } from "../types/todo";
import styles from "./TodosScreen.module.css";

// Карандаш (App) и открытый экран задач: пустая строка новой задачи и поле, которое
// получает фокус прямо в нажатии карандаша — иначе iPhone не откроет клавиатуру (фокус
// потом переходит в строку, клавиатура остаётся).
let openDraft: (() => void) | null = null;
let keyboardHolder: HTMLTextAreaElement | null = null;
// Номер новой строки: каждая — своя (карандаш, нажатый во время правки прежней, сохраняет
// её и открывает следующую с курсором).
let draftSeq = 0;

/** Карандаш: новая пустая задача в конце списка выбранной папки. */
export function startNewTodo(): void {
  keyboardHolder?.focus({ preventScroll: true });
  openDraft?.();
}

export function TodosScreen() {
  const strings = useStrings();
  const { todos, todoFolders, todoAllPosition, settings } = useAppData();
  const checksRight = settings?.todo_checks_right ?? false;
  const [active, setActive] = useState<number | null>(null);
  // Новая задача, которую сейчас пишут (ещё не сохранена): номер её строки.
  const [draft, setDraft] = useState<number | null>(null);
  const holderRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    openDraft = () => {
      draftSeq += 1;
      setDraft(draftSeq);
    };
    keyboardHolder = holderRef.current;
    return () => {
      openDraft = null;
      keyboardHolder = null;
      closeTodoSheet();
    };
  }, []);

  // Выбранной папки больше нет (удалили на другом устройстве) — «Все задачи».
  const folder = active === null ? null : (todoFolders.find((item) => item.id === active) ?? null);
  const shownFolder = folder?.id ?? null;
  const kind = folder?.kind ?? null;
  // Список, куда встаёт новая задача: свой — он, рекомендуемый и «Все задачи» — без списка.
  const targetFolder = kind ? null : shownFolder;

  // «Переключение свайпом»: свайп влево — следующий список, вправо — предыдущий.
  const order = useRef<(number | null)[]>([]);
  order.current = todoFolders.map((item) => item.id as number | null);
  order.current.splice(Math.min(todoAllPosition, todoFolders.length), 0, null);
  const shownRef = useRef(shownFolder);
  shownRef.current = shownFolder;
  const switchList = useCallback((direction: SwipeDirection) => {
    const index = order.current.indexOf(shownRef.current);
    const next = order.current[index + (direction === "left" ? 1 : -1)];
    if (index !== -1 && next !== undefined) {
      hapticImpact("light");
      setActive(next);
    }
  }, []);
  useHorizontalSwipe(settings?.todo_folder_swipe && draft === null ? switchList : null);

  // День устройства — как в выборе даты (DateField); пересчёт — с каждой отрисовкой.
  const today = localDate();
  const { groups, later, done } = useMemo(() => {
    const inView = (todo: Todo): boolean =>
      kind ? inKind(kind, todo, today) : shownFolder === null || todo.folder === shownFolder;
    const isLater = (todo: Todo): boolean => (todo.due_date ?? "") > today;
    const pending = todos.filter((todo) => todo.done_at === null && inView(todo));
    const open = pending.filter((todo) => !isLater(todo));
    const upcoming = pending
      .filter(isLater)
      .sort(
        (a, b) =>
          (a.due_date ?? "").localeCompare(b.due_date ?? "") ||
          (a.remind_time ?? "").localeCompare(b.remind_time ?? ""),
      );
    const checked = todos
      .filter((todo) => todo.done_at !== null && inView(todo))
      .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
    const own = todoFolders.filter((item) => !item.kind);
    const known = new Set(own.map((item) => item.id));
    const loose = open.filter((todo) => todo.folder === null || !known.has(todo.folder));
    // Первая группа — та, куда встаёт новая задача: выбранная папка или «без папки».
    const sections: { key: string; title?: string; todos: Todo[]; target?: boolean }[] = [];
    if (shownFolder !== null) {
      sections.push({ key: "folder", todos: open, target: true });
    } else {
      sections.push({ key: "none", todos: loose, target: true });
      for (const item of own) {
        sections.push({
          key: String(item.id),
          title: item.name,
          todos: open.filter((todo) => todo.folder === item.id),
        });
      }
    }
    return {
      groups: sections.filter((section) => section.todos.length > 0 || section.target),
      later: upcoming,
      done: checked,
    };
  }, [todos, todoFolders, shownFolder, kind, today]);
  // Новая задача в «Сегодня» и «Запланированных» — на сегодня (иначе её там не было бы).
  const newDate = kind === "today" || kind === "scheduled" ? today : undefined;

  const fail = (error: unknown): void => {
    void showAlert({
      title: strings.todosTitle,
      message: describeError(strings, error, strings.todosFailed),
      okLabel: strings.alertOk,
    });
  };

  /** Строка `key` закрыта: открытая после неё остаётся. */
  const closeDraft = (key: number): void =>
    setDraft((current) => (current === key ? null : current));

  const saveDraft = (key: number, text: string): void => {
    closeDraft(key);
    try {
      dataStore.createTodo(text, targetFolder, newDate);
    } catch (error) {
      fail(error);
    }
  };

  /** Иконка календаря у новой строки: задача создаётся и открывается её окно. */
  const draftDetails = (key: number, text: string): void => {
    closeDraft(key);
    try {
      openTodoSheet(dataStore.createTodo(text, targetFolder, newDate));
    } catch (error) {
      fail(error);
    }
  };

  const createFolder = (name: string): number | null => {
    try {
      return dataStore.createTodoFolder(name);
    } catch (error) {
      fail(error);
      return null;
    }
  };

  const deleteFolder = async (id: number): Promise<void> => {
    const target = todoFolders.find((item) => item.id === id);
    if (
      target &&
      (await confirmAction({
        title: strings.todosDeleteFolderTitle(target.name),
        message: strings.todosDeleteFolderMessage,
        confirmLabel: strings.todosDeleteFolderConfirm,
        cancelLabel: strings.todosCancel,
        destructive: true,
      }))
    ) {
      dataStore.deleteTodoFolder(id);
      setActive(null);
    }
  };

  const empty =
    draft === null &&
    later.length === 0 &&
    done.length === 0 &&
    groups.every((group) => group.todos.length === 0);
  return (
    <Screen title={strings.todosTitle}>
      <div className={styles.todos}>
        <TodoFolderBar
          folders={todoFolders}
          allPosition={todoAllPosition}
          active={shownFolder}
          onSelect={(id) => {
            hapticImpact("light");
            setActive(id);
          }}
          onCreate={createFolder}
          onRename={(id, name) => {
            try {
              dataStore.renameTodoFolder(id, name);
            } catch (error) {
              fail(error);
            }
          }}
          onDelete={(id) => void deleteFolder(id)}
          onReorder={(ids) => dataStore.orderTodoFolders(ids)}
        />
        {empty ? (
          <StatusMessage
            icon="check"
            title={strings.todosEmptyTitle}
            description={strings.todosEmptyDescription}
          />
        ) : null}
        {groups.map((group) =>
          group.todos.length > 0 || (group.target && draft !== null) ? (
            <Section key={group.key} title={group.title} variant="form">
              <Card>
                {group.todos.map(renderRow)}
                {group.target && draft !== null ? (
                  <TodoRow
                    key={`draft-${draft}`}
                    todo={{
                      id: 0,
                      text: "",
                      folder: targetFolder,
                      done_at: null,
                      created_at: "",
                    }}
                    startEditing
                    checkRight={checksRight}
                    onToggle={() => undefined}
                    onEdit={(text) => saveDraft(draft, text)}
                    onDelete={() => closeDraft(draft)}
                    onOpenDetails={(text) => draftDetails(draft, text)}
                  />
                ) : null}
              </Card>
            </Section>
          ) : null,
        )}
        {later.length > 0 ? (
          <Section title={strings.todosLater} variant="form">
            <Card>{later.map(renderRow)}</Card>
          </Section>
        ) : null}
        {done.length > 0 ? (
          <Section title={strings.todosDone} variant="form">
            <Card>{done.map(renderRow)}</Card>
          </Section>
        ) : null}
      </div>
      {/* Держит клавиатуру между нажатием карандаша и появлением строки (см. startNewTodo). */}
      <textarea
        ref={holderRef}
        className={styles.keyboardHolder}
        tabIndex={-1}
        aria-hidden="true"
        rows={1}
      />
    </Screen>
  );

  function renderRow(todo: Todo) {
    return (
      <TodoRow
        key={todo.id}
        todo={todo}
        onToggle={() => {
          hapticImpact("light");
          dataStore.updateTodo(todo.id, { done: todo.done_at === null });
        }}
        onEdit={(text) => dataStore.updateTodo(todo.id, { text })}
        onDelete={() => dataStore.deleteTodo(todo.id)}
        checkRight={checksRight}
        onOpenDetails={(text) => {
          if (text !== todo.text) {
            dataStore.updateTodo(todo.id, { text });
          }
          openTodoSheet(todo.id);
        }}
      />
    );
  }
}

/** Задача в рекомендуемом списке `kind` (`today` — день устройства «ГГГГ-ММ-ДД»). */
function inKind(kind: TodoFolderKind, todo: Todo, today: string): boolean {
  const date = todo.due_date ?? null;
  if (kind === "today") {
    return date !== null && date <= today;
  }
  return kind === "scheduled" ? date !== null : date === null;
}
