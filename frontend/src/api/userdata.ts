/** «Экспорт данных» / «Импорт данных» (Settings): the file with everything about the
 *  user (GET /export), the same file sent by the bot (POST /export/telegram) and loading
 *  such a file (POST /import). See data/userData.ts. */

import type { DataExport, ImportResult } from "../types/userdata";
import { apiRequest } from "./client";

/** A file can be large: a longer wait than the usual request. */
const FILE_TIMEOUT_MS = 60_000;

export function fetchExport(): Promise<DataExport> {
  return apiRequest<DataExport>("/export", {}, FILE_TIMEOUT_MS);
}

export async function sendExportToTelegram(): Promise<void> {
  await apiRequest<null>("/export/telegram", { method: "POST" }, FILE_TIMEOUT_MS);
}

/** `text` — the file as it is (JSON). */
export function importData(text: string): Promise<ImportResult> {
  return apiRequest<ImportResult>("/import", { method: "POST", body: text }, FILE_TIMEOUT_MS);
}
