/**
 * Web app session: the token of the installed app's account (spec 6.1, 6.2).
 *
 * Inside Telegram the API is authorized with initData, as before. The installed web app
 * keeps a long-lived session token in localStorage and sends `Authorization: Bearer`.
 * On the first launch without one, a guest account is created silently — habits are on
 * the server from the first second, and there is no sign-up form.
 */

const SESSION_KEY = "streak:session";

/** The stored session token, or null. */
export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Store (or, with null, forget) the session token. */
export function setSessionToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(SESSION_KEY, token);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Storage unavailable (private mode): the session lives until the page closes.
    memoryToken = token;
  }
}

// Fallback when localStorage throws.
let memoryToken: string | null = null;

/** Token for the Authorization header (storage first, then the in-memory fallback). */
export function currentSessionToken(): string | null {
  return getSessionToken() ?? memoryToken;
}
