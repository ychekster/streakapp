/**
 * Список привычек: две секции — запланированные на день отметки и остальные (с
 * приглушённым подзаголовком). Один и тот же список показывают экран «Привычки»
 * приложения (HabitsScreen) и экран привычек пользователя в админ-панели
 * (AdminUserHabitsScreen), поэтому разбиение и порядок секций живут здесь.
 *
 * `interactive` — можно ли отмечать выполнение в первой секции: у себя можно, в
 * админ-панели привычки только показываются. Вторая секция не интерактивна всегда:
 * на этот день привычка не запланирована.
 */

import { useStrings } from "../preferences";
import type { Habit } from "../types/habit";
import { HabitsSection } from "./HabitsSection";

interface HabitsListProps {
  habits: Habit[];
  /** Режим «Отмечать за вчера» владельца привычек: день отметки — вчера. */
  markYesterday: boolean;
  /** Можно ли отмечать привычки, запланированные на день отметки. */
  interactive: boolean;
  onToggle?: (taskId: number) => void;
  /** Открыть экран привычки по нажатию на её блок; без него блоки не нажимаются. */
  onOpen?: (taskId: number) => void;
}

export function HabitsList({
  habits,
  markYesterday,
  interactive,
  onToggle,
  onOpen,
}: HabitsListProps) {
  const strings = useStrings();
  const scheduledHabits = habits.filter((habit) => habit.scheduled_today);
  const otherHabits = habits.filter((habit) => !habit.scheduled_today);
  return (
    <>
      {scheduledHabits.length > 0 ? (
        <HabitsSection
          habits={scheduledHabits}
          interactive={interactive}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ) : null}
      {otherHabits.length > 0 ? (
        <HabitsSection
          habits={otherHabits}
          interactive={false}
          subheading={
            markYesterday ? strings.otherSubheadingYesterday : strings.otherSubheadingToday
          }
          onOpen={onOpen}
        />
      ) : null}
    </>
  );
}
