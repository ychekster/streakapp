/** POST /sync — mirrors the Sync* schemas in backend/schemas.py. */

import type { Habit, HabitInput } from "./habit";
import type { Settings, SettingsUpdate } from "./settings";

/** A habit in an operation: its id on the server, or the device's id (`ref`) for a
 *  habit the device created — the server finds it by that too. */
export type TaskKey = number | string;

/** One change made on the device, in the order it was made. */
export type SyncOperation =
  /** Mark a day done (`done: true`) or clear it. */
  | { type: "mark"; task: TaskKey; date: string; done: boolean }
  /** Freeze the habit from `date` (`frozen: true`) or unfreeze it — `date` is an
   *  ordinary day again. */
  | { type: "freeze"; task: TaskKey; date: string; frozen: boolean }
  /** Create a habit; `ref` is its id on the device (a repeat is not a duplicate). */
  | { type: "create"; ref: string; habit: HabitInput }
  /** Change a habit — all form fields, as PUT /tasks/{id}. */
  | { type: "update"; task: TaskKey; habit: HabitInput }
  /** Delete a habit (one already gone is not an error). */
  | { type: "delete"; task: TaskKey }
  /** Change settings, as PUT /settings. */
  | { type: "settings"; patch: SettingsUpdate };

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
  /** Marking day: the last day of every habit's history («YYYY-MM-DD»). */
  today: string;
}
