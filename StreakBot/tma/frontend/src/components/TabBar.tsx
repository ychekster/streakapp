/**
 * Нижняя навигация в стиле таб-бара iOS 26: стеклянная таблетка с вкладками и
 * необязательная круглая кнопка «+» справа из того же стекла. Активную вкладку отмечает
 * серая подложка, которая переезжает между вкладками. В светлой теме стекло светлое, а
 * иконки и подписи чёрные; в тёмной — наоборот. Зафиксирована внизу с учётом safe area;
 * на вложенных экранах уезжает вниз.
 *
 * Приложение показывает две вкладки («Привычки», «Настройки») равной ширины и «+»,
 * админ-панель — пять вкладок без «+»: тогда таблетка занимает всю ширину, а вкладки
 * делят её по длине подписей (каждой — её подпись и поровну свободного места), чтобы
 * длинная подпись («Пользователи») помещалась целиком. На совсем узком экране подпись
 * обрезается многоточием.
 *
 * Подложка ставится по измеренному положению и ширине активной вкладки — поэтому
 * вкладкам не обязательно быть одной ширины, а смена языка (другие подписи) её не сбивает.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { PlusIcon } from "./TabIcons";
import styles from "./TabBar.module.css";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Иконка вкладки; `active` — вкладка выбрана (залитый вариант). */
  icon: (active: boolean) => ReactNode;
}

interface TabBarProps<K extends string> {
  tabs: readonly TabItem<K>[];
  active: K;
  /** Скрыть навигацию (уезжает за нижний край экрана). */
  hidden?: boolean;
  onSelect: (tab: K) => void;
  /** Кнопка «+» справа; без обработчика её нет. */
  onAdd?: () => void;
  addLabel?: string;
}

/** Положение подложки внутри таблетки, px. */
interface Thumb {
  x: number;
  width: number;
}

export function TabBar<K extends string>({
  tabs,
  active,
  hidden = false,
  onSelect,
  onAdd,
  addLabel,
}: TabBarProps<K>) {
  const pillRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === active));
  const className = [styles.bar, hidden ? styles.hidden : "", onAdd ? "" : styles.wide]
    .filter(Boolean)
    .join(" ");

  // Подложка — под активной вкладкой: её положение измеряется до отрисовки и заново при
  // любом изменении размеров таблетки или вкладок (поворот экрана, другой язык).
  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill) {
      return;
    }
    const tabElements = [...pill.querySelectorAll<HTMLElement>("[role=tab]")];
    const measure = (): void => {
      const tab = tabElements[activeIndex];
      if (tab) {
        setThumb({ x: tab.offsetLeft, width: tab.offsetWidth });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pill);
    tabElements.forEach((tab) => observer.observe(tab));
    return () => observer.disconnect();
  }, [activeIndex, tabs]);

  const thumbStyle = thumb
    ? ({ width: thumb.width, transform: `translateX(${thumb.x}px)` } as CSSProperties)
    : undefined;

  return (
    <nav className={className} aria-hidden={hidden}>
      <div ref={pillRef} className={styles.pill} role="tablist">
        {/* До первого измерения подложки нет — иначе она въехала бы из левого края. */}
        {thumb ? <span className={styles.thumb} style={thumbStyle} aria-hidden="true" /> : null}
        {tabs.map((tab) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`${styles.tab} ${selected ? styles.tabActive : ""}`}
              onClick={() => onSelect(tab.key)}
            >
              {tab.icon(selected)}
              <span className={styles.label}>{tab.label}</span>
            </button>
          );
        })}
      </div>
      {onAdd ? (
        <button type="button" className={styles.add} aria-label={addLabel} onClick={onAdd}>
          <PlusIcon />
        </button>
      ) : null}
    </nav>
  );
}
