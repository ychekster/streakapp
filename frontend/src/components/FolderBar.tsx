/**
 * Папки над списком привычек — вкладки в одной плоской таблетке, как папки чатов в
 * Telegram на iOS 26. Цвет таблетки, подложка выбранной вкладки и её переезд — как у
 * нижней навигации (TabBar), а заметность — как у карточки привычек (её тень); вкладки —
 * по ширине своих названий, слева направо, а если не заполняют таблетку — свободное место
 * делится между ними поровну. Не помещаются — лента прокручивается вбок в
 * пределах подложки (уходящая вкладка обрезается её краем), а выбранная вкладка доезжает
 * до видимой части.
 *
 * Поля таблетки вокруг подложки округлены до пикселей экрана (FolderBar.module.css), а
 * подложка ставится по точному, дробному положению вкладки (getBoundingClientRect, а не
 * округлённые offsetLeft/offsetWidth) — так зазор у крайней вкладки сверху, снизу и сбоку
 * одинаковый на любом экране.
 *
 * Удержание вкладки (`onHold`, HOLD_MS) — меню вкладки под ней (TabMenu, его пункты задаёт
 * экран); отпущенное после удержания нажатие вкладку не выбирает.
 *
 * Режим порядка (`reorder`, пункт меню «Изменить порядок»): всё, кроме таблетки, бледнеет
 * (слой поверх экрана), таблетка остаётся на своём месте над ним, у каждой вкладки ручка
 * (как у рядов в настройках «Папки»). За ручку вкладку тянут вбок, соседние плавно
 * уступают место; отпустили — новый порядок (`onOrder`). Палец по самой вкладке листает
 * ленту. Нажатие мимо таблетки заканчивает режим (`onDone`), как и «Готово» / «Назад»
 * (App). Удаляют папку пунктом меню вкладки.
 *
 * Показывается, только когда у пользователя есть папки (Настройки → «Папки»); одна из
 * вкладок — «Все привычки».
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { useStrings } from "../preferences";
import { hapticImpact, hapticSelection } from "../telegram/webapp";
import styles from "./FolderBar.module.css";

export interface FolderTab {
  key: string;
  label: string;
}

/** Режим порядка вкладок. */
export interface FolderBarReorder {
  /** Новый порядок ключей вкладок. */
  onOrder: (keys: string[]) => void;
  /** Нажали мимо таблетки: режим закончен. */
  onDone: () => void;
}

interface FolderBarProps {
  tabs: readonly FolderTab[];
  active: string;
  onSelect: (key: string) => void;
  /** Удержание вкладки: где она на экране — под ней встанет меню. */
  onHold?: (key: string, anchor: DOMRect) => void;
  /** Режим порядка; null — обычная таблетка. */
  reorder?: FolderBarReorder | null;
  /** Меню вкладки (TabMenu), пока открыто. */
  menu?: ReactNode;
}

/** Положение подложки на ленте вкладок, px. */
interface Thumb {
  x: number;
  width: number;
}

/** Удержание вкладки дольше (мс) — меню. */
const HOLD_MS = 450;
/** Палец сдвинулся дальше (px) — это не удержание. */
const MOVE_SLOP_PX = 8;
/** Перетаскиваемая вкладка у края ленты ближе (px) — лента едет за ней. */
const AUTOSCROLL_EDGE_PX = 36;
const AUTOSCROLL_STEP_PX = 6;

/** Перетаскивание вкладки за ручку в режиме порядка. */
interface Drag {
  key: string;
  pointer: number;
  startX: number;
  startScroll: number;
  /** Где вкладки стояли на ленте в начале (по порядку `tabs`) и их ширины. */
  lefts: number[];
  widths: number[];
  moved: boolean;
}

