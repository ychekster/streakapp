/** Habit folders — mirror the Folder* schemas in backend/schemas.py. */

import type { FOLDER_KINDS } from "../constants";
import type { TaskKey } from "./sync";

/** A recommended folder: it fills itself (FOLDER_KINDS). */
export type FolderKind = (typeof FOLDER_KINDS)[number];

/** A folder: its name is a tab above the habits list, which then shows only its habits. */
export interface Folder {
  id: number;
  name: string;
  /** Habits in the folder, in the habits list's order. A recommended folder's are worked
   *  out on the device (the server sends none). */
  habits: number[];
  /** A recommended folder; null — the user picks its habits. Not in folders kept on the
   *  device before recommended ones. */
  kind?: FolderKind | null;
}

/** A folder's fields (folder_create / folder_update in POST /sync). */
export interface FolderInput {
  name: string;
  habits: TaskKey[];
  /** Only when a recommended folder is created; a folder's kind never changes. */
  kind?: FolderKind;
}
