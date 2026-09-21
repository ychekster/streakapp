/**
 * Нижняя навигация в стиле таб-бара iOS 26: стеклянная таблетка с двумя вкладками
 * («Привычки», «Настройки») и отдельная круглая кнопка «+» справа из того же стекла.
 * Активную вкладку отмечает серая подложка, которая переезжает между вкладками. В
 * светлой теме стекло светлое, а иконки и подписи чёрные; в тёмной — наоборот.
 * Зафиксирована внизу с учётом safe area; на вложенных экранах (экран привычки) уезжает
 * вниз.
 */

import { useStrings } from "../preferences";
import styles from "./TabBar.module.css";

export type TabKey = "habits" | "settings";

interface TabBarProps {
  active: TabKey;
  /** Скрыть навигацию (уезжает за нижний край экрана). */
  hidden?: boolean;
  onSelect: (tab: TabKey) => void;
  onAdd: () => void;
}

// id маски выреза галочки; навигация на экране одна, поэтому id уникален.
const CHECK_CUTOUT_ID = "tabbar-check-cutout";
const CHECK_PATH = "M8.8 13.6L12 16.9l5.4-7.3";

/** Галочка в круге: на активной вкладке — залитый круг с прорезанной галочкой. */
function HabitsIcon({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <svg className={styles.icon} viewBox="0 0 26 26" aria-hidden="true">
        <mask id={CHECK_CUTOUT_ID}>
          <rect width="26" height="26" fill="#fff" />
          <path
            d={CHECK_PATH}
            fill="none"
            stroke="#000"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
        <circle cx="13" cy="13" r="11.65" fill="currentColor" mask={`url(#${CHECK_CUTOUT_ID})`} />
      </svg>
    );
  }
  return (
    <svg className={styles.icon} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="10.8" stroke="currentColor" strokeWidth="1.7" />
      <path
        d={CHECK_PATH}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Зуб шестерёнки (смотрит вверх): сужается к скруглённой вершине, у основания — плавный
// переход в кольцо. 24 копии через каждые 15°.
const GEAR_TOOTH =
  "M11.75 2.4V1.98Q12.24 1.98 12.26 1.5L12.45 0.6A0.55 0.55 0 0 1 13.55 0.6L13.74 1.5Q13.76 1.98 14.25 1.98V2.4Z";
const GEAR_TOOTH_ANGLES = Array.from({ length: 24 }, (_, i) => i * 15);

/** Шестерёнка как у «Настроек» iOS: зубчатое кольцо и три спицы к втулке. */
function SettingsIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 26 26" fill="none" stroke="currentColor" aria-hidden="true">
      <g fill="currentColor" stroke="none">
        {GEAR_TOOTH_ANGLES.map((angle) => (
          <path key={angle} d={GEAR_TOOTH} transform={`rotate(${angle} 13 13)`} />
        ))}
      </g>
      <circle cx="13" cy="13" r="10.15" strokeWidth="1.9" />
      <path d="M14.05 13H22.6M12.48 13.91L8.2 21.31M12.48 12.09L8.2 4.69" strokeWidth="1.55" />
      <circle cx="13" cy="13" r="1.05" strokeWidth="0.9" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M13 6.5v13M6.5 13h13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function TabBar({ active, hidden = false, onSelect, onAdd }: TabBarProps) {
  const strings = useStrings();
  return (
    <nav className={`${styles.bar} ${hidden ? styles.hidden : ""}`} aria-hidden={hidden}>
      <div className={styles.pill} role="tablist">
        <span
          className={`${styles.thumb} ${active === "settings" ? styles.thumbSecond : ""}`}
          aria-hidden="true"
        />
        <button
          type="button"
          role="tab"
          aria-selected={active === "habits"}
          className={`${styles.tab} ${active === "habits" ? styles.tabActive : ""}`}
          onClick={() => onSelect("habits")}
        >
          <HabitsIcon filled={active === "habits"} />
          <span>{strings.tabHabits}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "settings"}
          className={`${styles.tab} ${active === "settings" ? styles.tabActive : ""}`}
          onClick={() => onSelect("settings")}
        >
          <SettingsIcon />
          <span>{strings.tabSettings}</span>
        </button>
      </div>
      <button
        type="button"
        className={styles.add}
        aria-label={strings.addHabit}
        onClick={onAdd}
      >
        <PlusIcon />
      </button>
    </nav>
  );
}
