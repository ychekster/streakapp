/**
 * Dimming of the whole app behind a system sheet the page has no say over — the share
 * sheet: on the iPhone it does not dim the app, so, as in Telegram, the app goes darker as
 * the sheet comes up and lighter as it leaves. The same dark veil in both themes (a dark
 * app does not get lighter). Taps go through it: the sheet itself is drawn by the system
 * above the page. The strip under the clock is not the page and stays as it is (an
 * installed iPhone app does not take theme-color changes while it runs).
 */

let veil: HTMLDivElement | null = null;
// How many sheets keep the app dimmed.
let holders = 0;

function ensureVeil(): HTMLDivElement {
  if (!veil) {
    veil = document.createElement("div");
    veil.setAttribute("aria-hidden", "true");
    Object.assign(veil.style, {
      position: "fixed",
      inset: "0",
      zIndex: "1000",
      pointerEvents: "none",
      backgroundColor: "var(--color-sheet-dim)",
      opacity: "0",
      transition: "opacity var(--sheet-dim-anim)",
    });
    document.body.append(veil);
  }
  return veil;
}

/** Dim the app; the returned function takes the dimming away (once). */
export function dimScreen(): () => void {
  const element = ensureVeil();
  holders += 1;
  // Start from the current opacity so it fades in, not jumps.
  void element.offsetWidth;
  element.style.opacity = "1";
  let done = false;
  return () => {
    if (done) {
      return;
    }
    done = true;
    holders -= 1;
    if (holders === 0) {
      element.style.opacity = "0";
    }
  };
}
