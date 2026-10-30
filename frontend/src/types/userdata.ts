/** «Экспорт данных» / «Импорт данных» — mirror DataExport and ImportResult in
 *  backend/schemas.py. The app only hands the file over and reads its counts. */

/** The file (`format` is always "knot-export"); the rest is read by the server. */
export interface DataExport {
  format: "knot-export";
  version: number;
  exported_at?: string | null;
  habits?: unknown[];
  folders?: unknown[];
  [field: string]: unknown;
}

/** Answer of POST /import: how many habits and folders were added. */
export interface ImportResult {
  habits: number;
  folders: number;
}
