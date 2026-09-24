/**
 * Заголовок «Привычки» с переходом из точки А (крупный, слева сверху) в точку Б
 * (маленький, по центру, на уровне кнопок Telegram), кросс-фейдом.
 *
 * Поведение:
 *  - Заголовок А находится в обычном потоке и при скролле просто уплывает вверх
 *    вместе с контентом (нативная прокрутка — идеально плавно).
 *  - Когда центр А достигает уровня кнопки Close, А плавно растворяется (fade out),
 *    а заголовок Б одновременно всплывает снизу: сначала чуть размытый, затем чёткий.
 *    Вместе с ними проявляется подложка шапки (.bar): матовое стекло с жёстким нижним
 *    краем и тонкой линией-разделителем — как шапка «Чаты» в WhatsApp на iOS 26.
 *  - При обратном скролле всё проигрывается в обратном порядке. В исходном положении
 *    подложки нет вовсе.
 *
 * Подложка привязана к вьюпорту, поэтому отсюда нужны только две геометрические величины:
 * --header-bar-bottom (экранный Y нижнего края шапки) и --header-hairline-scale (сжатие линии
 * до одного физического пикселя), которые считает recompute.
 *
 * Экран без крупного заголовка (экран привычки) передаёт `anchorRef` — элемент в потоке,
 * который играет роль А: порог считается по нему, а сам он не растворяется, а уходит под
 * подложку вместе с контентом.
 */

import { type RefObject, useEffect, useRef } from "react";

import styles from "./CollapsingHeader.module.css";

interface CollapsingHeaderProps {
  title: string;
  /** Элемент в потоке вместо крупного заголовка А (тогда А не рендерится). */
  anchorRef?: RefObject<HTMLElement>;
}

/** Прочитать числовое значение CSS-переменной (в px); 0, если не задана. */
function readPxVar(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

/** Установить CSS-переменную (в px) на корневом элементе — её читает подложка .bar. */
function setRootPx(name: string, px: number): void {
  document.documentElement.style.setProperty(name, `${px}px`);
}

// Гистерезис порога (px), чтобы класс не «дёргался» при остановке ровно на границе.
const COLLAPSE_HYSTERESIS = 8;

export function CollapsingHeader({ title, anchorRef }: CollapsingHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const titleExpandedRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const headerEl = headerRef.current;
    const titleEl = anchorRef ? anchorRef.current : titleExpandedRef.current;
    if (!headerEl || !titleEl) {
      return;
    }

    let collapseThreshold = Number.POSITIVE_INFINITY;
    let collapsed = false;

    const updateState = (): void => {
      const y = window.scrollY;
      const next = collapsed
        ? y > collapseThreshold - COLLAPSE_HYSTERESIS
        : y >= collapseThreshold;
      if (next !== collapsed) {
        collapsed = next;
        headerEl.classList.toggle(styles.collapsed, collapsed);
      }
    };

    const recompute = (): void => {
      const safeTop = readPxVar("--app-safe-area-top");
      const contentTop = readPxVar("--app-content-safe-area-top");
      const rowHeight = readPxVar("--header-collapsed-row-height");
      const dpr = window.devicePixelRatio || 1;

      const contentBand = contentTop > 0 ? contentTop : rowHeight;
      // Центр свёрнутого заголовка Б — для порога сворачивания (кросс-фейд А↔Б срабатывает
      // ровно в позиции Б, поэтому здесь именно центр строки).
      const collapsedCenterY = safeTop + contentBand / 2;
      // Нижний край шапки — низ зоны кнопок Telegram. Округляем до физического пикселя, чтобы
      // линия-разделитель не размазывалась на два пикселя.
      setRootPx("--header-bar-bottom", Math.round((safeTop + contentBand) * dpr) / dpr);
      document.documentElement.style.setProperty("--header-hairline-scale", String(1 / dpr));

      // Порог сворачивания: scrollY, при котором центр заголовка А (в потоке) достигает
      // уровня кнопки Close (центра свёрнутого положения Б).
      const rect = titleEl.getBoundingClientRect();
      const expandedCenterY = rect.top + window.scrollY + rect.height / 2; // в координатах документа
      collapseThreshold = Math.max(1, expandedCenterY - collapsedCenterY);
      updateState();
    };

    recompute();
    window.addEventListener("scroll", updateState, { passive: true });
    window.addEventListener("resize", recompute);
    window.addEventListener("app:insets", recompute);
    return () => {
      window.removeEventListener("scroll", updateState);
      window.removeEventListener("resize", recompute);
      window.removeEventListener("app:insets", recompute);
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
