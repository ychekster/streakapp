/**
 * Выбор цвета (темы) привычки: ряд цветных кружков, прокручивается по горизонтали.
 * Выбранный отмечен белой точкой в центре. Последний кружок — палитра (свой цвет): под ним
 * системный выбор цвета (`<input type="color">`), любой оттенок и насыщенность. Выбран
 * свой цвет — радуга палитры остаётся ободком, внутри — сам цвет.
 *
 * При открытии ряд прокручен так, чтобы выбранный цвет был виден (у привычки, открытой
 * на редактирование, он может оказаться в конце ряда).
 */

import { useLayoutEffect, useRef } from "react";

import { HABIT_COLORS } from "../constants";
import { useStrings } from "../preferences";
import { habitColorHex, habitColorStyle, isCustomColor } from "../theme";
import type { HabitColor } from "../types/habit";
import styles from "./ColorPicker.module.css";

interface ColorPickerProps {
  value: HabitColor;
  onChange: (color: HabitColor) => void;
  /** Доступная подпись группы (обычно — заголовок секции). */
  label: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const strings = useStrings();
  const rowRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLElement | null>(null);
  const custom = isCustomColor(value);
  const keepSelected = (element: HTMLElement | null): void => {
    selectedRef.current = element;
  };

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
              ref={selected ? keepSelected : undefined}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={strings.colorNames[color]}
              className={`${styles.swatch} ${selected ? styles.selected : ""}`}
              style={habitColorStyle(color)}
              onClick={() => onChange(color)}
            />
          );
        })}
        <label
          ref={custom ? keepSelected : undefined}
          className={`${styles.swatch} ${styles.custom} ${custom ? styles.selected : ""}`}
          style={custom ? habitColorStyle(value) : undefined}
        >
          <input
            type="color"
            className={styles.input}
            value={habitColorHex(value)}
            aria-label={strings.colorCustom}
            onChange={(event) => onChange(event.target.value.toLowerCase() as HabitColor)}
          />
        </label>
      </div>
    </div>
  );
}
