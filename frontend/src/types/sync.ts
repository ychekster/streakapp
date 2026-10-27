/** POST /sync — mirrors the Sync* schemas in backend/schemas.py. */

import type { Folder, FolderInput } from "./folder";
import type { Habit, HabitInput } from "./habit";
import type { Settings, SettingsUpdate } from "./settings";

/** A habit in an operation: its id on the server, or the device's id (`ref`) for a
 *  habit the device created — the server finds it by that too. */
export type TaskKey = number | string;

/** One change made on the device, in the order it was made. */
export type SyncOperation =
  /** Mark a day done (`done: true`) or clear it. A habit done several times a day also
   *  sends `count` — times done that day (the server sets `done` from it). */
  | { type: "mark"; task: TaskKey; date: string; done: boolean; count?: number }
  /** A note to the day `date`; empty `text` — remove it. */
  | { type: "note"; task: TaskKey; date: string; text: string }
  /** Freeze the habit from `date` (`frozen: true`) or unfreeze it — `date` is an
   *  ordinary day again. */
  | { type: "freeze"; task: TaskKey; date: string; frozen: boolean }
  /** A time goal's timer: started (`date` — the day its time goes to, `started_at` — ISO
   *  moment) or taken off (`task` null). A stopped timer's time is sent before it, as a
   *  mark with the day's seconds. */
  | { type: "timer"; task: TaskKey | null; date?: string; started_at?: string }
  /** Create a habit; `ref` is its id on the device (a repeat is not a duplicate). */
  | { type: "create"; ref: string; habit: HabitInput }
  /** Change a habit — all form fields, as PUT /tasks/{id}. */
  | { type: "update"; task: TaskKey; habit: HabitInput }
  /** Delete a habit (one already gone is not an error). */
  | { type: "delete"; task: TaskKey }
  /** Change settings, as PUT /settings. */
  | { type: "settings"; patch: SettingsUpdate }
  /** Create a folder (last in the row); `ref` is its id on the device. */
  | { type: "folder_create"; ref: string; folder: FolderInput }
  /** Change a folder — name and habits, whole. */
  | { type: "folder_update"; key: FolderKey; folder: FolderInput }
  /** Delete a folder (one already gone is not an error). */
  | { type: "folder_delete"; key: FolderKey }
  /** The order of the folders; null — where «Все привычки» stands. */
  | { type: "folder_order"; order: (FolderKey | null)[] };

/** A folder in an operation: its id on the server or the device's id (`ref`). */
export type FolderKey = number | string;

export interface SyncResult {
  ok: boolean;
  /** Created habit: its id on the server. */
  id: number | null;
  error: { code: string; message: string } | null;
}

/** The results of the operations (same order) and the state after them. */
export interface SyncResponse {
  results: SyncResult[];
  habits: Habit[];
  settings: Settings;
  folders: Folder[];
  /** Where «Все привычки» stands among the folders (how many folders are before it). */
  all_habits_position: number;
  /** Marking day: the last day of every habit's history («YYYY-MM-DD»). */
  today: string;
  /** The running timer; null — none (no field — a server before timers). */
  timer?: RunningTimer | null;
}

/** The user's running timer (a time goal), the same on all their devices. */
export interface RunningTimer {
  task: number;
  /** The day its time goes to («YYYY-MM-DD»). */
  date: string;
  /** Since when (ISO, UTC). */
  started_at: string;
}
