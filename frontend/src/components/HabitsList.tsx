/**
 * Список привычек: три секции — запланированные на день отметки, остальные (с
 * приглушённым подзаголовком) и замороженные (тоже с подзаголовком). Один и тот же список показывают экран «Привычки»
 * приложения (HabitsScreen) и экран привычек пользователя в админ-панели
 * (AdminUserHabitsScreen), поэтому разбиение и порядок секций живут здесь.
 *
 * `interactive` — можно ли отмечать выполнение в первой секции: у себя можно, в
 * админ-панели привычки только показываются. Вторая и третья секции не интерактивны
 * всегда: на этот день привычка не запланирована или заморожена.
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
  const activeHabits = habits.filter((habit) => habit.frozen_since === null);
  const scheduledHabits = activeHabits.filter((habit) => habit.scheduled_today);
  const otherHabits = activeHabits.filter((habit) => !habit.scheduled_today);
  const frozenHabits = habits.filter((habit) => habit.frozen_since !== null);
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
      {frozenHabits.length > 0 ? (
        <HabitsSection
          habits={frozenHabits}
          interactive={false}
          subheading={strings.frozenSubheading}
          onOpen={onOpen}
        />
      ) : null}
    </>
  );
}
