/**
 * Нижняя навигация в стиле таб-бара iOS 26: стеклянная таблетка с вкладками и
 * необязательная круглая кнопка «+» справа из того же стекла. Активную вкладку отмечает
 * серая подложка, которая переезжает между вкладками. В светлой теме стекло светлое, а
 * иконки и подписи чёрные; в тёмной — наоборот. Зафиксирована внизу с учётом safe area;
 * на вложенных экранах уезжает вниз.
 *
 * Приложение показывает две вкладки («Привычки», «Настройки») и «+», админ-панель —
 * четыре вкладки без «+»: тогда таблетка занимает всю ширину, как таб-бар iOS с
 * несколькими вкладками.
 */

import type { CSSProperties, ReactNode } from "react";

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

export function TabBar<K extends string>({
  tabs,
  active,
  hidden = false,
  onSelect,
  onAdd,
  addLabel,
}: TabBarProps<K>) {
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === active));
  // Подложка — шириной одной вкладки и сдвинута на номер активной (см. .thumb).
  const pillStyle = {
    "--tab-count": tabs.length,
    "--tab-index": activeIndex,
  } as CSSProperties;
  const className = [styles.bar, hidden ? styles.hidden : "", onAdd ? "" : styles.wide]
    .filter(Boolean)
    .join(" ");

  return (
    <nav className={className} aria-hidden={hidden}>
      <div className={styles.pill} role="tablist" style={pillStyle}>
        <span className={styles.thumb} aria-hidden="true" />
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
              <span>{tab.label}</span>
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
