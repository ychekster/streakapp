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
 * (нижней навигации там нет, как на вложенных экранах).
 *
 * Выполненные сегодня — зачёркнутыми внизу своего блока (списка), до конца дня; назавтра
 * они в «Выполненных» на экране остальных, а здесь — чисто. Отмеченная (или возвращённая)
 * задача не убегает сразу: она стоит на месте (`held`), и через SETTLE_MS после последней
 * галочки плавно переезжает на своё место (FLIP: строки сдвигаются из прежних мест).
 * Промахнулся галочкой — успел вернуть, ничего не сдвинулось. На экране остальных
 * отмеченная стоит на месте, пока он открыт.
 *
 * Рекомендуемые: «Невыполненные» (вид `today`) — только «сделать сейчас», без остальных и
 * без выполненных (отмеченная уходит через ту же паузу): отметил всё — «Всё выполнено»; «Запланированные» — с датой (новая в них
 * — на сегодня); «Без даты». Кружок задачи — цвета её списка (без списка — серый).
 *
 * Новая задача — карандаш в нижней навигации (на месте «+»): в начале первого блока
 * появляется пустая строка с курсором, пишешь прямо в ней; под текстом плашки дня,
 * напоминания и списка (TodoChips; список — тот, где пишешь); нажатие мимо
 * строки — задача сохранена (пустая — пропадает), «Добавить» на месте кружка — тоже. Заголовок — крупный, как у «Привычек»; подзаголовки — как «Не
 * запланированы на сегодня». Данные — на устройстве, на сервер уходят через /sync.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

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
import type { Todo, TodoFolder, TodoFolderKind } from "../types/todo";
import formStyles from "./HabitFormScreen.module.css";
import { playMotion, takeSnapshot, type MotionSnapshot } from "./todoMotion";
import styles from "./TodosScreen.module.css";

/** Сколько отмеченная задача стоит на месте после последней галочки (мс). */
const SETTLE_MS = 700;

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

/** Сколько задач в списке (настройки → «Списки»): в своём — все его задачи, в
 *  рекомендуемом — невыполненные, которые он сам в себя берёт (как экран задач). */
export function todoListCount(list: TodoFolder, todos: Todo[], markYesterday: boolean): number {
  if (!list.kind) {
    return todos.filter((todo) => todo.folder === list.id).length;
  }
  const kind = list.kind;
  const today = markYesterday ? localDate(-1) : localDate();
  return todos.filter((todo) => todo.done_at === null && inKind(kind, todo, today)).length;
}

/** Карандаш: новая пустая задача первой строкой списка выбранной папки. */
export function startNewTodo(): void {
  keyboardHolder?.focus({ preventScroll: true });
  openDraft?.();
}

