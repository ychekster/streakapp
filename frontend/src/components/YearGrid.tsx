/**
 * Сетка выполнения: 8 рядов по 23 кружка (184 дня) в списке привычек,
 * 14 рядов по 26 кружков (364 дня) на экране привычки.
 *
 * Раскладка построчная: индекс 0 истории — левый верхний угол (самый старый день),
 * последний — правый нижний (сегодня). Закрашенный кружок — день выполнен,
 * со снежинкой — не выполнен, но привычка в этот день была заморожена,
 * полупрозрачный — пропущен/нет данных. У привычки «несколько раз в день» неполный день
 * (выполнена, но меньше цели) — между пропуском и выполненным, по доле сделанного:
 * 1 из 4 — на четверть. У совместной — по доле, сделанной всеми (`fills`): каждое нажатие
 * любого участника — 1 / (участники × цель). Кружки масштабируются под ширину карточки.
 *
 * В «Виде сетки» fixed история короче сетки (`cells`): дни занимают первые кружки, а
 * остальные — ещё не наступившие — пустые, как пропуск. Кружок сегодня (последний день
 * истории) там отмечен точкой в центре (тёмной в светлой теме, белой в тёмной) (`markToday`) —
 * и пока не выполнен, и после отметки. День заморозки со снежинкой точкой не отмечается.
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
  /** Цель каждого дня (цель меняли: у прошлых дней — своя) — вместо `total`. */
  totals?: readonly number[];
  /** Совместная привычка: доля дня, выполненная всеми (0…1), — вместо `counts`. */
  fills?: readonly number[];
  /** Кружков в ряду. */
  columns?: number;
  /** Всего кружков; по умолчанию — по дню истории на кружок. */
  cells?: number;
  /** Отметить точкой кружок сегодня — последний день истории. */
  markToday?: boolean;
}

export function YearGrid({
  history,
  frozen = [],
  counts = [],
  total = 1,
  totals,
  fills,
  columns = GRID_COLUMNS,
  cells = history.length,
  markToday = false,
}: YearGridProps) {
  const strings = useStrings();
  const today = markToday ? history.length - 1 : -1;
  return (
    <div
      className={styles.grid}
      style={{ "--grid-columns": columns } as CSSProperties}
      role="img"
      aria-label={strings.habitHistoryLabel}
    >
      {history.map((done, index) => {
        const goal = totals?.[index] ?? total;
        const part = fills
          ? (fills[index] ?? 0)
          : goal > 1
            ? Math.min((counts[index] ?? 0) / goal, 1)
            : 0;
        if (!done && !frozen[index] && part > 0) {
          return (
            <span
              key={index}
              className={`${styles.cell} ${styles.partial} ${index === today ? styles.today : ""}`}
              style={{ "--dot-fill": part } as CSSProperties}
            />
          );
        }
        return (
          <span
            key={index}
            className={`${styles.cell} ${
              done ? styles.filled : frozen[index] ? styles.frozen : styles.empty
            } ${index === today && !frozen[index] ? styles.today : ""}`}
          />
        );
      })}
      {Array.from({ length: Math.max(0, cells - history.length) }, (_, index) => (
        <span key={history.length + index} className={`${styles.cell} ${styles.empty}`} />
      ))}
    </div>
  );
}
