/**
 * Заголовок «Привычки» с переходом из точки А (крупный, слева сверху) в точку Б
 * (маленький, по центру, на уровне кнопок Telegram), кросс-фейдом.
 *
 * Поведение:
 *  - Заголовок А находится в обычном потоке и при скролле просто уплывает вверх
 *    вместе с контентом (нативная прокрутка — идеально плавно).
 *  - Когда верх контента под А (карточка привычек, форма) доходит до нижнего края шапки,
 *    А плавно растворяется (fade out), а заголовок Б одновременно всплывает снизу:
 *    сначала чуть размытый, затем чёткий.
 *    Вместе с ними проявляется подложка шапки (.bar): матовое стекло с жёстким нижним
 *    краем и тонкой линией-разделителем — как шапка «Чаты» в WhatsApp на iOS 26.
 *  - При обратном скролле всё проигрывается в обратном порядке. В исходном положении
 *    подложки нет вовсе.
 *
 * Подложка привязана к вьюпорту, поэтому отсюда нужны только две геометрические величины:
 * --header-bar-bottom (экранный Y нижнего края шапки) и --header-hairline-scale (сжатие линии
 * до одного физического пикселя), которые считает recompute.
 *
 * Экран, открытый на запомненной позиции прокрутки (возврат на вкладку или из вложенного
 * экрана), получает шапку сразу в нужном состоянии, без анимации: начальное состояние
 * ставится до первой отрисовки, а о прокрутке, которую App ставит после монтирования,
 * он сообщает событием SCROLL_RESTORED_EVENT.
 *
 * Экран без крупного заголовка (экран привычки) передаёт `anchorRef`: А там нет, и шапка
 * сворачивается после той же прокрутки, что и на экране с крупным заголовком, — её
 * считает невидимая проба заголовка А (см. standardTitleHeight).
 */

import { type RefObject, useLayoutEffect, useRef } from "react";

import styles from "./CollapsingHeader.module.css";

interface CollapsingHeaderProps {
  title: string;
  /** Элемент в потоке вместо крупного заголовка А (тогда А не рендерится). */
  anchorRef?: RefObject<HTMLElement>;
}

let probe: HTMLDivElement | null = null;

/**
 * Значение CSS-переменной в px; не задана — `fallback`. Значение может быть выражением
 * (в веб-приложении отступы — живые env(safe-area-inset-*)), поэтому его вычисляет сам
 * браузер — шириной скрытого элемента-пробы — и каждый раз заново, без снимка при запуске.
 */
function readPxVar(name: string, fallback = "0px"): number {
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;height:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
  }
  probe.style.width = `var(${name}, ${fallback})`;
  const value = Number.parseFloat(getComputedStyle(probe).width);
  return Number.isFinite(value) ? value : 0;
}

/** Установить CSS-переменную (в px) на корневом элементе — её читает подложка .bar. */
function setRootPx(name: string, px: number): void {
  document.documentElement.style.setProperty(name, `${px}px`);
}

/** Верх элемента в координатах документа. */
function documentTop(element: Element): number {
  return element.getBoundingClientRect().top + window.scrollY;
}

/**
 * Сколько места занимает крупный заголовок А в одну строку вместе с отступом под ним —
 * невидимой пробой внутри `container` (те же стили, без влияния на вёрстку).
 */
function standardTitleHeight(container: HTMLElement): number {
  const title = document.createElement("h1");
  title.className = styles.titleExpanded;
  title.setAttribute("aria-hidden", "true");
  title.textContent = "А";
  title.style.cssText =
    "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;white-space:nowrap";
  container.appendChild(title);
  const height = title.offsetHeight + Number.parseFloat(getComputedStyle(title).marginBottom);
  title.remove();
  return height;
}

/** App ставит сохранённую прокрутку экрана и сообщает об этом (см. App, pendingScroll). */
export const SCROLL_RESTORED_EVENT = "app:scroll-restored";

// Гистерезис порога (px), чтобы класс не «дёргался» при остановке ровно на границе.
const COLLAPSE_HYSTERESIS = 8;

