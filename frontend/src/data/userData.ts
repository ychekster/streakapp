/**
 * «Экспорт данных» / «Импорт данных» (Settings): a JSON file with everything the server
 * knows about the user (backend/userdata.py) and loading such a file — on another account
 * or device the habits are added to the ones already there.
 *
 * Export hands the file over the way the device can:
 *  - on a phone with the system share sheet for files — that sheet (save to Files, send to
 *    a chat or another app);
 *  - in Telegram without it (Android, desktop) — the bot sends the file to the user's chat
 *    (POST /export/telegram);
 *  - otherwise (a computer, a browser without the sheet) — the file is downloaded.
 * The sheet opens only while the browser still counts it as the user's tap (Safari), so the
 * file is loaded ahead when Settings opens (prefetchExport) and handed over at once; one
 * loaded before a change on the device is not used.
 *
 * Import picks a file, says how many habits it adds and asks, sends the device's unsent
 * changes first, then the file (POST /import), and asks for the new state.
 */

import { fetchExport, importData, sendExportToTelegram } from "../api/userdata";
import { describeError } from "../errors";
import { appPlatform, devicePlatform } from "../platform";
import { clearPressFeedback, onNextTap } from "../pressFeedback";
import type { Strings } from "../strings";
import { confirmAction, hapticNotification, showAlert } from "../telegram/webapp";
import type { DataExport } from "../types/userdata";
import { dimScreen } from "../web/dimScreen";
import { todayIn } from "./dates";
import { dataStore } from "./store";

interface ExportFile {
  name: string;
  text: string;
  /** What the device showed when it was loaded (store state parts: the same objects — the
   *  store keeps unchanged ones — or, for settings, the same text). */
  basis: readonly unknown[];
}

let kept: ExportFile | null = null;
let loading: Promise<ExportFile> | null = null;

function basis(): unknown[] {
  const state = dataStore.getState();
  return [state.habits, state.folders, JSON.stringify(state.settings), state.allHabitsPosition];
}

/** Loaded since the last change on the device. */
function fresh(file: ExportFile | null): file is ExportFile {
  const now = basis();
  return file !== null && file.basis.every((part, index) => part === now[index]);
}

async function load(): Promise<ExportFile> {
  // Changes made on the device go first: the file has them.
  await dataStore.sendAll();
  const at = basis();
  const data = await fetchExport();
  const timezone = dataStore.getState().settings?.timezone ?? null;
  kept = { name: `knot-export-${todayIn(timezone)}.json`, text: JSON.stringify(data, null, 2), basis: at };
  return kept;
}

function loadOnce(): Promise<ExportFile> {
  if (!loading) {
    loading = load().finally(() => {
      loading = null;
    });
  }
  return loading;
}

/** Load the export ahead (Settings opened); no connection — it is loaded on the tap. */
export function prefetchExport(): void {
  if (!fresh(kept)) {
    loadOnce().catch(() => undefined);
  }
}

/** The file for the system share sheet; null — no sheet for files here (or a computer:
 *  its share sheet is no way to keep a file). */
function shareable({ name, text }: ExportFile): File | null {
  if (
    devicePlatform() === "desktop" ||
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function"
  ) {
    return null;
  }
  const file = new File([text], name, { type: "application/json" });
  return navigator.canShare({ files: [file] }) ? file : null;
}

/** The system share sheet with the file. false — it could not open (not the user's tap
 *  any more): the file is handed over another way. Closed by the user — true. */
async function shareSheet(file: File, title: string): Promise<boolean> {
  // As in groups.ts: the app dims behind the sheet on the iPhone (Android's dims it itself).
  const undim = devicePlatform() === "ios" ? dimScreen() : () => undefined;
  const forgetTap = onNextTap(undim);
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError";
  } finally {
    forgetTap();
    undim();
  }
}

function download({ name, text }: ExportFile): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function handOver(strings: Strings): Promise<void> {
  const telegram = appPlatform() === "telegram";
  const ready = fresh(kept) ? kept : null;
  const sheetFile = ready ? shareable(ready) : null;
  if (sheetFile && (await shareSheet(sheetFile, strings.exportShareTitle))) {
    return;
  }
  if (telegram) {
    await dataStore.sendAll();
    await sendExportToTelegram();
    await showAlert({
      okLabel: strings.alertOk,
      title: strings.exportSentTitle,
      message: strings.exportSentMessage,
    });
    return;
  }
  const file = ready ?? (await loadOnce());
  // Loaded just now: Android still counts the tap; where it does not — a download.
  const lateFile = ready ? null : shareable(file);
  if (lateFile && (await shareSheet(lateFile, strings.exportShareTitle))) {
    return;
  }
  download(file);
}

/** «Экспорт данных». */
export async function exportData(strings: Strings): Promise<void> {
  // The tapped row does not light up behind the share sheet (pressFeedback.ts).
  clearPressFeedback();
  try {
    await handOver(strings);
  } catch (error) {
    hapticNotification("error");
    await showAlert({
      okLabel: strings.alertOk,
      title: strings.errorTitle,
      message: describeError(strings, error, strings.exportFailed),
    });
  }
}

// The file input of the last «Импорт данных» (closed without a file — it is never told).
let picker: HTMLInputElement | null = null;

/** «Импорт данных»: pick a file (right on the tap — browsers open the picker only then). */
export function importFromFile(strings: Strings): void {
  clearPressFeedback();
  picker?.remove();
  const input = document.createElement("input");
  input.type = "file";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (file) {
      void importFile(file, strings);
    }
  });
  document.body.append(input);
  picker = input;
  input.click();
}

async function readFile(file: File): Promise<{ text: string; data: DataExport } | null> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as DataExport | null;
    return data && data.format === "knot-export" ? { text, data } : null;
  } catch {
    return null;
  }
}

async function importFile(file: File, strings: Strings): Promise<void> {
  const read = await readFile(file);
  if (!read) {
    hapticNotification("error");
    await showAlert({ okLabel: strings.alertOk, title: strings.errorTitle, message: strings.importBadFile });
    return;
  }
  const habits = Array.isArray(read.data.habits) ? read.data.habits.length : 0;
  const folders = Array.isArray(read.data.folders) ? read.data.folders.length : 0;
  const confirmed = await confirmAction({
    title: strings.importConfirmTitle,
    message: strings.importConfirmMessage(habits, folders),
    confirmLabel: strings.importConfirm,
    cancelLabel: strings.importCancel,
  });
  if (!confirmed) {
    return;
  }
  try {
    // The device's own changes first: the server adds the file's habits to them.
    await dataStore.sendAll();
    const result = await importData(read.text);
    dataStore.refresh();
    hapticNotification("success");
    await showAlert({
      okLabel: strings.alertOk,
      title: strings.importDoneTitle,
      message: strings.importDoneMessage(result.habits, result.folders),
    });
  } catch (error) {
    hapticNotification("error");
    await showAlert({
      okLabel: strings.alertOk,
      title: strings.errorTitle,
      message: describeError(strings, error, strings.importFailed),
    });
  }
}
