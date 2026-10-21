/**
 * Подсветка нажатия, которая не срабатывает при прокрутке.
 *
 * `:active` включается, как только палец коснулся кнопки, — и ряд настроек или привычка
 * загораются, даже если палец просто начал прокручивать страницу. Поэтому нажатие
 * отмечает этот модуль: атрибутом `data-pressed` на кнопке под пальцем, и стили
 * подсвечивают `[data-pressed]` вместо `:active`. Как в iOS:
 *  - подсвечивается только удержание: касание (и нажатие мышью) подсвечивается через
 *    PRESS_DELAY_MS, если палец за это время не сдвинулся и не отпустил кнопку;
 *  - быстрое касание (отпустили раньше задержки) — нажатие без подсветки;
 *  - палец сдвинулся дальше MOVE_TOLERANCE_PX, началась прокрутка (любого контейнера)
 *    или касание перехватил браузер (pointercancel) — подсветка снимается.
 *
 * Кнопка, открывающая системное окно (подтверждение, «Поделиться»), не подсвечивается
 * после касания: подсветка снимается сразу, ещё до отрисовки (`clearPressFeedback`), — иначе
 * окно заморозило бы страницу, и подсветка дорисовалась бы после его закрытия. Касание,
 * которым закрывают окно «Поделиться», ничего под собой не подсвечивает (`onNextTap`).
 *
 * Обработчики — одни на весь документ (делегирование), поэтому работают для любой
 * кнопки без изменений в компонентах.
 */

// Как задержка касаний у прокрутки в iOS: обычное касание короче, удержание — дольше.
const PRESS_DELAY_MS = 150;
const MOVE_TOLERANCE_PX = 10;

const PRESSABLE = "button:not(:disabled), a[href], [role='button']";

let target: HTMLElement | null = null;
let startX = 0;
let startY = 0;
let delayTimer: number | undefined;
// Открыто окно «Поделиться»: первое касание вызывает это и ничего не подсвечивает.
let nextTap: (() => void) | null = null;
// Только что отпущенная после удержания кнопка: её подсветка ещё гаснет (clearPressFeedback).
let released: HTMLElement | null = null;

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
  if (nextTap) {
    const callback = nextTap;
    nextTap = null;
    callback();
    return;
  }
  const element = (event.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
  if (!element) {
    return;
  }
  target = element;
  startX = event.clientX;
  startY = event.clientY;
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
  window.clearTimeout(delayTimer);
  delayTimer = undefined;
  target = null;
  // Быстрое касание подсветки так и не получило; после удержания она гаснет.
  unmark(element);
  released = element;
  window.setTimeout(() => {
    released = null;
  }, 0);
}

/** Перед системным окном: снять подсветку сразу, без затухания (стиль пересчитывается
 *  с выключенным переходом — иначе затухание шло бы уже после закрытия окна). */
export function clearPressFeedback(): void {
  const elements = [target, released].filter((item): item is HTMLElement => item !== null);
  released = null;
  window.clearTimeout(delayTimer);
  delayTimer = undefined;
  target = null;
  for (const element of elements) {
    const transition = element.style.transition;
    element.style.transition = "none";
    unmark(element);
    void getComputedStyle(element).backgroundColor;
    element.style.transition = transition;
  }
}

/** Открыто окно «Поделиться»: первое касание вызывает `callback` и ничего не
 *  подсвечивает (на iPhone закрытие окна приложение узнаёт не всегда). Возвращённая
 *  функция — окно закрылось само: касания снова обычные. */
export function onNextTap(callback: () => void): () => void {
  nextTap = callback;
  return () => {
    if (nextTap === callback) {
      nextTap = null;
    }
  };
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
