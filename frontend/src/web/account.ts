/**
 * The web app's account as last loaded (GET /auth/account), kept on the device: Settings
 * shows the «Аккаунт» row — and the guest «!» — at once, also without a connection.
 * Kept per session: after a login or logout the old one is not shown.
 */

import type { Account } from "../api/web";
import { currentSessionToken } from "./session";

const ACCOUNT_KEY = "streak:account";

/** The account kept for the current session, or null. */
export function keptAccount(): Account | null {
  try {
    const kept = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? "null") as {
      session?: string;
      account?: Account;
    } | null;
    return kept?.account && kept.session === currentSessionToken() ? kept.account : null;
  } catch {
    return null;
  }
}

export function keepAccount(account: Account): void {
  try {
    localStorage.setItem(
      ACCOUNT_KEY,
      JSON.stringify({ session: currentSessionToken(), account }),
    );
  } catch {
    // Without storage the row waits for the server, as before.
  }
}
