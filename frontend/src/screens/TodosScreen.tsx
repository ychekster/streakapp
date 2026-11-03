/**
 * Вкладка «Задачи» (бета; включается в Настройки → «Задачи (Beta)»): разовые дела, не
 * привычки. Экран — список дел на сейчас, без лишнего: зашёл, прошёлся галочками.
 *
 * Сверху таблетка списков — та же, что папки привычек (FolderBar): «Все задачи» и списки,
 * только переключение (сами списки, их порядок и названия — в настройках); «Переключение
 * свайпом» листает их. Видно только «сделать сейчас» — открытые задачи без даты, на сегодня
 * и просроченные (красная подпись дня):
 *  - «Все задачи» и рекомендуемые списки — по спискам: сначала без списка, без заголовка,
 *    потом блоки с заголовками списков по порядку;
 *  - свой список — одним блоком.
 * Остальное (задачи на будущие дни — «Не запланированы на сегодня», по дню и времени, и
 * «Выполненные») — на своём экране, чтобы не мозолили глаза: его открывает неприметная серая
 * ссылка «Показать остальные» в самом низу экрана, отдельно от задач; «Назад» возвращает
 * (нижней навигации там нет, как на вложенных экранах). Отмеченная (или возвращённая)
 * задача не убегает сразу: она стоит на месте, пока список открыт (`held`), и уходит в свой
 * блок, когда сменили список или экран, — промахнулся галочкой — видно, где исправить. Рекомендуемые: «Невыполненные» (вид `today`) — только «сделать сейчас», без
 * остальных: отметил всё — пусто, «Всё выполнено»; «Запланированные» — с датой (новая в них
 * — на сегодня); «Без даты». Кружок задачи — цвета её списка (без списка — серый).
 *
 * Новая задача — карандаш в нижней навигации (на месте «+»): в конце первого блока
 * появляется пустая строка с курсором, пишешь прямо в ней; под текстом плашки дня,
 * напоминания и списка (TodoChips; список — тот, где пишешь); Enter или нажатие мимо
 * строки — задача сохранена (пустая — пропадает). Заголовок — крупный, как у «Привычек»; подзаголовки — как «Не
 * запланированы на сегодня». Данные — на устройстве, на сервер уходят через /sync.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { FolderBar, type FolderTab } from "../components/FolderBar";
import { Card, Section } from "../components/Section";
import { Screen } from "../components/Screen";
import { StatusMessage } from "../components/StatusMessage";
import { localDate } from "../components/DateField";
import { TodoRow, type TodoDraft } from "../components/TodoRow";
import { dataStore } from "../data/store";
import { describeError } from "../errors";
import { useAppData } from "../hooks/useAppData";
import { useHorizontalSwipe, type SwipeDirection } from "../hooks/useHorizontalSwipe";
import { useStrings } from "../preferences";
import { hapticImpact, showAlert } from "../telegram/webapp";
import type { Todo, TodoFolderKind } from "../types/todo";
import formStyles from "./HabitFormScreen.module.css";
import styles from "./TodosScreen.module.css";

// Карандаш (App) и открытый экран задач: пустая строка новой задачи и поле, которое
// получает фокус прямо в нажатии карандаша — иначе iPhone не откроет клавиатуру (фокус
// потом переходит в строку, клавиатура остаётся).
let openDraft: (() => void) | null = null;
let keyboardHolder: HTMLTextAreaElement | null = null;
// Номер новой строки: каждая — своя (карандаш, нажатый во время правки прежней, сохраняет
// её и открывает следующую с курсором).
let draftSeq = 0;

// Экран «остальных» (будущие и выполненные) поверх задач: App прячет навигацию и ведёт
// «Назад» (одно на всё приложение, как окно задачи).
let restOpen = false;
const restListeners = new Set<() => void>();

function setRestOpen(open: boolean): void {
  if (restOpen !== open) {
    restOpen = open;
    restListeners.forEach((listener) => listener());
  }
}

export function closeTodoRest(): void {
  setRestOpen(false);
}

/** Открыт ли экран «остальных». */
export function useTodoRestOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      restListeners.add(listener);
      return () => restListeners.delete(listener);
    },
    () => restOpen,
  );
}

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
  const showingRest = useTodoRestOpen();
  // Прокрутка списка под экраном «остальных»: «Назад» возвращает на неё.
  const scrollUnderRest = useRef(0);
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
      closeTodoRest();
    };
  }, []);

  // Экран «остальных» открывается с начала, «Назад» — на прежнее место списка.
  useEffect(() => {
    window.scrollTo(0, showingRest ? 0 : scrollUnderRest.current);
  }, [showingRest]);

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
  useHorizontalSwipe(
    settings?.todo_folder_swipe && draft === null && !showingRest ? switchList : null,
  );

  // Задачи, отмеченные (или возвращённые) в этом списке: стоят там, где были до отметки, —
  // как были отмечены тогда и с прежним местом среди выполненных. Другой список или экран —
  // всё по местам.
  const view = `${shownFolder}:${showingRest}`;
  const [heldState, setHeldState] = useState<{ view: string; held: Map<number, Todo> }>({
    view,
    held: new Map(),
  });
  const held = heldState.view === view ? heldState.held : EMPTY_HELD;
  const hold = (todo: Todo): void => {
    if (!held.has(todo.id)) {
      setHeldState({ view, held: new Map(held).set(todo.id, todo) });
    }
  };

  // День устройства — как в выборе даты (DateField); пересчёт — с каждой отрисовкой.
  const today = localDate();
  const { groups, later, done } = useMemo(() => {
    const inView = (todo: Todo): boolean =>
      kind ? inKind(kind, todo, today) : shownFolder === null || todo.folder === shownFolder;
    const isLater = (todo: Todo): boolean => (todo.due_date ?? "") > today;
    // Где задача стоит: отмеченная здесь — по тому, какой была до отметки.
    const doneAt = (todo: Todo): string | null =>
      (held.get(todo.id) ?? todo).done_at;
    const pending = todos.filter((todo) => doneAt(todo) === null && inView(todo));
    const open = pending.filter((todo) => !isLater(todo));
    // «Невыполненные» — только «сделать сейчас»: ни будущих, ни выполненных.
    const upcoming =
      kind === "today"
        ? []
        : pending
            .filter(isLater)
            .sort(
              (a, b) =>
                (a.due_date ?? "").localeCompare(b.due_date ?? "") ||
                (a.remind_time ?? "").localeCompare(b.remind_time ?? ""),
            );
    const checked =
      kind === "today"
        ? []
        : todos
            .filter((todo) => doneAt(todo) !== null && inView(todo))
            .sort((a, b) => (doneAt(b) ?? "").localeCompare(doneAt(a) ?? ""));
    const own = todoFolders.filter((item) => !item.kind);
    const known = new Set(own.map((item) => item.id));
    const loose = open.filter((todo) => todo.folder === null || !known.has(todo.folder));
    // Первая группа — та, куда встаёт новая задача: свой список или «без списка».
    const sections: {
      key: string;
      title?: string;
      todos: Todo[];
      target?: boolean;
    }[] = [];
    if (shownFolder !== null && !kind) {
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
  }, [todos, todoFolders, shownFolder, kind, today, held]);
  // Новая задача в «Запланированных» — на сегодня (иначе её там не было бы).
  const newDate = kind === "scheduled" ? today : undefined;
  // Свои списки: плашка списка у задачи и цвет её кружка.
  const lists = useMemo(() => todoFolders.filter((item) => !item.kind), [todoFolders]);

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

  const saveDraft = (key: number, next: TodoDraft): void => {
    closeDraft(key);
    try {
      dataStore.createTodo(next.text, next.folder, next.due_date, next.remind_time);
    } catch (error) {
      fail(error);
    }
  };

  /** Правка задачи: в очередь — только изменённое. */
  const saveTodo = (todo: Todo, next: TodoDraft): void => {
    const change: Parameters<typeof dataStore.updateTodo>[1] = {};
    if (next.text !== todo.text) {
      change.text = next.text;
    }
    if (next.folder !== todo.folder) {
      change.folder = next.folder;
    }
    if (next.due_date !== (todo.due_date ?? null)) {
      change.due_date = next.due_date;
    }
    if (next.remind_time !== (todo.remind_time ?? null)) {
      change.remind_time = next.remind_time;
    }
    if (Object.keys(change).length > 0) {
      dataStore.updateTodo(todo.id, change);
    }
  };

  // Вкладки таблетки: списки и «Все задачи» на своём месте, как папки привычек.
  const tabs: FolderTab[] = todoFolders.map((item) => ({
    key: String(item.id),
    label: item.name,
  }));
  tabs.splice(Math.min(todoAllPosition, tabs.length), 0, {
    key: "all",
    label: strings.todosAll,
  });

  const nowEmpty = draft === null && groups.every((group) => group.todos.length === 0);
  const rest = later.length + done.length;
  const shownGroups = groups.filter(
    (group) => group.todos.length > 0 || (group.target && draft !== null),
  );

  if (showingRest) {
    return (
      <Screen
        title={folder ? folder.name : strings.todosAll}
        withTabBar={false}
        enterAnimation
        pinnedTitle
      >
        <div className={`${formStyles.pinned} ${styles.todos}`}>
          {rest === 0 ? <StatusMessage icon="check" title={strings.todosRestEmpty} /> : null}
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
      </Screen>
    );
  }

  return (
    <Screen title={strings.todosTitle}>
      <div className={styles.todos}>
        {todoFolders.length > 0 ? (
          <FolderBar
            tabs={tabs}
            active={shownFolder === null ? "all" : String(shownFolder)}
            onSelect={(key) => {
              hapticImpact("light");
              setActive(key === "all" ? null : Number(key));
            }}
          />
        ) : null}
        {nowEmpty ? (
          rest === 0 && kind !== "today" ? (
            <StatusMessage
              icon="check"
              title={strings.todosEmptyTitle}
              description={strings.todosEmptyDescription}
            />
          ) : (
            <StatusMessage
              icon="check"
              title={strings.todosAllDoneTitle}
              description={strings.todosAllDoneDescription}
            />
          )
        ) : null}
        {shownGroups.map((group) => (
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
                    due_date: newDate ?? null,
                  }}
                  startEditing
                  checkRight={checksRight}
                  lists={lists}
                  onToggle={() => undefined}
                  onSave={(next) => saveDraft(draft, next)}
                  onDelete={() => closeDraft(draft)}
                />
              ) : null}
            </Card>
          </Section>
        ))}
        {rest > 0 ? (
          <button
            type="button"
            className={styles.restLink}
            onClick={() => {
              scrollUnderRest.current = window.scrollY;
              setRestOpen(true);
            }}
          >
            {strings.todosShowRest(rest)}
          </button>
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
          hold(todo);
          dataStore.updateTodo(todo.id, { done: todo.done_at === null });
        }}
        onSave={(next) => saveTodo(todo, next)}
        onDelete={() => dataStore.deleteTodo(todo.id)}
        checkRight={checksRight}
        lists={lists}
      />
    );
  }
}

const EMPTY_HELD = new Map<number, Todo>();

/** Задача в рекомендуемом списке `kind` (`today` — день устройства «ГГГГ-ММ-ДД»). */
function inKind(kind: TodoFolderKind, todo: Todo, today: string): boolean {
  // Выполненные «Невыполненным» не нужны — их отсекает разбор выше.
  const date = todo.due_date ?? null;
  if (kind === "today") {
    // Без даты — тоже на сегодня: висит, пока не сделана.
    return date === null || date <= today;
  }
  return kind === "scheduled" ? date !== null : date === null;
}
