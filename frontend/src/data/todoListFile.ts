/**
 * Export and import of one todo list (beta): «Экспортировать» / «Импортировать» in the
 * list's menu (hold its tab on the Tasks screen) and in its form (Settings → «Списки»).
 *
 * The file is built on the device from what it shows (works offline too): the list's
 * name and color and its todos (text, date, reminder, done or not). «Все задачи» — all
 * todos; a recommended list — the todos it takes in. It is handed over as the full export
 * is (data/userData.ts): the system share sheet, or in Telegram without one the bot sends
 * it to the user's chat (POST /export/telegram/todo-list), or a download.
 *
 * Import picks a file — such a list file or a full «Экспорт данных» file (its todos) —,
 * asks, and adds the todos to the list through the change queue (dataStore.createTodo),
 * so it works offline as any other new todo. Into «Все задачи» and a recommended list they
 * go without a list; in «На сегодня» / «Запланированные» an undated one gets today (or it
 * would not be in the list it was imported to). Past the todo limit only the first ones.
 */

import { sendTodoListToTelegram } from "../api/userdata";
import { localDate } from "../components/DateField";
import { MAX_TODOS_PER_USER, TODO_TEXT_MAX_LENGTH } from "../constants";
import { describeError } from "../errors";
import { appPlatform } from "../platform";
import { clearPressFeedback } from "../pressFeedback";
import type { Strings } from "../strings";
import { confirmAction, hapticNotification, showAlert } from "../telegram/webapp";
import type { HabitColor } from "../types/habit";
import type { Todo, TodoFolder } from "../types/todo";
import { inTodoKind } from "./derive";
import { dataStore } from "./store";
import { download, shareable, shareSheet } from "./userData";

export const TODO_LIST_FORMAT = "knot-todo-list";
const TODO_LIST_VERSION = 1;

/** A todo in the file. */
interface FileTodo {
  text: string;
  due_date?: string | null;
  remind_time?: string | null;
  done?: boolean;
}

/** The list file (mirrors schemas.TodoListFile on the server). */
interface TodoListFile {
  format: typeof TODO_LIST_FORMAT;
  version: number;
  name: string;
  color?: HabitColor | null;
  todos: FileTodo[];
}

/** The list a menu or form acts on: a list, or null — «Все задачи». */
export type TodoListTarget = TodoFolder | null;

/** The marking day: tasks' «today», the device's day (TodosScreen). */
function markDay(): string {
  return dataStore.getState().settings?.mark_yesterday ? localDate(-1) : localDate();
}

/** The todos the list holds, as its tab shows them (open and done). */
export function todosOfList(list: TodoListTarget, todos: readonly Todo[]): Todo[] {
  if (list === null) {
    return [...todos];
  }
  if (list.kind) {
    const kind = list.kind;
    const today = markDay();
    return todos.filter((todo) => inTodoKind(kind, todo, today));
  }
  return todos.filter((todo) => todo.folder === list.id);
}

function fileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 40) || "list";
  return `knot-list-${safe}-${markDay()}.json`;
}

// --------------------------------------------------------------------------- //
//  Export
// --------------------------------------------------------------------------- //

/** «Экспортировать»: the list's file to the share sheet, the bot chat or a download. */
export async function exportTodoList(
  list: TodoListTarget,
  strings: Strings,
): Promise<void> {
  clearPressFeedback();
  const { todos } = dataStore.getState();
  const name = list?.name ?? strings.todosAll;
  const file: TodoListFile = {
    format: TODO_LIST_FORMAT,
    version: TODO_LIST_VERSION,
    name,
    color: list?.color ?? null,
    todos: todosOfList(list, todos).map((todo) => ({
      text: todo.text,
      due_date: todo.due_date ?? null,
      remind_time: todo.remind_time ?? null,
      done: todo.done_at !== null,
    })),
  };
  const text = JSON.stringify(file, null, 2);
  const named = { name: fileName(name), text };
  try {
    const sheetFile = shareable(named);
    if (sheetFile && (await shareSheet(sheetFile, strings.todoListShareTitle(name)))) {
      return;
    }
    if (appPlatform() === "telegram") {
      await sendTodoListToTelegram(text);
      await showAlert({
        okLabel: strings.alertOk,
        title: strings.exportSentTitle,
        message: strings.todoListExportSentMessage,
      });
      return;
    }
    download(named);
  } catch (error) {
    hapticNotification("error");
    await showAlert({
      okLabel: strings.alertOk,
      title: strings.errorTitle,
      message: describeError(strings, error, strings.exportFailed),
    });
  }
}

