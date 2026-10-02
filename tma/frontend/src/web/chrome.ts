/**
 * The app's own back and bottom buttons in the web app (spec §5).
 *
 * Inside Telegram, the «Назад» button and the bottom MainButton are Telegram's own. The
 * installed web app has neither, so telegram/webapp.ts routes the same calls here, and
 * <WebChrome> draws the buttons. Screens keep using useBackButton / useMainButton — one
 * code path for both platforms.
 */

import type { MainButtonState } from "../telegram/webapp";

export interface ChromeSnapshot {
  backVisible: boolean;
  main: MainButtonState | null;
}

type Handler = () => void;

let snapshot: ChromeSnapshot = { backVisible: false, main: null };
const listeners = new Set<Handler>();
const backHandlers = new Set<Handler>();
const mainHandlers = new Set<Handler>();

function update(patch: Partial<ChromeSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export const webChrome = {
  subscribe(listener: Handler): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ChromeSnapshot {
    return snapshot;
  },
  setBackVisible(visible: boolean): void {
    if (snapshot.backVisible !== visible) {
      update({ backVisible: visible });
    }
  },
  onBack(handler: Handler): () => void {
    backHandlers.add(handler);
    return () => backHandlers.delete(handler);
  },
  pressBack(): void {
    backHandlers.forEach((handler) => handler());
  },
  showMain(state: MainButtonState): void {
    update({ main: state });
  },
  hideMain(): void {
    update({ main: null });
  },
  onMain(handler: Handler): () => void {
    mainHandlers.add(handler);
    return () => mainHandlers.delete(handler);
  },
  pressMain(): void {
    mainHandlers.forEach((handler) => handler());
  },
};
