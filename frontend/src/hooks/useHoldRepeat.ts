/**
 * Кнопка шага с повтором при удержании (−/+ в Stepper и в окне счёта CountSheet): шаг
 * делается уже при касании, удержание повторяет его, пока `step` не вернёт false.
 *
 * Клик браузер присылает после отпускания — туда, что к тому времени под пальцем. Если
 * от шага страница сдвинулась (в форме привычки с целью больше 1 пропадает «Автоотметка»),
 * клик открыл бы чужой ряд, например «Повтор». Поэтому клик после нажатия гасится
 * (swallowClick).
 *
 * Недоступную кнопку (в недоступном <fieldset>) касания не меняют: они приходят и к
 * недоступным кнопкам.
 */

import { useEffect, useRef, type MouseEvent, type PointerEvent, type TouchEvent } from "react";

/** Через сколько удержания шаг начинает повторяться и как часто (мс). */
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 70;
/** Сколько после отпускания ждать клика, который нужно погасить (мс). */
const CLICK_AFTER_RELEASE_MS = 400;

export interface HoldRepeatHandlers {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onTouchEnd: (event: TouchEvent) => void;
  onContextMenu: (event: MouseEvent) => void;
  onClick: (event: MouseEvent) => void;
}

/** `step(delta)` — сделать шаг; false — дальше некуда (повтор останавливается).
 *  Возвращает обработчики для кнопки шага `delta`. */
export function useHoldRepeat(step: (delta: number) => boolean): (delta: number) => HoldRepeatHandlers {
  // Повтор берёт свежую функцию шага, а не из замыкания первого касания.
  const stepRef = useRef(step);
  stepRef.current = step;
  const timer = useRef<number | null>(null);
  // Снять перехват клика (swallowClick); null — перехвата нет.
  const releaseClick = useRef<(() => void) | null>(null);

  function stop(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  /** Погасить клик, который придёт после отпускания этого нажатия: до самого отпускания
   *  и ещё CLICK_AFTER_RELEASE_MS после него (см. release). */
  function swallowClick(): void {
    releaseClick.current?.();
    const swallow = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      remove();
    };
    let timeout: number | null = null;
    const released = (): void => {
      // Отпустили: клик придёт сразу следом, если придёт вообще.
      if (timeout === null) {
        timeout = window.setTimeout(remove, CLICK_AFTER_RELEASE_MS);
      }
    };
    const remove = (): void => {
      window.removeEventListener("click", swallow, true);
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
      // Следующее нажатие могло уже поставить свой перехват — его не трогать.
      if (releaseClick.current === released) {
        releaseClick.current = null;
      }
    };
    window.addEventListener("click", swallow, true);
    releaseClick.current = released;
  }

  function release(): void {
    stop();
    releaseClick.current?.();
  }

  useEffect(
    () => () => {
      stop();
      releaseClick.current?.();
    },
    [],
  );

  function start(delta: number): void {
    stop();
    if (!stepRef.current(delta)) {
      return;
    }
    const repeat = (): void => {
      timer.current = stepRef.current(delta) ? window.setTimeout(repeat, REPEAT_INTERVAL_MS) : null;
    };
    timer.current = window.setTimeout(repeat, REPEAT_DELAY_MS);
  }

  return (delta) => ({
    onPointerDown: (event) => {
      // Касание приходит и к недоступной кнопке (степпер в недоступном <fieldset> — цель
      // совместной привычки у участника): ничего не менять.
      if (event.currentTarget.matches(":disabled")) {
        return;
      }
      event.preventDefault();
      swallowClick();
      start(delta);
    },
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
    // Касание: без нажатия мышью и клика после него (iOS открывает <select> по ним).
    onTouchEnd: (event) => event.preventDefault(),
    onContextMenu: (event) => event.preventDefault(),
    // Клавиатура и скринридеры нажимают без pointer-событий.
    onClick: (event) => {
      if (event.detail === 0) {
        stepRef.current(delta);
      }
    },
  });
}