export function TodosScreen() {
  const strings = useStrings();
  const { todos, todoFolders, todoAllPosition, settings } = useAppData();
  const checksRight = settings?.todo_checks_right ?? false;
  // «Скрыть названия списков»: в «Все задачи» и рекомендуемых — блоки без заголовков.
  const hideListNames = settings?.todo_hide_list_names ?? false;
  const [active, setActive] = useState<number | null>(null);
  const showingRest = useTodoRestOpen();
  // Прокрутка списка под экраном «остальных»: «Назад» возвращает на неё.
  const scrollUnderRest = useRef(0);
  // Новая задача, которую сейчас пишут (ещё не сохранена): номер её строки.
  const [draft, setDraft] = useState<number | null>(null);
  const holderRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    openDraft = () => {
      // Строки ниже плавно уступают место новой (todoMotion).
      prepareMotion();
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

  // Свайп влево — следующий список, вправо — предыдущий (всегда включён).
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
  useHorizontalSwipe(draft === null && !showingRest ? switchList : null);

  // Задачи, отмеченные (или возвращённые) в этом списке: стоят там, где были до отметки, —
  // как были отмечены тогда. На экране задач — до конца паузы после последней галочки, на
  // экране остальных — пока он открыт. Другой список или экран — всё по местам.
  const view = `${shownFolder}:${showingRest}`;
  const [heldState, setHeldState] = useState<{ view: string; held: Map<number, Todo> }>({
    view,
    held: new Map(),
  });
  const held = heldState.view === view ? heldState.held : EMPTY_HELD;
  const listRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  // Снимок экрана до перемены (todoMotion): следующая отрисовка плавно переводит из него.
  const motion = useRef<{
    before: MotionSnapshot;
    alias: { from: string; to: string } | null;
  } | null>(null);
  // Перерисовать экран вместе с переменой: она бывает только внутри строки (правка
  // закрылась, плашки ушли), а переезд запускает отрисовка экрана (useLayoutEffect ниже).
  const [, setMotionTick] = useState(0);

  /** Перед переменой (сохранение, удаление, переезд после галочки): снять, где что стоит. */
  const prepareMotion = (): void => {
    const before = takeSnapshot(listRef.current);
    motion.current = before ? { before, alias: null } : null;
    setMotionTick((tick) => tick + 1);
  };

  useEffect(() => () => window.clearTimeout(settleTimer.current), [view]);

  const hold = (todo: Todo): void => {
    if (!held.has(todo.id)) {
      setHeldState({ view, held: new Map(held).set(todo.id, todo) });
    }
    if (showingRest) {
      return;
    }
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      prepareMotion();
      setHeldState({ view, held: new Map() });
    }, SETTLE_MS);
  };

  // Перемена отрисована: строки и блоки плавно едут из прежних мест (todoMotion).
  useLayoutEffect(() => {
    const pending = motion.current;
    motion.current = null;
    if (pending) {
      playMotion(listRef.current, pending.before, pending.alias);
    }
  });

  // «Сегодня» задач — день отметки, как во всём приложении: день устройства (как в выборе
  // даты, DateField), а в «Отмечать за вчера» — вчерашний: настоящее сегодня ещё не
  // наступило (его задачи — в будущих), вчерашние не просрочены. Пересчёт — с каждой
  // отрисовкой.
  const today = settings?.mark_yesterday ? localDate(-1) : localDate();
  const { groups, later, done } = useMemo(() => {
    const inView = (todo: Todo): boolean =>
      kind ? inKind(kind, todo, today) : shownFolder === null || todo.folder === shownFolder;
    const isLater = (todo: Todo): boolean => (todo.due_date ?? "") > today;
    // Где задача стоит: отмеченная здесь — по тому, какой была до отметки.
    const doneAt = (todo: Todo): string | null =>
      (held.get(todo.id) ?? todo).done_at;
    const doneToday = (todo: Todo): boolean => {
      const at = doneAt(todo);
      return at !== null && dayOf(at) >= today;
    };
    const pending = todos.filter((todo) => doneAt(todo) === null && inView(todo));
    // Сделать сейчас, а под ними — выполненные сегодня: только что отмеченная — первой из них,
    // сразу под невыполненными (над прежними выполненными).
    const open = [
      ...pending.filter((todo) => !isLater(todo)).sort(byWhen),
      ...(kind === "today"
        ? []
        : todos
            .filter((todo) => doneToday(todo) && inView(todo))
            .sort((a, b) => (doneAt(b) ?? "").localeCompare(doneAt(a) ?? ""))),
    ];
    // «Невыполненные» — только «сделать сейчас»: ни будущих, ни выполненных.
    // Будущие — одним блоком, но по спискам (без списка — первыми, дальше списки по порядку,
    // как блоки экрана задач), внутри списка — по дню и времени.
    const listOrder = new Map(
      todoFolders.filter((item) => !item.kind).map((item, index) => [item.id, index + 1]),
    );
    const listIndex = (todo: Todo): number =>
      todo.folder === null ? 0 : (listOrder.get(todo.folder) ?? 0);
    const upcoming =
      kind === "today"
        ? []
        : pending
            .filter(isLater)
            .sort((a, b) => listIndex(a) - listIndex(b) || byWhen(a, b));
    const checked =
      kind === "today"
        ? []
        : todos
            .filter((todo) => doneAt(todo) !== null && !doneToday(todo) && inView(todo))
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
          title: hideListNames ? undefined : item.name,
          todos: open.filter((todo) => todo.folder === item.id),
        });
      }
    }
    return {
      groups: sections.filter((section) => section.todos.length > 0 || section.target),
      later: upcoming,
      done: checked,
    };
  }, [todos, todoFolders, shownFolder, kind, today, held, hideListNames]);
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
  const closeDraft = (key: number): void => {
    prepareMotion();
    setDraft((current) => (current === key ? null : current));
  };

  const saveDraft = (key: number, next: TodoDraft): void => {
    closeDraft(key);
    try {
      const id = dataStore.createTodo(next.text, next.folder, next.due_date, next.remind_time);
      // Новая задача едет на своё место из строки ввода (её data-todo — 0).
      if (motion.current) {
        motion.current.alias = { from: "0", to: String(id) };
      }
    } catch (error) {
      fail(error);
    }
  };

  const toggle = (todo: Todo): void => {
    hapticImpact("light");
    hold(todo);
    dataStore.updateTodo(todo.id, { done: todo.done_at === null });
  };

  /** Правка задачи: в очередь — только изменённое. */
  const saveTodo = (todo: Todo, next: TodoDraft): void => {
    // И без перемен правка закрывается (плашки уходят) — строки ниже плавно поднимаются.
    prepareMotion();
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
        <div ref={listRef} className={`${formStyles.pinned} ${styles.todos}`}>
          {rest === 0 ? <StatusMessage icon="check" title={strings.todosRestEmpty} /> : null}
          {later.length > 0 ? (
            <Section title={strings.todosLater} variant="form" motionKey="later">
              <Card>{later.map(renderRow)}</Card>
            </Section>
          ) : null}
          {done.length > 0 ? (
            <Section title={strings.todosDone} variant="form" motionKey="done">
              <Card>{done.map(renderRow)}</Card>
            </Section>
          ) : null}
        </div>
      </Screen>
    );
  }

  return (
    <Screen title={strings.todosTitle}>
      <div ref={listRef} className={styles.todos}>
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
          <Section key={group.key} title={group.title} variant="form" motionKey={group.key}>
            <Card>
              {/* Новая задача — первой строкой блока. */}
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
                  markDay={today}
                  onToggle={() => undefined}
                  onSave={(next) => saveDraft(draft, next)}
                  onDelete={() => closeDraft(draft)}
                />
              ) : null}
              {group.todos.map(renderRow)}
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
        onToggle={() => toggle(todo)}
        onSave={(next) => saveTodo(todo, next)}
        onEditStart={prepareMotion}
        markDay={today}
        onDelete={() => {
          prepareMotion();
          dataStore.deleteTodo(todo.id);
        }}
        checkRight={checksRight}
        lists={lists}
      />
    );
  }
}

const EMPTY_HELD = new Map<number, Todo>();

/** Порядок невыполненных в блоке: без даты — первыми (в порядке добавления), потом по дню
 *  (раньше — выше); в один день без времени — выше, потом по времени. Сортировка
 *  устойчивая: равные остаются в порядке добавления. */
function byWhen(a: Todo, b: Todo): number {
  const dayA = a.due_date ?? "";
  const dayB = b.due_date ?? "";
  return dayA.localeCompare(dayB) || (a.remind_time ?? "").localeCompare(b.remind_time ?? "");
}

/** День устройства «ГГГГ-ММ-ДД» момента `iso` (как localDate). */
function dayOf(iso: string): string {
  const moment = new Date(iso);
  const month = String(moment.getMonth() + 1).padStart(2, "0");
  return `${moment.getFullYear()}-${month}-${String(moment.getDate()).padStart(2, "0")}`;
}

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
