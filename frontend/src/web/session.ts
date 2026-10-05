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

/** A short fingerprint of the current session: data kept on the device is tagged with
 *  it, so the token itself is stored in one place only. Not a secret — just an id. */
export function currentSessionId(): string | null {
  const token = currentSessionToken();
  if (!token) {
    return null;
  }
  // cyrb53: a fast 53-bit string hash.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < token.length; index += 1) {
    const code = token.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
