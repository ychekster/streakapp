/**
 * Выбор даты — серая таблетка «Сегодня» / «Завтра» / «12 окт.», как TimeField.
 *
 * Подпись своя (на языке интерфейса; год — только если не текущий), а выбор делает
 * нативный <input type="date">, прозрачный и растянутый на таблетку: на телефоне нажатие
 * открывает системный календарь. На компьютере календарь открывается явно (showPicker).
 */

import type { MouseEvent } from "react";

import { useLanguage, useStrings } from "../preferences";
import styles from "./TimeField.module.css";

interface DateFieldProps {
  /** «ГГГГ-ММ-ДД». */
  value: string;
  onChange: (value: string) => void;
  /** Доступная подпись (обычно — подпись ряда). */
  label: string;
  /** Самая поздняя дата выбора («ГГГГ-ММ-ДД»). */
  max?: string;
}

/** Дата устройства «ГГГГ-ММ-ДД» со сдвигом на `offsetDays` дней. */
export function localDate(offsetDays = 0): string {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  const month = String(day.getMonth() + 1).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${String(day.getDate()).padStart(2, "0")}`;
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

export function DateField({ value, onChange, label, max }: DateFieldProps) {
  const language = useLanguage();
  const strings = useStrings();
  return (
    <span className={styles.pill}>
      {formatDate(value)}
      <input
        type="date"
        className={styles.native}
        aria-label={label}
        value={value}
        max={max}
        // Кнопка «Сбросить» в выборе iOS присылает пустую строку — дата остаётся прежней.
        onChange={(event) => {
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        onClick={openPickerWithMouse}
      />
    </span>
  );

  function formatDate(iso: string): string {
    if (iso === localDate()) {
      return strings.dateToday;
    }
    if (iso === localDate(1)) {
      return strings.dateTomorrow;
    }
    const [year, month, day] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "short",
      year: year === new Date().getFullYear() ? undefined : "numeric",
    }).format(new Date(year, month - 1, day));
  }
}
