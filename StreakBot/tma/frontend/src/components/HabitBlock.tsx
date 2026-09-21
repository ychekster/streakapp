/**
 * Блок одной привычки внутри общей карточки: строка «название + кнопка отметки» и сетка точек,
 * окрашенные в цвет привычки.
 *
 * Если передан `onOpen`, весь блок, кроме кнопки отметки, открывает экран привычки: под
 * содержимым лежит невидимая кнопка на всю площадь блока, а содержимое пропускает нажатия
 * к ней (см. HabitBlock.module.css). Так кнопки не вкладываются друг в друга.
 */

import { GRID_DAYS } from "../constants";
import { STRINGS } from "../strings";
import { habitColorStyle } from "../theme";
import type { Habit } from "../types/habit";
import { CheckButton } from "./CheckButton";
import { YearGrid } from "./YearGrid";
import styles from "./HabitBlock.module.css";

interface HabitBlockProps {
  habit: Habit;
  /** Можно ли отмечать выполнение. Для незапланированных на сегодня — только просмотр. */
  interactive: boolean;
  /** Сколько последних дней истории показать в сетке (по умолчанию — сетка списка). */
  gridDays?: number;
  onToggle?: (taskId: number) => void;
  /** Открыть экран привычки по нажатию на блок. */
  onOpen?: (taskId: number) => void;
}

export function HabitBlock({
  habit,
  interactive,
  gridDays = GRID_DAYS,
  onToggle,
  onOpen,
}: HabitBlockProps) {
  return (
    <article
      className={`${styles.block} ${onOpen ? styles.openable : ""}`}
      style={habitColorStyle(habit.color)}
    >
      {onOpen ? (
        <button
          type="button"
          className={styles.open}
          aria-label={`${STRINGS.openHabit}: ${habit.name}`}
          onClick={() => onOpen(habit.id)}
        />
      ) : null}
      <div className={styles.header}>
        <h3 className={styles.name}>{habit.name}</h3>
        <CheckButton
          done={habit.done_today}
          habitName={habit.name}
          disabled={!interactive}
          onToggle={() => onToggle?.(habit.id)}
        />
      </div>
      <YearGrid history={habit.history.slice(-gridDays)} />
    </article>
  );
}
