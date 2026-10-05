/** Выбор дней недели: ряд круглых переключателей (Пн…Вс) на языке интерфейса, как в
 *  «Будильнике» iOS. Ряд над ним (ListItem) — той же высоты, что в эталоне. */

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
    <div className={styles.days} data-day-picker="">
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
