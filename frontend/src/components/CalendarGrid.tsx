/**
 * Сетка в «Виде сетки» calendar: ряды по 4 месяца, в месяце — недели столбцами, дни
 * недели рядами (раскладка — calendarLayout.ts). Над месяцами — их подписи («Окт»), слева —
 * дни недели через один (Пн, Ср, Пт, Вс).
 *
 * Кружки — как в YearGrid (те же классы): выполненный, неполный, замороженный, пропуск;
 * сегодня (день отметки) — с точкой. Дни месяца после дня отметки — бледнее пропуска: они
 * ещё не наступили. Дни раньше истории — пропуск.
 *
 * Кружки стоят по процентам от ширины ряда, ряд держит пропорции (aspect-ratio), поэтому
 * сетка, как и YearGrid, подстраивается под ширину карточки.
 */

import type { CSSProperties } from "react";

import { WEEKDAYS } from "../constants";
import { daysBetween } from "../data/dates";
import { useStrings } from "../preferences";
import { CELL, PITCH, ROW_HEIGHT, ROW_WIDTH, calendarRows } from "./calendarLayout";
import gridStyles from "./YearGrid.module.css";
import styles from "./CalendarGrid.module.css";

/** Подписанные дни недели — через один, первый и последний. */
const LABELED_WEEKDAYS = [0, 2, 4, 6];

interface CalendarGridProps {
  /** История выполнения (старое → день отметки), как у YearGrid. */
  history: readonly boolean[];
  frozen?: readonly boolean[];
  counts?: readonly number[];
  total?: number;
  totals?: readonly number[];
  fills?: readonly number[];
  /** День отметки («ГГГГ-ММ-ДД») — последний день истории. */
  day: string;
  /** Рядов месяцев. */
  rows?: number;
  /** По месяц какого дня строить сетку (по умолчанию — `day`): картинка в настройках
   *  двигает день отметки, а месяцы стоят на месте. */
  until?: string;
}

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

export function CalendarGrid({
  history,
  frozen = [],
  counts = [],
  total = 1,
  totals,
  fills,
  day,
  rows = 1,
  until = day,
}: CalendarGridProps) {
  const strings = useStrings();
  const width = percent(CELL, ROW_WIDTH);

  function cellClass(date: string): { className: string; style?: CSSProperties } {
    const ago = daysBetween(date, day);
    if (ago < 0) {
      return { className: `${gridStyles.empty} ${styles.future}` };
    }
    const index = history.length - 1 - ago;
    if (index < 0) {
      return { className: gridStyles.empty };
    }
    const today = ago === 0 ? gridStyles.today : "";
    const done = history[index];
    const goal = totals?.[index] ?? total;
    const part = fills
      ? (fills[index] ?? 0)
      : goal > 1
        ? Math.min((counts[index] ?? 0) / goal, 1)
        : 0;
    if (!done && !frozen[index] && part > 0) {
      return {
        className: `${gridStyles.partial} ${today}`,
        style: { "--dot-fill": part } as CSSProperties,
      };
    }
    if (frozen[index] && !done) {
      return { className: gridStyles.frozen };
    }
    return { className: `${done ? gridStyles.filled : gridStyles.empty} ${today}` };
  }

  return (
    <span className={styles.calendar} role="img" aria-label={strings.habitHistoryLabel}>
      {calendarRows(until, rows).map((row) => (
        <span key={row.months[0]?.month} className={styles.row}>
          <span />
          <span className={styles.months} aria-hidden="true">
            {row.months.map(({ month, x }) => (
              <span
                key={month}
                className={styles.month}
                style={{ left: percent(x, ROW_WIDTH) }}
              >
                {strings.monthShortNames[Number(month.slice(5, 7)) - 1]}
              </span>
            ))}
          </span>
          <span className={styles.weekdays} aria-hidden="true">
            {LABELED_WEEKDAYS.map((weekday) => (
              <span
                key={weekday}
                className={styles.weekday}
                style={{
                  top: percent(weekday * PITCH, ROW_HEIGHT),
                  height: percent(CELL, ROW_HEIGHT),
                }}
              >
                {strings.weekdays[WEEKDAYS[weekday]!].short}
              </span>
            ))}
          </span>
          <span
            className={styles.cells}
            style={{ aspectRatio: `${ROW_WIDTH} / ${ROW_HEIGHT}` }}
          >
            {row.cells.map(({ date, x, y }) => {
              const { className, style } = cellClass(date);
              return (
                <span
                  key={date}
                  className={`${gridStyles.cell} ${styles.cell} ${className}`}
                  style={{ ...style, left: percent(x, ROW_WIDTH), top: percent(y, ROW_HEIGHT), width }}
                />
              );
            })}
          </span>
        </span>
      ))}
    </span>
  );
}
