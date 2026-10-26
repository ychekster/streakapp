/**
 * Habits and settings live on the device; the server gets the changes a moment later.
 *
 * Every change — a check-in, a new or edited habit, a deletion, a setting — shows at
 * once: it is applied here and added to a queue of operations (kept in localStorage, so
 * it survives closing the app). The queue goes to the server in one request (POST
 * /sync) SYNC_DELAY_MS after the first unsent change, right away when the app is being
 * hidden, and is retried while there is no connection. The answer is the server's
 * state after the operations: it becomes the new snapshot (also kept on the device), and
 * the queue drops what was sent. Quick taps never wait for the network, and the app
 * opens on the kept snapshot — instantly, and without a connection.
 *
 * What the screens show = snapshot + unsent operations, counted for the marking day
 * (derive.ts) — the same numbers the server will return.
 *
 * The kept data belongs to one account (`owner`: the Telegram user or the web session):
 * another account on the same device starts from scratch.
 *
 * A habit created on the device has no server id yet: it gets a device id (`ref`, sent
 * with the operation) and is shown under a negative id; when the server answers, the
 * habit keeps that id on screen for the rest of the run (`aliases`), so open screens and
 * list keys do not change. Folders (Settings → «Папки») work the same way
 * (`folderAliases`).
 */

import { ApiRequestError, authorizationHeader, type ApiErrorCode } from "../api/client";
import { syncChanges } from "../api/sync";
import {
  MAX_FOLDERS_PER_USER,
  MAX_HABITS_PER_USER,
  OVERTIME_MAX_COUNT,
  SYNC_BATCH_SIZE,
  SYNC_DELAY_MS,
  SYNC_REFRESH_MIN_MS,
  SYNC_RETRY_MS,
} from "../constants";
import { isTelegram } from "../platform";
import { getTelegramUserId } from "../telegram/webapp";
import type { Folder, FolderHabitType, FolderInput, FolderKind } from "../types/folder";
import type { Habit, HabitInput } from "../types/habit";
import type { Settings, SettingsUpdate } from "../types/settings";
import type { FolderKey, SyncOperation, SyncResponse, TaskKey } from "../types/sync";
import { currentSessionId } from "../web/session";
import { clockIn, markingDay } from "./dates";
import {
  cleanHabitName,
  deriveFolders,
  deriveView,
  reminderTimesOf,
  reuseUnchanged,
  type Operation,
  type Snapshot,
} from "./derive";

export type DataStatus = "loading" | "ready" | "error";

/** A habit change the server refused (another device took the name meanwhile…). */
export interface RejectedChange {
  kind: "create" | "update";
  error: ApiRequestError;
}

export interface DataState {
  /** "loading" / "error" — only while there is nothing kept on the device yet. */
  status: DataStatus;
  /** Why the first load failed (status "error"). */
  error: unknown;
  habits: Habit[];
  /** Habit folders, in order; empty — the habits list has no folder tabs. */
  folders: Folder[];
  /** Where the «Все привычки» tab stands among the folders. */
  allHabitsPosition: number;
  settings: Settings | null;
  /** The last settings change the server refused; cleared when the next one starts. */
  saveError: unknown;
  rejected: RejectedChange | null;
}

const SNAPSHOT_KEY = "streak:data";
const OPS_KEY = "streak:changes";

const EMPTY: DataState = {
  status: "loading",
  error: null,
  habits: [],
  folders: [],
  allHabitsPosition: 0,
  settings: null,
  saveError: null,
  rejected: null,
};

let started = false;
let owner: string | null = null;
let snapshot: Snapshot | null = null;
let ops: Operation[] = [];
// The first `sending` operations are in the request now: they are not merged with new
// ones (see enqueue).
let sending = 0;
let inFlight = false;
// Asked for a sync while one was in flight: run another after it.
let again = false;
let flushTimer: number | undefined;
let retryTimer: number | undefined;
let retryCount = 0;
let lastSync = 0;
let state: DataState = EMPTY;
let viewDay: string | null = null;
// Clock time («HH:MM», user's zone) of the last count: an auto check-off due since then
// needs a new one.
let viewClock: string | null = null;
const listeners = new Set<() => void>();

