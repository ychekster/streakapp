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
 *    PRESS_FLASH_MS, чтобы отклик был виден (кроме кнопок с `data-no-tap-flash`). Мелькает
 *    только по click — когда нажатие дошло до кнопки: касание, которым закрывают
 *    системное окно «Поделиться», доходит до страницы без click и не подсвечивается;
 *  - мышь подсвечивает сразу: прокрутки перетаскиванием у неё нет.
 *
 * Системный диалог (подтверждение, ошибка) открывается после того, как подсветка нажатой
 * кнопки успела нарисоваться, и она снимается прямо перед ним (`settlePressFeedback`):
 * диалог замораживает страницу, и без этого подсветка дорисовалась бы уже после его
 * закрытия. Пока открыто окно «Поделиться», касания не подсвечиваются вовсе
 * (`pausePressFeedback`) — касание, которым его закрывают, не зажигает ряд под ним.
 *
 * Обработчики — одни на весь документ (делегирование), поэтому работают для любой
 * кнопки без изменений в компонентах.
 */

const PRESS_DELAY_MS = 90;
const PRESS_FLASH_MS = 120;
const MOVE_TOLERANCE_PX = 10;
// После закрытия системного окна касания ещё столько не подсвечиваются: касание, которым
// его закрыли, может дойти до страницы чуть позже.
const RESUME_DELAY_MS = 400;
// Подсветка перед диалогом рисуется не дольше этого (если кадры не идут).
const SETTLE_MAX_MS = 100;

const PRESSABLE = "button:not(:disabled), a[href], [role='button']";

let target: HTMLElement | null = null;
let startX = 0;
let startY = 0;
let delayTimer: number | undefined;
let flashTimer: number | undefined;
// Кнопка, подсветка которой сейчас мелькает после быстрого касания.
let flashed: HTMLElement | null = null;
// Быстро коснулись — мелькнёт, если следом придёт click по ней.
let tapped: HTMLElement | null = null;
// Сколько системных окон сейчас открыто (pausePressFeedback).
let paused = 0;

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
  tapped = null;
  const element = (event.target as Element | null)?.closest<HTMLElement>(PRESSABLE);
  if (!element || paused > 0) {
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
  // `data-no-tap-flash`: быстрое касание не подсвечивается — нажатие видно и так
  // (например, ставится галочка выбора); подсветка остаётся только при удержании.
  if (!quickTap || element.hasAttribute("data-no-tap-flash")) {
    unmark(element);
    return;
  }
  // Быстрое касание: подсветка ещё не показана — она мелькнёт, если нажатие дойдёт до
  // кнопки (onClick).
  tapped = element;
}

function onClick(event: MouseEvent): void {
  const element = tapped;
  tapped = null;
  if (!element || (event.target as Element | null)?.closest(PRESSABLE) !== element) {
    return;
  }
  // Мелькание предыдущей кнопки (быстрые нажатия подряд) обрывается сразу — иначе её
  // таймер пропадал бы, и подсветка на ней оставалась навсегда.
  window.clearTimeout(flashTimer);
  if (flashed && flashed !== element) {
    unmark(flashed);
  }
  flashed = element;
  mark(element);
  flashTimer = window.setTimeout(() => {
    unmark(element);
    flashed = null;
  }, PRESS_FLASH_MS);
}

/** Снять подсветку сразу. */
function clearPressFeedback(): void {
  cancel();
  tapped = null;
  window.clearTimeout(flashTimer);
  if (flashed) {
    unmark(flashed);
    flashed = null;
  }
}

/** Не подсвечивать касания, пока открыто системное окно; вызвать возвращённую функцию,
 *  когда окно закрылось. */
export function pausePressFeedback(): () => void {
  paused += 1;
  let resumed = false;
  return () => {
    if (resumed) {
      return;
    }
    resumed = true;
    window.setTimeout(() => {
      paused -= 1;
    }, RESUME_DELAY_MS);
  };
}

/** Перед системным диалогом: дать подсветке нажатой кнопки нарисоваться (два кадра) и
 *  снять её — диалог откроется поверх подсвеченной кнопки, а после него подсветки нет. */
export function settlePressFeedback(): Promise<void> {
  if (!flashed && !target) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (!done) {
        done = true;
        clearPressFeedback();
        resolve();
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    window.setTimeout(finish, SETTLE_MAX_MS);
  });
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
  // На погружении — раньше обработчика кнопки: подсветка уже стоит, когда он откроет
  // диалог (settlePressFeedback).
  document.addEventListener("click", onClick, { capture: true, passive: true });
  // Прокрутка любого контейнера (страницы, горизонтальных графиков): scroll не
  // всплывает, поэтому ловится на погружении.
  document.addEventListener("scroll", cancel, { capture: true, passive: true });
}
