/** Поле ввода времени (нативный пикер времени iOS), оформленное под значение ряда. */

import styles from "./TimeInput.module.css";

interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  ariaLabel?: string;
}

export function TimeInput({ value, onChange, min, max, ariaLabel }: TimeInputProps) {
  return (
    <input
      type="time"
      className={styles.input}
      value={value}
      min={min}
      max={max}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
