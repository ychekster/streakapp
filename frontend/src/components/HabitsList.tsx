/**
 * Список привычек: три секции — запланированные на день отметки, остальные (с
 * приглушённым подзаголовком) и замороженные (тоже с подзаголовком). Один и тот же список показывают экран «Привычки»
 * приложения (HabitsScreen) и экран привычек пользователя в админ-панели
 * (AdminUserHabitsScreen), поэтому разбиение и порядок секций живут здесь.
 *
 * `interactive` — можно ли отмечать выполнение: у себя можно, в админ-панели привычки
 * только показываются. Во второй секции (не запланированы на этот день) отметка
 * бонусная — кнопка бледная; третья (заморожены) не интерактивна всегда.
 *
 * «Названия папок» (`folderGroups`, во «Все привычки»): запланированные стоят блоками, как
 * задачи во «Все задачи»: сначала привычки без папки (без заголовка), дальше папки по
 * порядку, каждая со своим названием. Привычка в двух папках стоит в обоих блоках.
 * Остальные и замороженные — своими секциями ниже, как всегда.
 */

import { useStrings } from "../preferences";
import type { Habit } from "../types/habit";
import { HabitsSection } from "./HabitsSection";

/** Блок «Названий папок»: папка, её название и привычки. */
export interface HabitFolderGroup {
  id: number;
  name: string;
  habits: readonly number[];
}

interface HabitsListProps {
  habits: Habit[];
  /** Режим «Отмечать за вчера» владельца привычек: день отметки — вчера. */
  markYesterday: boolean;
  /** Можно ли отмечать привычки (кроме замороженных). */
  interactive: boolean;
  onToggle?: (taskId: number) => void;
  /** Открыть экран привычки по нажатию на её блок; без него блоки не нажимаются. */
  onOpen?: (taskId: number) => void;
  /** «Названия папок»: запланированные блоками по папкам; null — одним блоком. */
  folderGroups?: readonly HabitFolderGroup[] | null;
}

export function HabitsList({
  habits,
  markYesterday,
  interactive,
  onToggle,
  onOpen,
  folderGroups = null,
}: HabitsListProps) {
  const strings = useStrings();
  const activeHabits = habits.filter((habit) => habit.frozen_since === null);
  const scheduledHabits = activeHabits.filter((habit) => habit.scheduled_today);
  const otherHabits = activeHabits.filter((habit) => !habit.scheduled_today);
  const frozenHabits = habits.filter((habit) => habit.frozen_since !== null);
  return (
    <>
      {folderGroups ? (
        byFolder(scheduledHabits, folderGroups).map((group) => (
          <HabitsSection
            key={group.key}
            habits={group.habits}
            interactive={interactive}
            onToggle={onToggle}
            subheading={group.title}
            onOpen={onOpen}
          />
        ))
      ) : scheduledHabits.length > 0 ? (
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
          interactive={interactive}
          onToggle={onToggle}
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

/** Привычки блоками: без папки (без заголовка), потом папки по порядку; пустые блоки не
 *  показываются. */
function byFolder(
  habits: Habit[],
  groups: readonly HabitFolderGroup[],
): { key: string; title?: string; habits: Habit[] }[] {
  const inSome = new Set(groups.flatMap((group) => group.habits));
  const blocks = [
    { key: "none", habits: habits.filter((habit) => !inSome.has(habit.id)) },
    ...groups.map((group) => ({
      key: `folder-${group.id}`,
      title: group.name,
      habits: habits.filter((habit) => group.habits.includes(habit.id)),
    })),
  ];
  return blocks.filter((block) => block.habits.length > 0);
}
