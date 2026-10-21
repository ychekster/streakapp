/**
 * Dimming behind system windows in the web app.
 *
 * - dimScreen: the share sheet does not dim the app on the iPhone — as in Telegram, the
 *   app goes darker as the sheet comes up and lighter as it leaves. The same dark veil in
 *   both themes (a dark app does not get lighter). Taps go through it: the sheet itself is
 *   drawn by the system above the page.
 * - dimStatusBar: the strip under the clock is not the page — it takes the page's theme
 *   color (<meta name="theme-color">). System dialogs (confirm, alert) dim the page but not
 *   it, so while one is open it takes the background color dimmed the same way.
 */

let veil: HTMLDivElement | null = null;
// How many sheets keep the app dimmed.
let holders = 0;
// The strip under the clock is dimmed now (a second window does not dim it twice).
let statusBarDimmed = false;

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

/** Parse "#rrggbb", "#rgb", "rgb(…)" or "rgba(…)" into [r, g, b, a]; null — not a color. */
function parseColor(value: string): [number, number, number, number] | null {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)).concat(1) as [
      number,
      number,
      number,
      number,
    ];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every((part) => !Number.isNaN(part))) {
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    }
  }
  return null;
}

function toHex(channel: number): string {
  return Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0");
}

/** The theme color with the dim veil (--color-sheet-dim) laid over it. */
function dimmed(color: string): string | null {
  const base = parseColor(color);
  const veilColor = parseColor(
    getComputedStyle(document.documentElement).getPropertyValue("--color-sheet-dim"),
  );
  if (!base || !veilColor) {
    return null;
  }
  const alpha = veilColor[3];
  const mixed = [0, 1, 2].map((i) => base[i] * (1 - alpha) + veilColor[i] * alpha);
  return `#${mixed.map(toHex).join("")}`;
}

/** Dim the strip under the clock; the returned function brings its color back (once) —
 *  unless the theme changed it meanwhile. */
export function dimStatusBar(): () => void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const original = meta?.content ?? "";
  const dark = meta && !statusBarDimmed ? dimmed(original) : null;
  if (!meta || !dark) {
    return () => undefined;
  }
  meta.content = dark;
  statusBarDimmed = true;
  let done = false;
  return () => {
    if (!done) {
      done = true;
      statusBarDimmed = false;
      if (meta.content === dark) {
        meta.content = original;
      }
    }
  };
}

/** Dim the app and the strip under the clock; the returned function takes the dimming
 *  away (once). */
export function dimScreen(): () => void {
  const element = ensureVeil();
  const undimStatusBar = dimStatusBar();
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
    undimStatusBar();
    holders -= 1;
    if (holders === 0) {
      element.style.opacity = "0";
    }
  };
}