export function FolderBar({ tabs, active, onSelect, onHold, reorder = null, menu }: FolderBarProps) {
  const strings = useStrings();
  const barRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);
  // Первое положение подложки ставится без анимации — иначе она въехала бы с края.
  const [animated, setAnimated] = useState(false);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === active));
  const reordering = reorder !== null;

  // Подложка — под выбранной вкладкой: измеряется до отрисовки и заново при изменении
  // размеров (поворот экрана, другие названия).
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const tabElements = [...track.querySelectorAll<HTMLElement>("[role=tab]")];
    const measure = (): void => {
      const tab = tabElements[activeIndex];
      if (tab) {
        const box = tab.getBoundingClientRect();
        const x = box.left - track.getBoundingClientRect().left + track.scrollLeft;
        setThumb({ x, width: box.width });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    tabElements.forEach((tab) => observer.observe(tab));
    return () => observer.disconnect();
  }, [activeIndex, tabs, reordering]);

  useLayoutEffect(() => {
    if (thumb && !animated) {
      const frame = requestAnimationFrame(() => setAnimated(true));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [thumb, animated]);

  // Выбранная вкладка за краем ленты — лента доезжает до неё.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const tab = track?.querySelectorAll<HTMLElement>("[role=tab]")[activeIndex];
    if (!track || !tab) {
      return;
    }
    const left = tab.offsetLeft - track.scrollLeft;
    const right = left + tab.offsetWidth;
    if (left < 0 || right > track.clientWidth) {
      track.scrollTo({
        left: tab.offsetLeft - (track.clientWidth - tab.offsetWidth) / 2,
        behavior: animated ? "smooth" : "auto",
      });
    }
    // Только при смене вкладки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // --- Удержание вкладки: меню ---

  const hold = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const cancelHold = (): void => {
    if (hold.current) {
      window.clearTimeout(hold.current.timer);
    }
  };
  useEffect(() => cancelHold, []);

  const holdStart = (key: string, event: PointerEvent<HTMLButtonElement>): void => {
    if (!onHold || reordering) {
      return;
    }
    cancelHold();
    const target = event.currentTarget;
    hold.current = {
      x: event.clientX,
      y: event.clientY,
      fired: false,
      timer: window.setTimeout(() => {
        if (hold.current) {
          hold.current.fired = true;
        }
        hapticImpact("medium");
        onHold(key, target.getBoundingClientRect());
      }, HOLD_MS),
    };
  };
  const holdMove = (event: PointerEvent): void => {
    const state = hold.current;
    if (state && Math.hypot(event.clientX - state.x, event.clientY - state.y) > MOVE_SLOP_PX) {
      cancelHold();
    }
  };

  // --- Режим порядка: место таблетки и перетаскивание ---

  // Таблетка в режиме порядка — над слоем, на том же месте экрана; в ленте страницы её
  // место держит пустой блок той же высоты.
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!reordering) {
      setFrame(null);
      return undefined;
    }
    const place = (): void => {
      const box = (placeholderRef.current ?? barRef.current)?.getBoundingClientRect();
      if (box) {
        setFrame(box);
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [reordering]);

  // Пока тянут: сдвиг каждой вкладки от её места (перетаскиваемая — за пальцем, соседи —
  // на свои новые места, плавно) и порядок, который встанет, если отпустить.
  const [shifts, setShifts] = useState<Record<string, number> | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  // Порядок только что сохранён: сдвиги сброшены вместе с новым порядком — без перехода.
  const [settling, setSettling] = useState(false);
  const pendingOrder = useRef<string[] | null>(null);
  const drag = useRef<Drag | null>(null);
  const autoscroll = useRef<number | null>(null);

  const stopAutoscroll = (): void => {
    if (autoscroll.current !== null) {
      cancelAnimationFrame(autoscroll.current);
      autoscroll.current = null;
    }
  };
  useEffect(() => {
    if (!reordering) {
      stopAutoscroll();
      drag.current = null;
      pendingOrder.current = null;
      setShifts(null);
      setDragKey(null);
    }
  }, [reordering]);
  useEffect(() => stopAutoscroll, []);
  useEffect(() => {
    if (!settling) {
      return undefined;
    }
    const frameId = requestAnimationFrame(() => setSettling(false));
    return () => cancelAnimationFrame(frameId);
  }, [settling]);

  /** Ручка вкладки взята: где стоят вкладки сейчас. */
  const dragStart = (key: string, event: PointerEvent<HTMLElement>): void => {
    const track = trackRef.current;
    if (!reordering || !track) {
      return;
    }
    event.stopPropagation();
    const elements = [...track.querySelectorAll<HTMLElement>("[role=tab]")];
    const trackLeft = track.getBoundingClientRect().left - track.scrollLeft;
    drag.current = {
      key,
      pointer: event.pointerId,
      startX: event.clientX,
      startScroll: track.scrollLeft,
      lefts: elements.map((element) => element.getBoundingClientRect().left - trackLeft),
      widths: elements.map((element) => element.getBoundingClientRect().width),
      moved: false,
    };
    pendingOrder.current = tabs.map((tab) => tab.key);
    event.currentTarget.setPointerCapture(event.pointerId);
    hapticImpact("light");
    setDragKey(key);
  };

  /** Где перетаскиваемая вкладка сейчас: новый порядок и сдвиги всех вкладок. */
  const dragUpdate = (clientX: number): void => {
    const state = drag.current;
    const track = trackRef.current;
    if (!state || !track) {
      return;
    }
    const base = tabs.map((tab) => tab.key);
    const from = base.indexOf(state.key);
    const offset = clientX - state.startX + (track.scrollLeft - state.startScroll);
    const center = state.lefts[from] + state.widths[from] / 2 + offset;
    const others = base.filter((key) => key !== state.key);
    const before = others.filter((key) => {
      const index = base.indexOf(key);
      return state.lefts[index] + state.widths[index] / 2 < center;
    }).length;
    const next = [...others];
    next.splice(before, 0, state.key);
    const nextShifts: Record<string, number> = {};
    let left = state.lefts[0];
    for (const key of next) {
      const index = base.indexOf(key);
      nextShifts[key] = key === state.key ? offset : left - state.lefts[index];
      left += state.widths[index];
    }
    if (pendingOrder.current?.join() !== next.join()) {
      hapticSelection();
    }
    pendingOrder.current = next;
    setShifts(nextShifts);
  };

  const dragMove = (event: PointerEvent): void => {
    const state = drag.current;
    const track = trackRef.current;
    if (!state || event.pointerId !== state.pointer || !track) {
      return;
    }
    state.moved = true;
    dragUpdate(event.clientX);
    // У края ленты лента едет, вкладка остаётся под пальцем.
    const box = track.getBoundingClientRect();
    const edge =
      event.clientX < box.left + AUTOSCROLL_EDGE_PX
        ? -1
        : event.clientX > box.right - AUTOSCROLL_EDGE_PX
          ? 1
          : 0;
    stopAutoscroll();
    if (edge !== 0) {
      const clientX = event.clientX;
      const step = (): void => {
        track.scrollLeft += edge * AUTOSCROLL_STEP_PX;
        dragUpdate(clientX);
        autoscroll.current = requestAnimationFrame(step);
      };
      autoscroll.current = requestAnimationFrame(step);
    }
  };

  const dragEnd = (event: PointerEvent): void => {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointer) {
      return;
    }
    stopAutoscroll();
    drag.current = null;
    const order = pendingOrder.current;
    pendingOrder.current = null;
    setDragKey(null);
    if (state.moved && order && order.join() !== tabs.map((tab) => tab.key).join()) {
      // Новый порядок встаёт вместе со сброшенными сдвигами: вкладки уже там.
      setSettling(true);
      setShifts(null);
      reorder?.onOrder(order);
    } else {
      // Не сдвинули: вкладка плавно возвращается на место.
      setShifts(null);
    }
  };

  const thumbStyle = thumb
    ? ({ left: `${thumb.x}px`, width: `${thumb.width}px` } as CSSProperties)
    : undefined;

  const bar = (
    <div
      ref={barRef}
      className={`${styles.bar} ${reordering ? styles.reordering : ""}`}
      style={
        reordering && frame
          ? { position: "fixed", top: frame.top, left: frame.left, width: frame.width, margin: 0 }
          : undefined
      }
    >
      <div ref={trackRef} className={styles.track} role="tablist">
        {thumb && !reordering ? (
          <span
            className={`${styles.thumb} ${animated ? styles.animated : ""}`}
            style={thumbStyle}
            aria-hidden="true"
          />
        ) : null}
        {tabs.map((tab) => {
          const selected = tab.key === active;
          const dragging = dragKey === tab.key;
          const shift = shifts?.[tab.key] ?? 0;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              className={[
                styles.tab,
                reordering && !dragging && !settling ? styles.shifting : "",
                dragging ? styles.dragging : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={shift !== 0 ? { transform: `translateX(${shift}px)` } : undefined}
              onPointerDown={(event) => holdStart(tab.key, event)}
              onPointerMove={holdMove}
              onPointerUp={cancelHold}
              onPointerCancel={cancelHold}
              onContextMenu={(event) => event.preventDefault()}
              onClick={() => {
                if (hold.current?.fired) {
                  hold.current = null;
                  return;
                }
                if (!reordering) {
                  onSelect(tab.key);
                }
              }}
            >
              {tab.label}
              {reordering ? (
                // Ручка: за неё вкладку тянут; по самой вкладке палец листает ленту.
                <span
                  className={styles.handle}
                  aria-label={`${strings.tabMenuReorder}: ${tab.label}`}
                  onPointerDown={(event) => dragStart(tab.key, event)}
                  onPointerMove={dragMove}
                  onPointerUp={dragEnd}
                  onPointerCancel={dragEnd}
                  onClick={(event) => event.stopPropagation()}
                >
                  <svg viewBox="0 0 22 16" aria-hidden="true">
                    <path
                      d="M2 2.5h18M2 8h18M2 13.5h18"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (!reordering) {
    return (
      <>
        {bar}
        {menu}
      </>
    );
  }
  return (
    <>
      <div
        ref={placeholderRef}
        className={styles.placeholder}
        style={frame ? { height: frame.height } : undefined}
        aria-hidden="true"
      />
      {createPortal(
        <>
          <div
            className={styles.dim}
            onPointerDown={(event) => {
              event.preventDefault();
              reorder.onDone();
            }}
          />
          {bar}
        </>,
        document.body,
      )}
      {menu}
    </>
  );
}
