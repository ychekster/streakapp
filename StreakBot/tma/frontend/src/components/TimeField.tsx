/**
 * Выбор времени — серая таблетка «09:00», как компактный выбор даты/времени в iOS.
 *
 * Показываем свою подпись (всегда 24-часовой формат, как во всём интерфейсе), а выбор
 * делает нативный <input type="time">, прозрачный и растянутый на таблетку: на телефоне
 * нажатие открывает системный выбор времени. На компьютере нажатие только поставило бы
 * курсор в невидимое поле, поэтому там выбор открывается явно (showPicker).
 */

import type { MouseEvent } from "react";

import styles from "./TimeField.module.css";

interface TimeFieldProps {
  /** «ЧЧ:ММ». */
  value: string;
  onChange: (value: string) => void;
  /** Доступная подпись (обычно — подпись ряда). */
  label: string;
}

function openPickerWithMouse(event: MouseEvent<HTMLInputElement>): void {
  if (!window.matchMedia("(pointer: fine)").matches) {
    return;
  }
  try {
    event.currentTarget.showPicker();
  } catch {
    // Старый браузер без showPicker — остаётся ввод с клавиатуры.
  }
}

export function TimeField({ value, onChange, label }: TimeFieldProps) {
  return (
    <span className={styles.pill}>
      {value}
      <input
        type="time"
        className={styles.native}
        aria-label={label}
        value={value}
        // Кнопка «Сбросить» в выборе iOS присылает пустую строку — время остаётся прежним.
        onChange={(event) => {
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        onClick={openPickerWithMouse}
      />
    </span>
  );
}
