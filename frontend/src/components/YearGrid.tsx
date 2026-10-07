/**
 * Сетка выполнения: 8 рядов по 23 кружка (184 дня) в списке привычек,
 * 14 рядов по 26 кружков (364 дня) на экране привычки.
 *
 * Раскладка построчная: индекс 0 истории — левый верхний угол (самый старый день),
 * последний — правый нижний (сегодня). Закрашенный кружок — день выполнен,
 * со снежинкой — не выполнен, но привычка в этот день была заморожена,
 * полупрозрачный — пропущен/нет данных. Кружки масштабируются под ширину карточки.
 */

import type { CSSProperties } from "react";

import { GRID_COLUMNS } from "../constants";
import { useStrings } from "../preferences";
import styles from "./YearGrid.module.css";

interface YearGridProps {
  /** История выполнения (старое → сегодня); длина кратна `columns`. */
  history: boolean[];
  /** Дни заморозки — за те же дни, что `history`. */
  frozen?: readonly boolean[];
  /** Кружков в ряду. */
  columns?: number;
}

export function YearGrid({ history, frozen = [], columns = GRID_COLUMNS }: YearGridProps) {
  const strings = useStrings();
  return (
    <div
      className={styles.grid}
      style={{ "--grid-columns": columns } as CSSProperties}
      role="img"
      aria-label={strings.habitHistoryLabel}
    >
      {history.map((done, index) => (
        <span
          key={index}
          className={`${styles.cell} ${
            done ? styles.filled : frozen[index] ? styles.frozen : styles.empty
          }`}
        />
      ))}
    </div>
  );
}
