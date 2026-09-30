/**
 * Поле ввода посреди длинной страницы (текст рассылки) — над клавиатурой, одной плавной
 * прокруткой, с первого нажатия.
 *
 * Сама система справляется с этим плохо. В Telegram на iPhone клавиатура выезжает, пока
 * вебвью ещё меняет размер: iOS прокручивает страницу к полю по старой высоте окна, а
 * потом окно уменьшается — страница дёргается, а поле оказывается под клавиатурой (и
 * встаёт на место только со второго нажатия, когда окно уже маленькое). Поэтому:
 *
 *  - на iPhone первое нажатие на поле (фокуса в нём ещё нет) ставит фокус само, с
 *    `preventScroll`, — iOS не прокручивает страницу. Курсор при этом — в конце текста;
 *    по уже открытому полю нажатия обычные (курсор — куда нажали). Если палец сдвинулся
 *    (прокручивали страницу, начав с поля), фокус не ставится — как и без этого хука;
 *  - когда клавиатура встала (окно перестало менять размер), страница один раз плавно
 *    прокручивается так, чтобы низ поля был чуть выше клавиатуры. Если поле и так видно,
 *    ничего не происходит; если оно выше видимой части окна (длинный текст), тоже — там
 *    система сама держит курсор на виду.
 *
 * Работает и на Android: там первое нажатие не перехватывается, а подстройка после
 * появления клавиатуры просто не нужна, если система уже показала поле.
 */

import { useEffect, type RefObject } from "react";

// Зазор между низом поля и клавиатурой, px.
const GAP_PX = 12;
// Окно перестало менять размер столько мс назад — клавиатура встала.
const SETTLE_MS = 80;
// Если событий изменения размера нет (клиент не меняет окно), подстроиться через столько
// мс после фокуса — клавиатура к этому времени уже выехала.
const FALLBACK_MS = 450;
// После фокуса размер окна отслеживается столько мс — дальше это уже не клавиатура.
const WATCH_MS = 1200;
// Палец сдвинулся дальше — это прокрутка, а не нажатие.
const MOVE_TOLERANCE_PX = 10;

function isIos(): boolean {
  return document.documentElement.dataset.platform === "ios";
}

/** Прокрутить страницу, чтобы низ поля стоял над клавиатурой, если он под ней. */
function revealAboveKeyboard(field: HTMLElement): void {
  if (document.activeElement !== field) {
    return;
  }
  const viewport = window.visualViewport;
  const top = viewport ? viewport.offsetTop : 0;
  const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  const rect = field.getBoundingClientRect();
  const hidden = rect.bottom + GAP_PX - bottom;
  // Поле видно целиком — не трогаем. Выше видимой части — курсор ведёт система.
  if (hidden <= 1 || rect.height + GAP_PX * 2 > bottom - top) {
    return;
  }
  window.scrollBy({ top: hidden, behavior: "smooth" });
}

export function useFieldAboveKeyboard(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const field = ref.current;
    if (!field) {
      return;
    }
    const viewport = window.visualViewport;
    let settleTimer: number | undefined;
    let fallbackTimer: number | undefined;
    let watchUntil = 0;
    let touch: { x: number; y: number } | null = null;

    const settle = (): void => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(fallbackTimer);
      settleTimer = window.setTimeout(() => revealAboveKeyboard(field), SETTLE_MS);
    };
    const onResize = (): void => {
      if (Date.now() < watchUntil) {
        settle();
      }
    };
    const onFocus = (): void => {
      watchUntil = Date.now() + WATCH_MS;
      window.clearTimeout(fallbackTimer);
      fallbackTimer = window.setTimeout(() => revealAboveKeyboard(field), FALLBACK_MS);
    };
    const onBlur = (): void => {
      watchUntil = 0;
      window.clearTimeout(settleTimer);
      window.clearTimeout(fallbackTimer);
    };
    const onTouchStart = (event: TouchEvent): void => {
      const point = event.touches[0];
      touch =
        document.activeElement !== field && point ? { x: point.clientX, y: point.clientY } : null;
    };
    const onTouchEnd = (event: TouchEvent): void => {
      const start = touch;
      touch = null;
      const point = event.changedTouches[0];
      if (!start || !point || !isIos() || document.activeElement === field) {
        return;
      }
      const moved = Math.hypot(point.clientX - start.x, point.clientY - start.y);
      if (moved > MOVE_TOLERANCE_PX || event.cancelable === false) {
        return;
      }
      // Фокус — сами и без прокрутки: так iOS не дёргает страницу (см. описание модуля).
      event.preventDefault();
      field.focus({ preventScroll: true });
      if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
        const end = field.value.length;
        field.setSelectionRange(end, end);
      }
    };

    field.addEventListener("focus", onFocus);
    field.addEventListener("blur", onBlur);
    field.addEventListener("touchstart", onTouchStart, { passive: true });
    field.addEventListener("touchend", onTouchEnd);
    viewport?.addEventListener("resize", onResize);
    window.addEventListener("resize", onResize);
    return () => {
      onBlur();
      field.removeEventListener("focus", onFocus);
      field.removeEventListener("blur", onBlur);
      field.removeEventListener("touchstart", onTouchStart);
      field.removeEventListener("touchend", onTouchEnd);
      viewport?.removeEventListener("resize", onResize);
      window.removeEventListener("resize", onResize);
    };
  }, [ref]);
}
