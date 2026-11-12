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
 * сегодня точка (он не в углу сетки, и иначе его не найти). В виде "calendar" вместо
 * сетки — календарь по месяцам и дням недели (CalendarGrid), пока известен день отметки.
 * В виде "large" — та же сетка со сдвигом, но крупнее: `largeColumns` в ряд,
 * `largeRows` рядов.
 */

import { memo, useMemo } from "react";

import { GRID_COLUMNS, GRID_DAYS, LARGE_GRID_COLUMNS, LARGE_GRID_ROWS } from "../constants";
import { groupFill, historyGoals, isTimed } from "../data/derive";
import { endBurst } from "../hooks/useToggle";
import { useStrings } from "../preferences";
import { habitColorStyle } from "../theme";
import type { Habit } from "../types/habit";
import { CalendarGrid } from "./CalendarGrid";
import { CheckButton } from "./CheckButton";
import { openCountSheet } from "./CountSheet";
import { TimerButton } from "./TimerButton";
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
  /** Рядов месяцев в виде "calendar". */
  calendarRows?: number;
  /** Кружков в ряду и рядов в виде "large". */
  largeColumns?: number;
  largeRows?: number;
  onToggle?: (taskId: number) => void;
  /** Открыть экран привычки по нажатию на блок. */
  onOpen?: (taskId: number) => void;
}

export const HabitBlock = memo(function HabitBlock({
  habit,
  interactive,
  gridDays = GRID_DAYS,
  gridColumns = GRID_COLUMNS,
  calendarRows = 1,
  largeColumns = LARGE_GRID_COLUMNS,
  largeRows = LARGE_GRID_ROWS,
  onToggle,
  onOpen,
}: HabitBlockProps) {
  const strings = useStrings();
  // Сколько последних дней истории показать: всю сетку или начало листа ("fixed").
  const gridView = useGridView();
  const large = gridView.layout === "large";
  const columns = large ? largeColumns : gridColumns;
  const cells = large ? largeRows * largeColumns : gridDays;
  const fill = fixedGridFill(gridView, habit, cells);
  const shown = fill ?? cells;
  // Неполный день закрашивается по цели того дня (цель меняли — у дней своя).
  const day = gridView.day;
  const goals = useMemo(() => (day ? historyGoals(habit, day) : null), [habit, day]);
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
        {isTimed(habit) ? (
          <TimerButton
            habit={habit}
            disabled={!interactive}
            bonus={!habit.scheduled_today}
            // Удержание — окно времени за день (поправить руками).
            onLongPress={onToggle ? () => openSheet(habit.id) : undefined}
            // Цель набрана и дальше нельзя («Сверх плана» выключен) — окно времени; иначе
            // ▶ / ❚❚.
            onToggle={() =>
              habit.done_today && !habit.overtime ? openSheet(habit.id) : onToggle?.(habit.id)
            }
          />
        ) : (
        <CheckButton
          done={habit.done_today}
          habitName={habit.name}
          disabled={!interactive}
          frozen={habit.frozen_since !== null}
          bonus={!habit.scheduled_today}
          total={habit.times_per_day}
          count={habit.today_count}
          countUp={habit.overtime}
          // Отмечать можно — удержание открывает окно счёта («несколько раз в день»).
          onLongPress={onToggle ? () => openSheet(habit.id) : undefined}
          // «Несколько раз в день»: нажатие сразу открывает окно счёта (и до цели, и на ней).
          onToggle={() =>
            habit.times_per_day > 1
              ? onToggle && openSheet(habit.id)
              : onToggle?.(habit.id)
          }
        />
        )}
      </div>
      {gridView.layout === "calendar" && day ? (
        <CalendarGrid
          history={habit.history}
          frozen={habit.frozen_history}
          counts={habit.history_counts}
          total={habit.times_per_day}
          totals={goals ?? undefined}
          fills={groupFill(habit) ?? undefined}
          day={day}
          rows={calendarRows}
        />
      ) : (
      <YearGrid
        history={habit.history.slice(-shown)}
        frozen={habit.frozen_history.slice(-shown)}
        counts={(habit.history_counts ?? []).slice(-shown)}
        total={habit.times_per_day}
        totals={goals?.slice(-shown)}
        fills={groupFill(habit)?.slice(-shown)}
        columns={columns}
        cells={cells}
        markToday={fill !== null}
        wide={large}
      />
      )}
    </article>
  );
});

/** Окно счёта: серия быстрых нажатий и её плашка «Отменить» заканчиваются. */
function openSheet(habitId: number): void {
  endBurst();
  openCountSheet(habitId);
}
