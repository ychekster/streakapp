/** Sending the device's changes (POST /sync), see data/store.ts. */

import type { SyncOperation, SyncResponse } from "../types/sync";
import { apiRequest } from "./client";

/** Apply `ops` on the server and get the state after them (no ops — just the state).
 *  `keepalive` — the request outlives the page (the app is being closed). */
export function syncChanges(ops: SyncOperation[], keepalive = false): Promise<SyncResponse> {
  return apiRequest<SyncResponse>("/sync", {
    method: "POST",
    body: JSON.stringify({ ops }),
    keepalive,
  });
}
