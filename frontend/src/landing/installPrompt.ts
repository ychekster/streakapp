/**
 * Android's native install prompt (spec 3.4). Chrome fires `beforeinstallprompt` once,
 * possibly before React mounts — so it is captured at module load (main.tsx imports this
 * for the landing) and handed to whoever subscribes.
 */

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Start listening (idempotent). */
export function captureInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep Chrome's mini-infobar away: the page shows its own big button.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export const installPrompt = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  available(): boolean {
    return deferred !== null;
  },
  installed(): boolean {
    return installed;
  },
  /** Show the native prompt; resolves with the user's choice. */
  async show(): Promise<"accepted" | "dismissed" | "unavailable"> {
    const event = deferred;
    if (!event) {
      return "unavailable";
    }
    deferred = null;
    await event.prompt();
    const choice = await event.userChoice;
    notify();
    return choice.outcome;
  },
};