// --------------------------------------------------------------------------- //
//  Import
// --------------------------------------------------------------------------- //

let picker: HTMLInputElement | null = null;

/** «Импортировать»: pick a file right on the tap (browsers open the picker only then). */
export function importTodoList(list: TodoListTarget, strings: Strings): void {
  clearPressFeedback();
  picker?.remove();
  const input = document.createElement("input");
  input.type = "file";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (file) {
      void importFile(file, list, strings);
    }
  });
  document.body.append(input);
  picker = input;
  input.click();
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** The todos of a list file or a full export file; null — neither. */
export function readTodos(data: unknown): FileTodo[] | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (
    (record.format !== TODO_LIST_FORMAT && record.format !== "knot-export") ||
    !Array.isArray(record.todos)
  ) {
    return record.format === "knot-export" ? [] : null;
  }
  const todos: FileTodo[] = [];
  for (const item of record.todos as unknown[]) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const todo = item as Record<string, unknown>;
    if (typeof todo.text !== "string" || todo.text.trim() === "") {
      continue;
    }
    const due = typeof todo.due_date === "string" && DATE.test(todo.due_date) ? todo.due_date : null;
    const time =
      due && typeof todo.remind_time === "string" && TIME.test(todo.remind_time)
        ? todo.remind_time
        : null;
    todos.push({
      text: todo.text.slice(0, TODO_TEXT_MAX_LENGTH),
      due_date: due,
      remind_time: time,
      // A list file says `done`, a full export `done_at`.
      done: todo.done === true || (typeof todo.done_at === "string" && todo.done_at !== ""),
    });
  }
  return todos;
}

async function importFile(file: File, list: TodoListTarget, strings: Strings): Promise<void> {
  let todos: FileTodo[] | null;
  try {
    todos = readTodos(JSON.parse(await file.text()));
  } catch {
    todos = null;
  }
  const alert = (title: string, message: string): Promise<void> =>
    showAlert({ okLabel: strings.alertOk, title, message });
  if (todos === null) {
    hapticNotification("error");
    await alert(strings.errorTitle, strings.todoListImportBadFile);
    return;
  }
  if (todos.length === 0) {
    await alert(strings.todoListImportTitle, strings.todoListImportEmpty);
    return;
  }
  const name = list?.name ?? strings.todosAll;
  const left = MAX_TODOS_PER_USER - dataStore.getState().todos.length;
  if (left <= 0) {
    hapticNotification("error");
    await alert(strings.errorTitle, strings.todoListImportFull);
    return;
  }
  const confirmed = await confirmAction({
    title: strings.todoListImportTitle,
    message:
      todos.length > left
        ? strings.todoListImportLimitMessage(todos.length, name, left)
        : strings.todoListImportMessage(todos.length, name),
    confirmLabel: strings.importConfirm,
    cancelLabel: strings.importCancel,
  });
  if (!confirmed) {
    return;
  }
  const added = addTodos(list, todos.slice(0, left));
  hapticNotification("success");
  await alert(strings.todoListImportDoneTitle, strings.todoListImportDoneMessage(added, name));
}

/** Add the file's todos to the list; how many were added. */
export function addTodos(list: TodoListTarget, todos: readonly FileTodo[]): number {
  const folder = list && !list.kind ? list.id : null;
  const today = markDay();
  const needsDate = list?.kind === "due_today" || list?.kind === "scheduled";
  let added = 0;
  for (const todo of todos) {
    const due = todo.due_date ?? (needsDate ? today : null);
    try {
      const id = dataStore.createTodo(todo.text, folder, due, due ? todo.remind_time : null);
      if (todo.done) {
        dataStore.updateTodo(id, { done: true });
      }
      added += 1;
    } catch {
      // Over the limit or an empty text: the rest is not added.
      break;
    }
  }
  return added;
}
