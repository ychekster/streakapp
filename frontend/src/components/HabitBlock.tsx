/**
 * Блок одной привычки внутри общей карточки: строка «название + кнопка отметки» и сетка точек,
 * окрашенные в цвет привычки. Описание (если есть) — серым и мельче под названием.
 *
 * Если передан `onOpen`, весь блок, кроме кнопки отметки, открывает экран привычки: под
 * содержимым лежит невидимая кнопка на всю площадь блока, а содержимое пропускает нажатия
 * к ней (см. HabitBlock.module.css). Так кнопки не вкладываются друг в друга.
 *
 * Мемоизирован: отметка одной привычки заменяет в списке только её объект, и остальные
 * блоки (у каждого — сетка из сотен точек) не перерисовываются. Обработчики должны быть
 * стабильными (useCallback).
 *
 * Раскладку дней в сетке задаёт «Вид сетки» (gridLayout.ts): в виде "fixed" сетка
 * показывает только дни с начала текущего «листа», остальные кружки — пустые.
 */

import { memo } from "react";

import { GRID_COLUMNS, GRID_DAYS } from "../constants";
import { useStrings } from "../preferences";
import { habitColorStyle } from "../theme";
import type { Habit } from "../types/habit";
import { CheckButton } from "./CheckButton";
import { fixedGridFill, useGridView } from "./gridLayout";
import { YearGrid } from "./YearGrid";
import styles from "./HabitBlock.module.css";

interface HabitBlockProps {
  habit: Habit;
  /** Можно ли отмечать выполнение. Для незапланированных на сегодня — только просмотр. */
  interactive: boolean;
  /** Сколько последних дней истории показать в сетке (по умолчанию — сетка списка). */
  gridDays?: number;
  /** Кружков в ряду сетки. */
  gridColumns?: number;
  onToggle?: (taskId: number) => void;
  /** Открыть экран привычки по нажатию на блок. */
  onOpen?: (taskId: number) => void;
}

export const HabitBlock = memo(function HabitBlock({
  habit,
  interactive,
  gridDays = GRID_DAYS,
  gridColumns = GRID_COLUMNS,
  onToggle,
  onOpen,
}: HabitBlockProps) {
  const strings = useStrings();
  // Сколько последних дней истории показать: всю сетку или начало листа ("fixed").
  const shown = fixedGridFill(useGridView(), habit.created_on, gridDays) ?? gridDays;
  return (
    <article
      className={`${styles.block} ${onOpen ? styles.openable : ""}`}
      style={habitColorStyle(habit.color)}
    >
      {onOpen ? (
        <button
          type="button"
          className={styles.open}
          aria-label={`${strings.openHabit}: ${habit.name}`}
          onClick={() => onOpen(habit.id)}
        />
      ) : null}
      <div className={styles.header}>
        <div className={`${styles.title} ${habit.description ? styles.withDescription : ""}`}>
          <h3 className={styles.name}>{habit.name}</h3>
          {habit.description ? <p className={styles.description}>{habit.description}</p> : null}
        </div>
        <CheckButton
          done={habit.done_today}
          habitName={habit.name}
          disabled={!interactive}
          frozen={habit.frozen_since !== null}
          total={habit.times_per_day}
          count={habit.today_count}
          onToggle={() => onToggle?.(habit.id)}
        />
      </div>
      <YearGrid
        history={habit.history.slice(-shown)}
        frozen={habit.frozen_history.slice(-shown)}
        counts={(habit.history_counts ?? []).slice(-shown)}
        total={habit.times_per_day}
        columns={gridColumns}
        cells={gridDays}
      />
    </article>
  );
});
