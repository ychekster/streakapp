/** Habit folders — mirror the Folder* schemas in backend/schemas.py. */

import type { FOLDER_HABIT_TYPES, FOLDER_KINDS } from "../constants";
import type { TaskKey } from "./sync";

/** A recommended folder: it fills itself (FOLDER_KINDS). */
export type FolderKind = (typeof FOLDER_KINDS)[number];

/** A habit type a folder takes in: all habits of it, new ones too (FOLDER_HABIT_TYPES). */
export type FolderHabitType = (typeof FOLDER_HABIT_TYPES)[number];

/** A folder: its name is a tab above the habits list, which then shows only its habits. */
export interface Folder {
  id: number;
  name: string;
  /** Habits in the folder, in the habits list's order. A recommended folder's are worked
   *  out on the device (the server sends none). */
  habits: number[];
  /** Habit types whose habits are all in the folder. Not in folders kept on the device
   *  before types. */
  types?: FolderHabitType[];
  /** On the device: the habits picked by hand (`habits` also has those of `types`). */
  picked?: number[];
  /** A recommended folder; null — the user picks its habits. Not in folders kept on the
   *  device before recommended ones. */
  kind?: FolderKind | null;
}

/** A folder's fields (folder_create / folder_update in POST /sync). */
export interface FolderInput {
  name: string;
  habits: TaskKey[];
  /** Habit types whose habits are all in the folder; none — only `habits`. */
  types?: FolderHabitType[];
  /** Only when a recommended folder is created; a folder's kind never changes. */
  kind?: FolderKind;
}
