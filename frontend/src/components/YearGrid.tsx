/**
 * Сетка выполнения: 8 рядов по 23 кружка (184 дня) в списке привычек,
 * 14 рядов по 26 кружков (364 дня) на экране привычки.
 *
 * Раскладка построчная: индекс 0 истории — левый верхний угол (самый старый день),
 * последний — правый нижний (сегодня). Закрашенный кружок — день выполнен,
 * со снежинкой — не выполнен, но привычка в этот день была заморожена,
 * полупрозрачный — пропущен/нет данных. У привычки «несколько раз в день» неполный день
 * (выполнена, но меньше цели) — между пропуском и выполненным, по доле сделанного:
 * 1 из 4 — на четверть. Кружки масштабируются под ширину карточки.
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
  /** Сколько раз привычка выполнена — за те же дни, что `history` (привычка «несколько
   *  раз в день»; пусто — у остальных). */
  counts?: readonly number[];
  /** Цель на день (`times_per_day`): доля неполного дня — counts / total. */
  total?: number;
  /** Кружков в ряду. */
  columns?: number;
}

export function YearGrid({
  history,
  frozen = [],
  counts = [],
  total = 1,
  columns = GRID_COLUMNS,
}: YearGridProps) {
  const strings = useStrings();
  return (
    <div
      className={styles.grid}
      style={{ "--grid-columns": columns } as CSSProperties}
      role="img"
      aria-label={strings.habitHistoryLabel}
    >
      {history.map((done, index) => {
        const count = counts[index] ?? 0;
        if (!done && !frozen[index] && count > 0 && total > 1) {
          return (
            <span
              key={index}
              className={`${styles.cell} ${styles.partial}`}
              style={{ "--dot-fill": Math.min(count / total, 1) } as CSSProperties}
            />
          );
        }
        return (
          <span
            key={index}
            className={`${styles.cell} ${
              done ? styles.filled : frozen[index] ? styles.frozen : styles.empty
            }`}
          />
        );
      })}
    </div>
  );
}
