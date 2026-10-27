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
 * показывает только дни с начала текущего «листа», остальные кружки — пустые, а в кружке
 * сегодня точка (он не в углу сетки, и иначе его не найти).
 */

import { memo } from "react";

import { GRID_COLUMNS, GRID_DAYS } from "../constants";
import { groupFill } from "../data/derive";
import { endBurst } from "../hooks/useToggle";
import { useStrings } from "../preferences";
import { habitColorStyle } from "../theme";
import type { Habit } from "../types/habit";
import { CheckButton } from "./CheckButton";
import { openCountSheet } from "./CountSheet";
import { fixedGridFill, useGridView } from "./gridLayout";
import { YearGrid } from "./YearGrid";
import styles from "./HabitBlock.module.css";

interface HabitBlockProps {
  habit: Habit;
  /** Можно ли отмечать выполнение (незапланированную на сегодня — тоже: бонусная
   *  отметка, бледная кнопка). */
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
  const fill = fixedGridFill(useGridView(), habit, gridDays);
  const shown = fill ?? gridDays;
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
          bonus={!habit.scheduled_today}
          total={habit.times_per_day}
          count={habit.today_count}
          countUp={habit.overtime}
          // Отмечать можно — удержание открывает окно счёта (у «Сверх плана»).
          onLongPress={onToggle ? () => openSheet(habit.id) : undefined}
          // «Сверх плана» на цели: нажатие уже не прибавляет, а открывает окно счёта.
          onToggle={() =>
            habit.overtime && habit.today_count >= habit.times_per_day
              ? openSheet(habit.id)
              : onToggle?.(habit.id)
          }
        />
      </div>
      <YearGrid
        history={habit.history.slice(-shown)}
        frozen={habit.frozen_history.slice(-shown)}
        counts={(habit.history_counts ?? []).slice(-shown)}
        total={habit.times_per_day}
        fills={groupFill(habit)?.slice(-shown)}
        columns={gridColumns}
        cells={gridDays}
        markToday={fill !== null}
      />
    </article>
  );
});

/** Окно счёта: серия быстрых нажатий и её плашка «Отменить» заканчиваются. */
function openSheet(habitId: number): void {
  endBurst();
  openCountSheet(habitId);
}