export function CollapsingHeader({ title, anchorRef }: CollapsingHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const titleExpandedRef = useRef<HTMLHeadingElement>(null);

  // Layout-эффект: начальное состояние шапки ставится до первой отрисовки экрана.
  useLayoutEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl) {
      return;
    }

    let collapseThreshold = Number.POSITIVE_INFINITY;
    // Эффект перезапускается (смена языка) при уже свёрнутой шапке — берём её состояние.
    let collapsed = headerEl.classList.contains(styles.collapsed);

    // instant — без анимации: стили применяются с выключенными переходами (чтение
    // offsetWidth), после чего переходы возвращаются для обычной прокрутки.
    const updateState = (instant = false): void => {
      const y = window.scrollY;
      const next = collapsed
        ? y > collapseThreshold - COLLAPSE_HYSTERESIS
        : y >= collapseThreshold;
      if (next === collapsed) {
        return;
      }
      collapsed = next;
      if (instant) {
        headerEl.classList.add(styles.instant);
      }
      headerEl.classList.toggle(styles.collapsed, collapsed);
      if (instant) {
        void headerEl.offsetWidth;
        headerEl.classList.remove(styles.instant);
      }
    };
    const onScroll = (): void => updateState();
    const onScrollRestored = (): void => updateState(true);

    const recompute = (instant = false): void => {
      // Контент экрана (Screen: обёртка сразу за шапкой); при пересчёте — заново.
      const contentEl = headerEl.nextElementSibling;
      if (!contentEl) {
        return;
      }
      // Как в CSS: в Mini App — отступ от Telegram, в веб-приложении — env() браузера.
      const safeTop = readPxVar("--app-safe-area-top", "env(safe-area-inset-top, 0px)");
      const contentTop = readPxVar("--app-content-safe-area-top");
      const rowHeight = readPxVar("--header-collapsed-row-height");
      const overhang = readPxVar("--header-bar-overhang");
      const dpr = window.devicePixelRatio || 1;

      const contentBand = contentTop > 0 ? contentTop : rowHeight;
      // Нижний край шапки — низ зоны кнопок Telegram (в веб-приложении — чуть ниже, как у
      // шапки iOS, см. --header-bar-overhang). Округляем до физического пикселя, чтобы
      // линия-разделитель не размазывалась на два пикселя.
      const barBottom = Math.round((safeTop + contentBand + overhang) * dpr) / dpr;
      setRootPx("--header-bar-bottom", barBottom);
      document.documentElement.style.setProperty("--header-hairline-scale", String(1 / dpr));

      // Порог сворачивания: scrollY, при котором верх контента под А касается нижнего
      // края шапки. Без А (экран с якорем) — та же прокрутка, что у экрана с А в одну
      // строку: контент там начинался бы ниже на высоту А.
      const blockTop = anchorRef
        ? documentTop(headerEl) + standardTitleHeight(headerEl)
        : documentTop(contentEl);
      collapseThreshold = Math.max(1, blockTop - barBottom);
      updateState(instant);
    };
    const onResize = (): void => recompute();

    // Первый расчёт — сразу после фиксации всего дерева (refs подключены, App поставил
    // прокрутку), но до отрисовки кадра.
    let active = true;
    queueMicrotask(() => {
      if (active) {
        recompute(true);
      }
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener(SCROLL_RESTORED_EVENT, onScrollRestored);
    window.addEventListener("resize", onResize);
    window.addEventListener("app:insets", onResize);
    return () => {
      active = false;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener(SCROLL_RESTORED_EVENT, onScrollRestored);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("app:insets", onResize);
    };
  }, [title, anchorRef]);

  return (
    <div ref={headerRef}>
      {/* Подложка шапки: матовое стекло + линия-разделитель (см. CollapsingHeader.module.css). */}
      <div className={styles.bar} aria-hidden="true" />
      {anchorRef ? null : (
        <h1 ref={titleExpandedRef} className={styles.titleExpanded}>
          {title}
        </h1>
      )}
      <span className={styles.titleCollapsed} aria-hidden="true">
        {title}
      </span>
    </div>
  );
}
