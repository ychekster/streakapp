/** Выбор дней недели: ряд круглых переключателей (ПН…ВС). */

import type { Weekday } from "../types/meta";
import styles from "./DayPicker.module.css";

interface DayPickerProps {
  weekdays: Weekday[];
  selected: Set<string>;
  onToggle: (code: string) => void;
}

export function DayPicker({ weekdays, selected, onToggle }: DayPickerProps) {
  return (
    <div className={styles.days}>
      {weekdays.map((weekday) => {
        const isSelected = selected.has(weekday.code);
        return (
          <button
            key={weekday.code}
            type="button"
            aria-pressed={isSelected}
            aria-label={weekday.full}
            className={`${styles.day} ${isSelected ? styles.selected : ""}`}
            onClick={() => onToggle(weekday.code)}
          >
            {weekday.short}
          </button>
        );
      })}
    </div>
  );
}
