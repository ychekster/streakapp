/**
 * Настройки → «Задачи (бета)»: разовые дела, не привычки — блокнот по сферам жизни.
 * Сверху таблетка папок (TodoFolderBar: «Все задачи», папки, заготовка «Новая папка»),
 * снизу поле ввода (TodoComposer): написал, Enter — задача в выбранной папке («Все
 * задачи» — без папки). Список:
 *  - «Все задачи»: сначала задачи без папки, потом папки с заголовками, по порядку папок;
 *  - папка: её задачи;
 * и в конце блок «Выполненные» (последние отмеченные — выше).
 *
 * Заголовок — крупный, как у «Привычек»; подзаголовки групп — как «Не запланированы на
 * сегодня» в списке привычек. С привычками не связаны. Данные — на устройстве, на сервер
 * уходят через /sync (store.ts).
 *
 * Как в мессенджере: поле ввода всегда прямо над клавиатурой. iPhone с открытой
 * клавиатурой не ужимает страницу, а сдвигает её, и закреплённое внизу при прокрутке
 * уезжает. Поэтому экран не прокручивает страницу: он занимает ровно видимую часть окна
 * (visualViewport — над клавиатурой), список прокручивается внутри него, а поле стоит под
 * списком.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Card, Section } from "../components/Section";
import { Screen } from "../components/Screen";
import { StatusMessage } from "../components/StatusMessage";
import { TodoComposer } from "../components/TodoComposer";
import { TodoFolderBar } from "../components/TodoFolderBar";
import { TodoRow } from "../components/TodoRow";
import { dataStore } from "../data/store";
import { describeError } from "../errors";
import { useAppData } from "../hooks/useAppData";
import { useStrings } from "../preferences";
import { confirmAction, hapticImpact, showAlert } from "../telegram/webapp";
import type { Todo } from "../types/todo";
import styles from "./TodosScreen.module.css";

export function TodosScreen() {
  const strings = useStrings();
  const { todos, todoFolders } = useAppData();
  const [active, setActive] = useState<number | null>(null);
  // Только что добавленная задача (она последняя в списке) — список доезжает до неё.
  const added = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const viewport = useVisibleViewport();

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
    const sections: { key: string; title?: string; todos: Todo[] }[] = [];
    if (shownFolder !== null) {
      sections.push({ key: "folder", todos: open });
    } else {
      sections.push({ key: "none", todos: loose });
      for (const item of todoFolders) {
        sections.push({
          key: String(item.id),
          title: item.name,
          todos: open.filter((todo) => todo.folder === item.id),
        });
      }
    }
    return { groups: sections.filter((section) => section.todos.length > 0), done: checked };
  }, [todos, todoFolders, shownFolder]);

  useEffect(() => {
    const last = todos[todos.length - 1];
    if (added.current && last) {
      added.current = false;
      scrollerRef.current
        ?.querySelector(`[data-todo="${last.id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [todos]);

  const fail = (error: unknown): void => {
    void showAlert({
      title: strings.todosTitle,
      message: describeError(strings, error, strings.todosFailed),
      okLabel: strings.alertOk,
    });
  };

  const send = (text: string): boolean => {
    try {
      dataStore.createTodo(text, shownFolder);
      added.current = true;
      return true;
    } catch (error) {
      fail(error);
      return false;
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

  const empty = groups.length === 0 && done.length === 0;
  return (
    <div
      className={styles.root}
      style={viewport ? { top: viewport.top, height: viewport.height } : undefined}
    >
      <div ref={scrollerRef} className={styles.scroller}>
        <Screen
          title={strings.todosTitle}
          withTabBar={false}
          enterAnimation
          scrollerRef={scrollerRef}
        >
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
            {groups.map((group) => (
              <Section key={group.key} title={group.title} variant="form">
                <Card>{group.todos.map(renderRow)}</Card>
              </Section>
            ))}
            {done.length > 0 ? (
              <Section title={strings.todosDone} variant="form">
                <Card>{done.map(renderRow)}</Card>
              </Section>
            ) : null}
          </div>
        </Screen>
      </div>
      <TodoComposer onSend={send} />
    </div>
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

/**
 * Видимая часть окна (над клавиатурой): верх и высота, px; null — браузер не сообщает.
 * Страница под экраном не прокручивается: iPhone, сдвинувший её при открытии клавиатуры,
 * возвращается к началу — экран и шапка стоят от верха окна.
 */
function useVisibleViewport(): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const viewport = window.visualViewport;
    if (!viewport) {
      return () => {
        root.style.overflow = overflow;
      };
    }
    const update = (): void => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
      setBox({ top: Math.round(viewport.offsetTop), height: Math.round(viewport.height) });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.overflow = overflow;
    };
  }, []);
  return box;
}
