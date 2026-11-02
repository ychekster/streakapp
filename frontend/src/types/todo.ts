/** Todos (beta; Settings → «Задачи») — mirror TodoView / TodoFolderView in backend/schemas.py.
 *  One-off tasks in folders, not tied to habits. */

import type { TODO_FOLDER_KINDS } from "../constants";
import type { HabitColor } from "./habit";

/** A recommended todo list: it fills itself (TODO_FOLDER_KINDS). */
export type TodoFolderKind = (typeof TODO_FOLDER_KINDS)[number];

/** A todo folder: a tab above the todo list. «Все задачи» is not stored, it is always first. */
export interface TodoFolder {
  id: number;
  name: string;
  /** A recommended list; null — the user's own. Not in lists kept before kinds. */
  kind?: TodoFolderKind | null;
  /** The list's color (as a habit's): its todos' checkmarks; null — gray. */
  color?: HabitColor | null;
}

export interface Todo {
  id: number;
  text: string;
  /** null — no folder (shown on top of «Все задачи»). */
  folder: number | null;
  /** When it was checked (ISO, UTC); null — open. */
  done_at: string | null;
  /** ISO, UTC: open todos go in this order. */
  created_at: string;
  /** Its day («YYYY-MM-DD»); null — no date. Not in todos kept before dates. */
  due_date?: string | null;
  /** A reminder on that day, «HH:MM» in the user's zone; null — none. */
  remind_time?: string | null;
}
