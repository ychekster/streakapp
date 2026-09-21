/**
 * Нижняя навигация в стиле iOS 26 (liquid glass): таблетка с двумя вкладками
 * («Привычки», «Настройки») и отдельная круглая кнопка «+» справа для создания
 * привычки. Зафиксирована внизу с учётом safe area; фон — полупрозрачное матовое
 * стекло (backdrop-filter). На вложенных экранах (экран привычки) уезжает вниз.
 */

import { STRINGS } from "../strings";
import styles from "./TabBar.module.css";

export type TabKey = "habits" | "settings";

interface TabBarProps {
  active: TabKey;
  /** Скрыть навигацию (уезжает за нижний край экрана). */
  hidden?: boolean;
  onSelect: (tab: TabKey) => void;
  onAdd: () => void;
}

function HabitsIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.4 12.4l2.4 2.4 4.8-5.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.49.49 0 00.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 110-7.2 3.6 3.6 0 010 7.2z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className={styles.plus} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function TabBar({ active, hidden = false, onSelect, onAdd }: TabBarProps) {
  return (
    <nav className={`${styles.bar} ${hidden ? styles.hidden : ""}`} aria-hidden={hidden}>
      <div className={styles.pill} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={active === "habits"}
          className={`${styles.tab} ${active === "habits" ? styles.tabActive : ""}`}
          onClick={() => onSelect("habits")}
        >
          <HabitsIcon />
          <span className={styles.tabLabel}>{STRINGS.tabHabits}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "settings"}
          className={`${styles.tab} ${active === "settings" ? styles.tabActive : ""}`}
          onClick={() => onSelect("settings")}
        >
          <SettingsIcon />
          <span className={styles.tabLabel}>{STRINGS.tabSettings}</span>
        </button>
      </div>
      <button
        type="button"
        className={styles.add}
        aria-label={STRINGS.addHabit}
        onClick={onAdd}
      >
        <PlusIcon />
      </button>
    </nav>
  );
}
