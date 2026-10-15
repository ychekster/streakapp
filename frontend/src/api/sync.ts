/** Sending the device's changes (POST /sync), see data/store.ts. */

import type { SyncOperation, SyncResponse } from "../types/sync";
import { ApiRequestError, apiRequest } from "./client";

/** Apply `ops` on the server and get the state after them (no ops — just the state).
 *  `keepalive` — the request outlives the page (the app is being closed). A 2xx answer
 *  that is not the server's (a Wi-Fi login page, a cut-off body) is a network error, so
 *  the changes stay queued and are sent again. */
export async function syncChanges(
  ops: SyncOperation[],
  keepalive = false,
): Promise<SyncResponse> {
  const response = await apiRequest<SyncResponse | null>("/sync", {
    method: "POST",
    body: JSON.stringify({ ops }),
    keepalive,
  });
  if (!Array.isArray(response?.results)) {
    throw new ApiRequestError(0, "network_error", "Нет связи с сервером");
  }
  return response;
}
