/**
 * Вкладка «Задачи» (бета; включается в настройках «Задачи (бета)»): разовые дела, не
 * привычки — блокнот по сферам жизни. Сверху таблетка папок (TodoFolderBar: «Все задачи»,
 * папки, заготовка «Новая папка»). Список:
 *  - «Все задачи»: сначала задачи без папки, потом папки с заголовками, по порядку папок;
 *  - папка: её задачи;
 * и в конце блок «Выполненные» (последние отмеченные — выше).
 *
 * Новая задача — карандаш в нижней навигации (на месте «+»): в конце списка выбранной
 * папки появляется пустая строка с курсором, пишешь прямо в ней; Enter или закрытая
 * клавиатура — задача сохранена (пустая — пропадает). Заголовок — крупный, как у
 * «Привычек»; подзаголовки групп — как «Не запланированы на сегодня». С привычками не
 * связаны. Данные — на устройстве, на сервер уходят через /sync (store.ts).
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { Card, Section } from "../components/Section";
import { Screen } from "../components/Screen";
import { StatusMessage } from "../components/StatusMessage";
import { TodoFolderBar } from "../components/TodoFolderBar";
import { TodoRow } from "../components/TodoRow";
import { dataStore } from "../data/store";
import { describeError } from "../errors";
import { useAppData } from "../hooks/useAppData";
import { useStrings } from "../preferences";
import { confirmAction, hapticImpact, showAlert } from "../telegram/webapp";
import type { Todo } from "../types/todo";
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
  const { todos, todoFolders } = useAppData();
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
    };
  }, []);

  // Выбранной папки больше нет (удалили на другом устройстве) — «Все задачи».
  const folder = active === null ? null : (todoFolders.find((item) => item.id === active) ?? null);
  const shownFolder = folder?.id ?? null;

  const { groups, done } = useMemo(() => {
    const inView = (todo: Todo): boolean => shownFolder === null || todo.folder === shownFolder;
    const open = todos.filter((todo) => todo.done_at === null && inView(todo));
    const checked = todos
      .filter((todo) => todo.done_at !== null && inView(todo))
      .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
    const known = new Set(todoFolders.map((item) => item.id));
    const loose = open.filter((todo) => todo.folder === null || !known.has(todo.folder));
    // Первая группа — та, куда встаёт новая задача: выбранная папка или «без папки».
    const sections: { key: string; title?: string; todos: Todo[]; target?: boolean }[] = [];
    if (shownFolder !== null) {
      sections.push({ key: "folder", todos: open, target: true });
    } else {
      sections.push({ key: "none", todos: loose, target: true });
      for (const item of todoFolders) {
        sections.push({
          key: String(item.id),
          title: item.name,
          todos: open.filter((todo) => todo.folder === item.id),
        });
      }
    }
    return {
      groups: sections.filter((section) => section.todos.length > 0 || section.target),
      done: checked,
    };
  }, [todos, todoFolders, shownFolder]);

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
      dataStore.createTodo(text, shownFolder);
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

  const empty = draft === null && done.length === 0 && groups.every((group) => group.todos.length === 0);
  return (
    <Screen title={strings.todosTitle}>
      <div className={styles.todos}>
        <TodoFolderBar
          folders={todoFolders}
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
                      folder: shownFolder,
                      done_at: null,
                      created_at: "",
                    }}
                    startEditing
                    onToggle={() => undefined}
                    onEdit={(text) => saveDraft(draft, text)}
                    onDelete={() => closeDraft(draft)}
                  />
                ) : null}
              </Card>
            </Section>
          ) : null,
        )}
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
      />
    );
  }
}