// Ids on screen of habits created on the device (see the header comment).
let nextTempId = -1;
const tempIds = new Map<string, number>();
const refOfTemp = new Map<number, string>();
const serverIdOfRef = new Map<string, number>();
const aliases = new Map<number, number>();
const folderAliases = new Map<number, number>();

// --------------------------------------------------------------------------- //
//  Kept on the device
// --------------------------------------------------------------------------- //

function currentOwner(): string | null {
  const telegramId = isTelegram() ? getTelegramUserId() : null;
  if (telegramId !== null) {
    return `tg:${telegramId}`;
  }
  const session = currentSessionId();
  return session ? `web:${session}` : null;
}

function readKept<T>(key: string): T | null {
  try {
    const kept = JSON.parse(localStorage.getItem(key) ?? "null") as { owner?: string; value?: T } | null;
    return kept && owner !== null && kept.owner === owner && kept.value !== undefined
      ? kept.value
      : null;
  } catch {
    return null;
  }
}

function keep(key: string, value: unknown): void {
  if (owner === null) {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify({ owner, value }));
  } catch {
    // Storage full or unavailable: the data lives until the app closes.
  }
}

function isSnapshot(value: unknown): value is Snapshot {
  const candidate = value as Snapshot | null;
  return Boolean(
    candidate &&
      Array.isArray(candidate.habits) &&
      candidate.settings &&
      typeof candidate.settings === "object" &&
      typeof candidate.today === "string",
  );
}

function load(): void {
  const keptSnapshot = readKept<unknown>(SNAPSHOT_KEY);
  snapshot = isSnapshot(keptSnapshot) ? keptSnapshot : null;
  const keptOps = readKept<unknown>(OPS_KEY);
  ops = Array.isArray(keptOps) ? (keptOps as Operation[]) : [];
}

// --------------------------------------------------------------------------- //
//  What the screens show
// --------------------------------------------------------------------------- //

