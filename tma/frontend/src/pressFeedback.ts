/**
 * Подсветка нажатия, которая не срабатывает при прокрутке.
 *
 * `:active` включается, как только палец коснулся кнопки, — и ряд настроек или привычка
 * загораются, даже если палец просто начал прокручивать страницу. Поэтому нажатие
 * отмечает этот модуль: атрибутом `data-pressed` на кнопке под пальцем, и стили
 * подсвечивают `[data-pressed]` вместо `:active`. Как в iOS:
 *  - касание пальцем подсвечивается не сразу, а через PRESS_DELAY_MS, если палец за это
 *    время не сдвинулся — начало прокрутки подсветки не даёт;
 *  - палец сдвинулся дальше MOVE_TOLERANCE_PX, началась прокрутка (любого контейнера)
 *    или касание перехватил браузер (pointercancel) — подсветка снимается;
 *  - быстрое касание (отпустили раньше задержки) — это нажатие: подсветка мелькает на
 *    PRESS_FLASH_MS, чтобы отклик был виден;
 *  - мышь подсвечивает сразу: прокрутки перетаскиванием у неё нет.
 *
 * Обработчики — одни на весь документ (делегирование), поэтому работают для любой
 * кнопки без изменений в компонентах.
 */

const PRESS_DELAY_MS = 90;
const PRESS_FLASH_MS = 120;
const MOVE_TOLERANCE_PX = 10;

const PRESSABLE = "button:not(:disabled), a[href], [role='button']";

let target: HTMLElement | null = null;
let startX = 0;
let startY = 0;
let delayTimer: number | undefined;
let flashTimer: number | undefined;

function mark(element: HTMLElement): void {
  element.setAttribute("data-pressed", "");
}

function unmark(element: HTMLElement): void {
  element.removeAttribute("data-pressed");
}

/** Снять подсветку текущего нажатия и забыть его. */
function cancel(): void {
  window.clearTimeout(delayTimer);
  delayTimer = undefined;
  if (target) {
    unmark(target);
    target = null;
  }
}

function onPointerDown(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0) {
    return;
  }
  cancel();
  const element = (event.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
  if (!element) {
    return;
  }
  target = element;
  startX = event.clientX;
  startY = event.clientY;
  if (event.pointerType === "mouse") {
    mark(element);
    return;
  }
  delayTimer = window.setTimeout(() => {
    delayTimer = undefined;
    if (target) {
      mark(target);
    }
  }, PRESS_DELAY_MS);
}

function onPointerMove(event: PointerEvent): void {
  if (!target || !event.isPrimary) {
    return;
  }
  if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE_PX) {
    cancel();
  }
}

function onPointerUp(event: PointerEvent): void {
  if (!target || !event.isPrimary) {
    return;
  }
  const element = target;
  const quickTap = delayTimer !== undefined;
  window.clearTimeout(delayTimer);
  delayTimer = undefined;
  target = null;
  if (!quickTap) {
    unmark(element);
    return;
  }
  // Быстрое касание: подсветка ещё не показана — показать её коротко.
  mark(element);
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => unmark(element), PRESS_FLASH_MS);
}

let installed = false;

/** Подключить подсветку нажатий на весь документ (один раз, до первой отрисовки). */
export function installPressFeedback(): void {
  if (installed) {
    return;
  }
  installed = true;
  const passive = { passive: true } as const;
  document.addEventListener("pointerdown", onPointerDown, passive);
  document.addEventListener("pointermove", onPointerMove, passive);
  document.addEventListener("pointerup", onPointerUp, passive);
  document.addEventListener("pointercancel", cancel, passive);
  // Прокрутка любого контейнера (страницы, горизонтальных графиков): scroll не
  // всплывает, поэтому ловится на погружении.
  document.addEventListener("scroll", cancel, { capture: true, passive: true });
}
