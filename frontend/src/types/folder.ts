/** Habit folders — mirror the Folder* schemas in backend/schemas.py. */

import type { TaskKey } from "./sync";

/** A folder: its name is a tab above the habits list, which then shows only its habits. */
export interface Folder {
  id: number;
  name: string;
  /** Habits in the folder, in the habits list's order. */
  habits: number[];
}

/** A folder's fields (folder_create / folder_update in POST /sync). */
export interface FolderInput {
  name: string;
  habits: TaskKey[];
}
