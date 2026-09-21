/** Выбор дней недели: ряд круглых переключателей (ПН…ВС) на языке интерфейса. */

import { WEEKDAYS } from "../constants";
import { useStrings } from "../preferences";
import styles from "./DayPicker.module.css";

interface DayPickerProps {
  selected: Set<string>;
  onToggle: (code: string) => void;
}

export function DayPicker({ selected, onToggle }: DayPickerProps) {
  const strings = useStrings();
  return (
    <div className={styles.days}>
      {WEEKDAYS.map((code) => {
        const isSelected = selected.has(code);
        const day = strings.weekdays[code];
        return (
          <button
            key={code}
            type="button"
            aria-pressed={isSelected}
            aria-label={day.full}
            className={`${styles.day} ${isSelected ? styles.selected : ""}`}
            onClick={() => onToggle(code)}
          >
            {day.short}
          </button>
        );
      })}
    </div>
  );
}
