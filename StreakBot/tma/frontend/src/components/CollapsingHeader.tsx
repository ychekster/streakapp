/**
 * Заголовок «Привычки» с переходом из точки А (крупный, слева сверху) в точку Б
 * (маленький, по центру, на уровне кнопок Telegram), кросс-фейдом.
 *
 * Поведение:
 *  - Заголовок А находится в обычном потоке и при скролле просто уплывает вверх
 *    вместе с контентом (нативная прокрутка — идеально плавно).
 *  - Когда центр А достигает уровня кнопки Close, А плавно растворяется (fade out),
 *    а заголовок Б одновременно всплывает снизу: сначала чуть размытый, затем чёткий.
 *  - При обратном скролле всё проигрывается в обратном порядке.
 *
 * Эффект под шапкой — прогрессивный блюр (слои .effect, см. CollapsingHeader.module.css):
 * максимум на уровне точки Б и выше, ниже — узкая полоса плавного спада к нулю. Слои статичны
 * и привязаны к вьюпорту, поэтому отсюда нужна только одна геометрическая величина —
 * --content-fade-pointb (экранный Y точки Б), которую считает recompute.
 */

import { useEffect, useRef } from "react";

import styles from "./CollapsingHeader.module.css";

interface CollapsingHeaderProps {
  title: string;
}

/*
 * Прогрессивный блюр под шапкой (как нативная шапка Telegram/iOS): стопка ВЛОЖЕННЫХ слоёв
 * backdrop-filter с растущим радиусом. Чем меньше радиус — тем НИЖЕ слой держится непрозрачным,
 * поэтому крупный радиус сверху смешивается с уже размытым снизу, а не с резким контентом —
 * переход всегда «размытие→размытие», без видимой линии. Маски КАСАТЕЛЬНЫЕ (1−smootherstep:
 * нулевая производная на концах) → нет ребра ни у максимума, ни у нуля. Параметры подобраны и
 * сверены скриншотами с эталоном (нативный прогрессивный блюр) до полного совпадения.
 *
 * Маски заданы в долях полосы --content-blur-band, отсчитываемых от точки Б
 * (--content-fade-pointb, экранный Y нижнего края шапки, считает JS). Поэтому слои статичны и
 * привязаны к вьюпорту, а пересчитывается только одна геометрическая величина — точка Б.
 */
const BLUR_LAYERS = 6; // число слоёв (баланс плавности и перфоманса)
const BLUR_MAX = 2.5; // максимальный радиус блюра, px (на уровне точки Б)
const HOLD_SPAN = 0.75; // на какую долю полосы растянута «лестница» удержания слоёв (вложенность)
const FADE_SPAN = 0.45; // длина касательного спада каждого слоя (в долях полосы)
const FADE_STEPS = 8; // число стопов в касательном спаде маски

/** 1 − smootherstep: касательная кривая (нулевая производная на обоих концах). */
function fadeShape(t: number): number {
  return 1 - t * t * t * (t * (t * 6 - 15) + 10);
}

/** Позиция стопа маски как доля полосы ниже точки Б. */
function maskPos(frac: number): string {
  return `calc(var(--content-fade-pointb) + var(--content-blur-band) * ${frac.toFixed(4)})`;
}

/** Стопы от непрозрачного (#000) на startFrac до прозрачного на endFrac, по касательной кривой. */
function maskStops(startFrac: number, endFrac: number): string {
  const stops: string[] = [];
  for (let i = 0; i <= FADE_STEPS; i += 1) {
    const t = i / FADE_STEPS;
    const frac = startFrac + (endFrac - startFrac) * t;
    const color =
      i === 0
        ? "#000"
        : i === FADE_STEPS
          ? "transparent"
          : `rgba(0, 0, 0, ${fadeShape(t).toFixed(3)})`;
    stops.push(`${color} ${maskPos(frac)}`);
  }
  return stops.join(", ");
}

interface BlurLayerDef {
  blur: string;
  mask: string;
}

// Слои от слабого (k=0, держится ниже всех — подложка) к сильному (k=N−1, у точки Б).
const BLUR_LAYER_DEFS: BlurLayerDef[] = Array.from({ length: BLUR_LAYERS }, (_, k) => {
  const radius = (BLUR_MAX * (k + 1)) / BLUR_LAYERS;
  const holdFrac = ((BLUR_LAYERS - 1 - k) / (BLUR_LAYERS - 1)) * HOLD_SPAN;
  const fadeEnd = Math.min(1, holdFrac + FADE_SPAN);
  return {
    blur: `blur(${radius.toFixed(2)}px)`,
    mask: `linear-gradient(to bottom, #000 0, ${maskStops(holdFrac, fadeEnd)})`,
  };
});

// Засветление: единый касательный спад на всю полосу (0 → 1) — поверх блюра.
const TINT_MASK = `linear-gradient(to bottom, #000 0, ${maskStops(0, 1)})`;

/** Прочитать числовое значение CSS-переменной (в px); 0, если не задана. */
function readPxVar(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

/** Установить CSS-переменную (в px) на корневом элементе — её читает слой блюра .blur. */
function setRootPx(name: string, px: number): void {
  document.documentElement.style.setProperty(name, `${px}px`);
}

// Гистерезис порога (px), чтобы класс не «дёргался» при остановке ровно на границе.
const COLLAPSE_HYSTERESIS = 8;

export function CollapsingHeader({ title }: CollapsingHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const titleExpandedRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const headerEl = headerRef.current;
    const titleEl = titleExpandedRef.current;
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

      const contentBand = contentTop > 0 ? contentTop : rowHeight;
      // Центр свёрнутого заголовка Б — для порога сворачивания (кросс-фейд А↔Б срабатывает
      // ровно в позиции Б, поэтому здесь именно центр строки).
      const collapsedCenterY = safeTop + contentBand / 2;
      // Точка Б для эффекта — нижняя граница строки заголовка (низ зоны кнопок Telegram),
      // safeTop + contentBand. На этом уровне эффект максимален; выше — держится на максимуме,
      // ниже — плавно затухает до нуля на полосе --content-blur-band.
      setRootPx("--content-fade-pointb", safeTop + contentBand);

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
  }, [title]);

  return (
    <div ref={headerRef}>
      {/* Прогрессивный блюр под шапкой — стопка слоёв backdrop-filter + засветление (см. выше). */}
      <div className={styles.effect} aria-hidden="true">
        {BLUR_LAYER_DEFS.map((layer, index) => (
          <div
            key={index}
            className={styles.blurLayer}
            style={{
              backdropFilter: layer.blur,
              WebkitBackdropFilter: layer.blur,
              maskImage: layer.mask,
              WebkitMaskImage: layer.mask,
            }}
          />
        ))}
        <div
          className={styles.tint}
          style={{ maskImage: TINT_MASK, WebkitMaskImage: TINT_MASK }}
        />
      </div>
      <h1 ref={titleExpandedRef} className={styles.titleExpanded}>
        {title}
      </h1>
      <span className={styles.titleCollapsed} aria-hidden="true">
        {title}
      </span>
    </div>
  );
}
