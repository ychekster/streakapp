/**
 * Safe-area insets of the web app as the same CSS variables the Mini App gets from
 * Telegram (--app-safe-area-top / -bottom, see telegram/webapp.ts), so every screen lays
 * out by one set of numbers on both platforms. The browser gives them only as env(); a
 * hidden probe turns them into pixels, because CollapsingHeader reads the variables in JS.
 */
export function trackWebSafeAreaInsets(): void {
  const root = document.documentElement;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);

  const apply = (): void => {
    const style = getComputedStyle(probe);
    root.style.setProperty("--app-safe-area-top", style.paddingTop);
    root.style.setProperty("--app-safe-area-bottom", style.paddingBottom);
    window.dispatchEvent(new Event("app:insets"));
  };
  apply();
  // Rotation changes the insets.
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
}