function emit(next: Partial<DataState>): void {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function tempIdOf(ref: string): number {
  let id = tempIds.get(ref);
  if (id === undefined) {
    id = nextTempId;
    nextTempId -= 1;
    tempIds.set(ref, id);
    refOfTemp.set(id, ref);
  }
  return id;
}

function displayIdOfKey(key: TaskKey): number {
  return typeof key === "string" ? tempIdOf(key) : (aliases.get(key) ?? key);
}

function displayIdOfFolderKey(key: FolderKey): number {
  return typeof key === "string" ? tempIdOf(key) : (folderAliases.get(key) ?? key);
}

/** The habit (or folder) an id on screen means, as operations name it. */
function keyOf(displayId: number): TaskKey {
  const ref = refOfTemp.get(displayId);
  if (ref === undefined) {
    return displayId;
  }
  return serverIdOfRef.get(ref) ?? ref;
}

function rederive(): void {
  if (!snapshot) {
    viewDay = null;
    emit({ habits: [], folders: [], allHabitsPosition: 0, settings: null });
    return;
  }
  const view = deriveView(snapshot, ops, displayIdOfKey);
  viewDay = view.today;
  viewClock = clockIn(view.settings.timezone);
  const folders = deriveFolders(snapshot, ops, view.habits, displayIdOfKey, displayIdOfFolderKey);
  emit({
    status: "ready",
    error: null,
    habits: reuseUnchanged(state.habits, view.habits),
    // The same list while nothing changed: screens that depend on it do not redraw.
    folders:
      JSON.stringify(folders.folders) === JSON.stringify(state.folders)
        ? state.folders
        : folders.folders,
    allHabitsPosition: folders.allHabitsPosition,
    settings: view.settings,
  });
}

/** The marking day changed (midnight, back from the background) or an auto check-off
 *  came due (the last reminder of such a habit passed since the last count): count it
 *  anew. */
function checkDay(): void {
  const settings = state.settings;
  if (!settings) {
    return;
  }
  const clock = clockIn(settings.timezone);
  const autoMarkCame =
    viewClock !== null &&
    state.habits.some((habit) => {
      if (!habit.auto_mark) {
        return false;
      }
      const times = reminderTimesOf(habit);
      const last = times[times.length - 1];
      return last !== undefined && viewClock! < last && last <= clock;
    });
  if (autoMarkCame || markingDay(settings.timezone, settings.mark_yesterday) !== viewDay) {
    rederive();
  }
}

// --------------------------------------------------------------------------- //
//  The queue
// --------------------------------------------------------------------------- //

function refersTo(op: Operation, key: TaskKey): boolean {
  return (op.type === "create" && op.ref === key) || ("task" in op && op.task === key);
}

function refersToFolder(op: Operation, key: FolderKey): boolean {
  return (op.type === "folder_create" && op.ref === key) || ("key" in op && op.key === key);
}

/** Add `op` to the unsent part of the queue, merged with what it makes pointless: the
 *  same day marked again, a habit edited twice, a habit created and deleted before
 *  sending, settings changed several times. */
function enqueue(op: Operation): void {
  const sent = ops.slice(0, sending);
  let unsent = ops.slice(sending);
  if (op.type === "mark") {
    unsent = unsent.filter(
      (item) => !(item.type === "mark" && item.task === op.task && item.date === op.date),
    );
    unsent.push(op);
  } else if (op.type === "update") {
    const created = unsent.findIndex((item) => item.type === "create" && item.ref === op.task);
    if (created >= 0) {
      unsent[created] = { ...(unsent[created] as Extract<Operation, { type: "create" }>), habit: op.habit };
    } else {
      unsent = unsent.filter((item) => !(item.type === "update" && item.task === op.task));
      unsent.push(op);
    }
  } else if (op.type === "delete") {
    const createdHere = unsent.some((item) => item.type === "create" && item.ref === op.task);
    unsent = unsent.filter((item) => !refersTo(item, op.task));
    if (!createdHere) {
      unsent.push(op);
    }
  } else if (op.type === "folder_update") {
    const created = unsent.findIndex((item) => item.type === "folder_create" && item.ref === op.key);
    if (created >= 0) {
      const create = unsent[created] as Extract<Operation, { type: "folder_create" }>;
      // A recommended folder stays one.
      unsent[created] = {
        ...create,
        folder: create.folder.kind
          ? { name: op.folder.name, habits: [], kind: create.folder.kind }
          : op.folder,
      };
    } else {
      unsent = unsent.filter((item) => !(item.type === "folder_update" && item.key === op.key));
      unsent.push(op);
    }
  } else if (op.type === "folder_delete") {
    const createdHere = unsent.some((item) => item.type === "folder_create" && item.ref === op.key);
    unsent = unsent.filter((item) => !refersToFolder(item, op.key));
    if (!createdHere) {
      unsent.push(op);
    }
  } else if (op.type === "folder_order") {
    unsent = unsent.filter((item) => item.type !== "folder_order");
    unsent.push(op);
  } else if (op.type === "settings") {
    const last = unsent[unsent.length - 1];
    if (last?.type === "settings" && Boolean(last.silent) === Boolean(op.silent)) {
      const patch: SettingsUpdate = { ...last.patch };
      // A time zone is a city or a zone, never both.
      if (op.patch.timezone !== undefined || op.patch.timezone_city !== undefined) {
        delete patch.timezone;
        delete patch.timezone_city;
      }
      unsent[unsent.length - 1] = {
        ...last,
        patch: { ...patch, ...op.patch },
        preview: { ...last.preview, ...op.preview },
      };
    } else {
      unsent.push(op);
    }
  } else {
    unsent.push(op);
  }
  ops = [...sent, ...unsent];
  keep(OPS_KEY, ops);
  rederive();
  scheduleFlush(SYNC_DELAY_MS);
}

function toWire(op: Operation): SyncOperation {
  if (op.type === "settings") {
    return { type: "settings", patch: op.patch };
  }
  return op;
}

// --------------------------------------------------------------------------- //
//  Sending
// --------------------------------------------------------------------------- //

function scheduleFlush(delay: number): void {
  // Not pushed back by further changes: quick taps go in one request, and a long series
  // of them still goes out every SYNC_DELAY_MS.
  if (flushTimer === undefined) {
    flushTimer = window.setTimeout(() => void flush(), delay);
  }
}

function scheduleRetry(): void {
  window.clearTimeout(retryTimer);
  const delay = SYNC_RETRY_MS[Math.min(retryCount, SYNC_RETRY_MS.length - 1)];
  retryCount += 1;
  retryTimer = window.setTimeout(() => void flush(), delay);
}

/** The server's answer to `batch`: it is the new snapshot, the batch leaves the queue. */
function acknowledge(batch: Operation[], response: SyncResponse): void {
  const failedRefs = new Set<string>();
  const failedFolderRefs = new Set<string>();
  let saveError: unknown = null;
  let rejected = null as RejectedChange | null;
  response.results.forEach((result, index) => {
    const op = batch[index];
    if (op?.type === "create") {
      if (result.ok && result.id !== null) {
        serverIdOfRef.set(op.ref, result.id);
        if (tempIds.has(op.ref)) {
          aliases.set(result.id, tempIdOf(op.ref));
        }
      } else {
        failedRefs.add(op.ref);
      }
    }
    if (op?.type === "folder_create") {
      if (result.ok && result.id !== null) {
        serverIdOfRef.set(op.ref, result.id);
        if (tempIds.has(op.ref)) {
          folderAliases.set(result.id, tempIdOf(op.ref));
        }
      } else {
        failedFolderRefs.add(op.ref);
      }
    }
    if (!op || result.ok || !result.error) {
      return;
    }
    const error = new ApiRequestError(422, result.error.code as ApiErrorCode, result.error.message);
    if (op.type === "settings" && !op.silent) {
      saveError = error;
    } else if (op.type === "create" || op.type === "update") {
      rejected = { kind: op.type, error };
    }
    // A check-in or deletion of a habit gone from the server: it just disappears.
  });

  // What is left refers to created habits and folders by their server id now; nothing is
  // left for one the server refused to create.
  const serverKey = (key: TaskKey): TaskKey =>
    typeof key === "string" ? (serverIdOfRef.get(key) ?? key) : key;
  const folderInput = (input: FolderInput): FolderInput => ({
    ...input,
    habits: input.habits
      .filter((key) => typeof key !== "string" || !failedRefs.has(key))
      .map(serverKey),
  });
  ops = ops.slice(batch.length).flatMap((op): Operation[] => {
    if (op.type === "folder_create") {
      return [{ ...op, folder: folderInput(op.folder) }];
    }
    if (op.type === "folder_update" || op.type === "folder_delete") {
      if (typeof op.key === "string" && failedFolderRefs.has(op.key)) {
        return [];
      }
      return [
        op.type === "folder_update"
          ? { ...op, key: serverKey(op.key), folder: folderInput(op.folder) }
          : { ...op, key: serverKey(op.key) },
      ];
    }
    if (op.type === "folder_order") {
      return [{ ...op, order: op.order.map((key) => (key === null ? null : serverKey(key))) }];
    }
    if (!("task" in op) || typeof op.task !== "string") {
      return [op];
    }
    if (failedRefs.has(op.task)) {
      return [];
    }
    const id = serverIdOfRef.get(op.task);
    return [id === undefined ? op : { ...op, task: id }];
  });
  snapshot = {
    habits: response.habits,
    settings: response.settings,
    folders: response.folders,
    all_habits_position: response.all_habits_position,
    today: response.today,
  };
  keep(OPS_KEY, ops);
  keep(SNAPSHOT_KEY, snapshot);
  if (saveError) {
    emit({ saveError });
  }
  if (rejected) {
    emit({ rejected });
  }
  rederive();
}

function failed(error: unknown, batchSize: number): void {
  const status = error instanceof ApiRequestError ? error.status : 0;
  if (status === 400 || status === 413 || status === 422) {
    // The request itself is refused: dropping it is the only way the changes after it
    // ever reach the server.
    ops = ops.slice(batchSize);
    keep(OPS_KEY, ops);
    rederive();
    if (ops.length > 0) {
      scheduleFlush(0);
    }
    return;
  }
  if (!snapshot) {
    emit({ status: "error", error });
  }
  // Not authorized or blocked: tried again when the app comes back to the foreground.
  if (status !== 401 && status !== 403) {
    scheduleRetry();
  }
}

/** Send the queue (or, if it is empty, just ask for the state). `keepalive` — the app
 *  is being hidden or closed: the request must outlive the page. */
async function flush(keepalive = false): Promise<void> {
  window.clearTimeout(flushTimer);
  flushTimer = undefined;
  if (inFlight) {
    again = true;
    return;
  }
  if (authorizationHeader() === null) {
    return;
  }
  window.clearTimeout(retryTimer);
  const batch = ops.slice(0, SYNC_BATCH_SIZE);
  const requestOwner = owner;
  inFlight = true;
  sending = batch.length;
  let response: SyncResponse | null = null;
  let failure: unknown = null;
  try {
    response = await syncChanges(batch.map(toWire), keepalive);
  } catch (error) {
    failure = error;
  }
  inFlight = false;
  sending = 0;
  if (requestOwner === owner) {
    if (response) {
      retryCount = 0;
      lastSync = Date.now();
      acknowledge(batch, response);
    } else {
      failed(failure, batch.length);
    }
  }
  if (again || (response && ops.length > 0)) {
    again = false;
    void flush();
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === "hidden") {
    if (ops.length > 0) {
      void flush(true);
    }
    return;
  }
  checkDay();
  if (ops.length > 0 || Date.now() - lastSync > SYNC_REFRESH_MIN_MS) {
    void flush();
  }
}

function onPageHide(): void {
  if (ops.length > 0) {
    void flush(true);
  }
}

// --------------------------------------------------------------------------- //
//  For the app
// --------------------------------------------------------------------------- //

function validateHabit(input: HabitInput, exceptId: number | null): void {
  if (cleanHabitName(input.name) === "") {
    throw new ApiRequestError(422, "invalid_name", "");
  }
  const others = state.habits.filter((habit) => habit.id !== exceptId);
  if (exceptId === null && others.length >= MAX_HABITS_PER_USER) {
    throw new ApiRequestError(409, "habit_limit", "");
  }
}

function validateFolderName(name: string): void {
  if (cleanHabitName(name) === "") {
    throw new ApiRequestError(422, "invalid_folder_name", "");
  }
}

function newRef(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function habitById(id: number): Habit {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) {
    throw new ApiRequestError(404, "task_not_found", "");
  }
  return habit;
}

/** Logged out: the account's habits and unsent changes are removed from this device. */
export function forgetKeptData(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
    localStorage.removeItem(OPS_KEY);
  } catch {
    // Nothing kept.
  }
}

