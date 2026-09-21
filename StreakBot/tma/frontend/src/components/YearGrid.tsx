/**
 * Сетка выполнения по 26 кружков в ряд: 7 рядов (182 дня) в списке привычек,
 * 14 рядов (364 дня) на экране привычки.
 *
 * Раскладка построчная: индекс 0 истории — левый верхний угол (самый старый день),
 * последний — правый нижний (сегодня). Закрашенный кружок — день выполнен,
 * полупрозрачный — пропущен/нет данных. Кружки масштабируются под ширину карточки.
 */

import styles from "./YearGrid.module.css";

interface YearGridProps {
  /** История выполнения (старое → сегодня); длина кратна 26. */
  history: boolean[];
}

export function YearGrid({ history }: YearGridProps) {
  return (
    <div
      className={styles.grid}
      role="img"
      aria-label="Годовая история выполнения"
    >
      {history.map((done, index) => (
        <span
          key={index}
          className={`${styles.cell} ${done ? styles.filled : styles.empty}`}
        />
      ))}
    </div>
  );
}
