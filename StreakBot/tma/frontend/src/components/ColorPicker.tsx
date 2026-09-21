/**
 * Выбор цвета (темы) привычки: ряд цветных кружков, прокручивается по горизонтали.
 * Выбранный отмечен белой точкой в центре.
 *
 * При открытии ряд прокручен так, чтобы выбранный цвет был виден (у привычки, открытой
 * на редактирование, он может оказаться в конце ряда).
 */

import { useLayoutEffect, useRef } from "react";

import { HABIT_COLORS } from "../constants";
import { STRINGS } from "../strings";
import { habitColorStyle } from "../theme";
import type { HabitColor } from "../types/habit";
import styles from "./ColorPicker.module.css";

interface ColorPickerProps {
  value: HabitColor;
  onChange: (color: HabitColor) => void;
  /** Доступная подпись группы (обычно — заголовок секции). */
  label: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Только при открытии: дальше ряд прокручивает сам пользователь.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const swatch = selectedRef.current;
    if (row && swatch) {
      row.scrollLeft = swatch.offsetLeft - (row.clientWidth - swatch.offsetWidth) / 2;
    }
  }, []);

  return (
    <div className={styles.frame}>
      <div ref={rowRef} className={styles.row} role="radiogroup" aria-label={label}>
        {HABIT_COLORS.map((color) => {
          const selected = color === value;
          return (
            <button
              key={color}
              ref={selected ? selectedRef : undefined}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={STRINGS.colorNames[color]}
              className={`${styles.swatch} ${selected ? styles.selected : ""}`}
              style={habitColorStyle(color)}
              onClick={() => onChange(color)}
            />
          );
        })}
      </div>
    </div>
  );
}