export const dataStore = {
  /** Load what is kept on the device and ask the server for the state. Once. */
  start(): void {
    if (started) {
      return;
    }
    started = true;
    owner = currentOwner();
    load();
    rederive();
    window.addEventListener("online", () => void flush());
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.setInterval(checkDay, 30_000);
    void flush();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getState(): DataState {
    return state;
  },

  /** Mark or unmark the habit for the marking day. A habit done several times a day
   *  counts one more time per press; once done, a press starts the day over — with
   *  «Сверх плана» it keeps counting (up to OVERTIME_MAX_COUNT). */
  toggle(id: number): void {
    const habit = state.habits.find((item) => item.id === id);
    if (!habit?.scheduled_today || habit.frozen_since !== null || !viewDay) {
      return;
    }
    if (habit.times_per_day > 1) {
      const count = habit.overtime
        ? Math.min(habit.today_count + 1, OVERTIME_MAX_COUNT)
        : habit.done_today
          ? 0
          : Math.min(habit.today_count + 1, habit.times_per_day);
      enqueue({
        type: "mark",
        task: keyOf(id),
        date: viewDay,
        done: count >= habit.times_per_day,
        count,
      });
    } else {
      enqueue({ type: "mark", task: keyOf(id), date: viewDay, done: !habit.done_today });
    }
  },

  /** «Сверх плана»: set how many times the habit is done on the marking day (the count
   *  window, an undone run of presses); below the goal the day is not done again. */
  setCount(id: number, value: number): void {
    const habit = state.habits.find((item) => item.id === id);
    if (!habit?.overtime || !habit.scheduled_today || habit.frozen_since !== null || !viewDay) {
      return;
    }
    const count = Math.max(0, Math.min(Math.round(value), OVERTIME_MAX_COUNT));
    if (count === habit.today_count) {
      return;
    }
    enqueue({
      type: "mark",
      task: keyOf(id),
      date: viewDay,
      done: count >= habit.times_per_day,
      count,
    });
  },

  /** Freeze the habit from the marking day, or unfreeze it (the marking day is an
   *  ordinary day again). */
  setFrozen(id: number, frozen: boolean): void {
    const habit = state.habits.find((item) => item.id === id);
    if (habit && (habit.frozen_since !== null) !== frozen && viewDay) {
      enqueue({ type: "freeze", task: keyOf(id), date: viewDay, frozen });
    }
  },

  /** Create a habit; throws ApiRequestError (as the server would) if it can't be. */
  createHabit(input: HabitInput): Habit {
    validateHabit(input, null);
    const ref = newRef();
    enqueue({ type: "create", ref, habit: input });
    return habitById(tempIdOf(ref));
  },

  /** Change a habit; throws ApiRequestError (as the server would) if it can't be. */
  updateHabit(id: number, input: HabitInput): Habit {
    habitById(id);
    validateHabit(input, id);
    enqueue({ type: "update", task: keyOf(id), habit: input });
    return habitById(id);
  },

  /** Turn «Автоотметка» on or off — a change of the habit's fields; a day
   *  that is already due is marked at once (derive.ts, as the server). */
  setAutoMark(id: number, on: boolean): void {
    const habit = habitById(id);
    enqueue({
      type: "update",
      task: keyOf(id),
      habit: {
        name: habit.name,
        // Not sent when unknown (a habit saved on the device before descriptions): the
        // server keeps the one it has instead of clearing it.
        description: habit.description ?? undefined,
        frequency_type: habit.frequency_type,
        days: habit.days,
        start_date: habit.start_date,
        reminder_time: habit.reminder_time,
        reminder_times: reminderTimesOf(habit),
        color: habit.color,
        times_per_day: habit.times_per_day,
        auto_mark: on,
        overtime: habit.overtime,
      },
    });
  },

  deleteHabit(id: number): void {
    enqueue({ type: "delete", task: keyOf(id) });
  },

  /** Create a folder of these habits (ids on screen) and habit types, or a recommended one
   *  (`kind`, no habits); throws ApiRequestError (as the server would) if it can't be.
   *  Returns its id on screen. */
  createFolder(
    name: string,
    habitIds: number[],
    kind?: FolderKind,
    types: FolderHabitType[] = [],
  ): number {
    validateFolderName(name);
    if (state.folders.length >= MAX_FOLDERS_PER_USER) {
      throw new ApiRequestError(409, "folder_limit", "");
    }
    const ref = newRef();
    const folder: FolderInput = kind
      ? { name, habits: [], kind }
      : { name, habits: habitIds.map(keyOf), types };
    enqueue({ type: "folder_create", ref, folder });
    return tempIdOf(ref);
  },

  /** Change a folder's name, habits (ids on screen) and habit types. */
  updateFolder(id: number, name: string, habitIds: number[], types: FolderHabitType[] = []): void {
    validateFolderName(name);
    enqueue({
      type: "folder_update",
      key: keyOf(id),
      folder: { name, habits: habitIds.map(keyOf), types },
    });
  },

  /** Put a habit into a folder (a habit just created while the folder was open). */
  addToFolder(id: number, habitId: number): void {
    const folder = state.folders.find((item) => item.id === id);
    const picked = folder?.picked ?? folder?.habits ?? [];
    if (folder && !folder.kind && !picked.includes(habitId)) {
      dataStore.updateFolder(id, folder.name, [...picked, habitId], folder.types);
    }
  },

  deleteFolder(id: number): void {
    enqueue({ type: "folder_delete", key: keyOf(id) });
  },

  /** Put the folders (ids on screen) in this order; null — where «Все привычки» goes. */
  orderFolders(order: (number | null)[]): void {
    enqueue({ type: "folder_order", order: order.map((id) => (id === null ? null : keyOf(id))) });
  },

  /** Change settings; `preview` — how it looks until the server answers; `silent` — not
   *  the user's change (a refusal is not shown). */
  saveSettings(patch: SettingsUpdate, preview?: Partial<Settings>, silent = false): void {
    if (!silent) {
      emit({ saveError: null });
    }
    enqueue({ type: "settings", patch, preview, silent });
  },

  /** The id a habit with this server id is shown under. */
  displayId(serverId: number): number {
    return aliases.get(serverId) ?? serverId;
  },

  /** The server id of a habit shown under `id`; null — not on the server yet. */
  serverId(id: number): number | null {
    const key = keyOf(id);
    return typeof key === "number" ? key : null;
  },

  /** Try the first load again (the error screen's «Повторить»). */
  retry(): void {
    if (!snapshot) {
      emit({ status: "loading", error: null });
    }
    retryCount = 0;
    void flush();
  },

  /** Ask the server for the state now (after a push notification, …). */
  refresh(): void {
    void flush();
  },

  /** Send every unsent change now and wait for the answer (before logging out). False —
   *  some are still unsent: no connection, or the server did not answer. */
  async sendAll(): Promise<boolean> {
    for (let attempt = 0; attempt < 5 && ops.length > 0; attempt += 1) {
      while (inFlight) {
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      const before = ops.length;
      await flush();
      if (ops.length >= before) {
        break;
      }
    }
    return ops.length === 0;
  },

  /** Wait until every change has reached the server — without hurrying it, as sendAll
   *  does (quick taps still go in one request). False — still unsent after `limitMs` (no
   *  connection). */
  async settled(limitMs = 20_000): Promise<boolean> {
    for (let waited = 0; ops.length > 0 || inFlight; waited += 100) {
      if (waited >= limitMs) {
        return false;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return true;
  },

  /** A login or logout may have switched the account: another account starts from its
   *  own data; the same one just syncs. */
  switchAccount(): void {
    const next = currentOwner();
    if (next === owner) {
      void flush();
      return;
    }
    owner = next;
    snapshot = null;
    ops = [];
    load();
    state = EMPTY;
    rederive();
    emit({ status: snapshot ? "ready" : "loading" });
    void flush();
  },
};
