/** Экран «Привычки»: две секции (на сегодня — интерактивные, остальные — просмотр). */

import { HabitsSection } from "../components/HabitsSection";
import { Screen } from "../components/Screen";
import { Skeleton } from "../components/Skeleton";
import { StatusMessage } from "../components/StatusMessage";
import type { HabitsStatus } from "../hooks/useHabits";
import { STRINGS } from "../strings";
import type { Habit } from "../types/habit";

interface HabitsScreenProps {
  habits: Habit[];
  status: HabitsStatus;
  errorMessage: string | null;
  onToggle: (taskId: number) => void;
  /** Открыть экран привычки. */
  onOpen: (taskId: number) => void;
  onReload: () => void;
}

export function HabitsScreen({
  habits,
  status,
  errorMessage,
  onToggle,
  onOpen,
  onReload,
}: HabitsScreenProps) {
  return <Screen title={STRINGS.screenTitle}>{renderContent()}</Screen>;

  function renderContent() {
    if (status === "loading") {
      return <Skeleton />;
    }
    if (status === "error") {
      return (
        <StatusMessage
          emoji={STRINGS.errorEmoji}
          title={STRINGS.errorTitle}
          description={errorMessage ?? undefined}
          actionLabel={STRINGS.errorRetry}
          onAction={onReload}
        />
      );
    }
    if (habits.length === 0) {
      return (
        <StatusMessage
          emoji={STRINGS.emptyEmoji}
          title={STRINGS.emptyTitle}
          description={STRINGS.emptyDescription}
        />
      );
    }
    const scheduledHabits = habits.filter((habit) => habit.scheduled_today);
    const otherHabits = habits.filter((habit) => !habit.scheduled_today);
    return (
      <>
        {scheduledHabits.length > 0 ? (
          <HabitsSection
            habits={scheduledHabits}
            interactive
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ) : null}
        {otherHabits.length > 0 ? (
          <HabitsSection
            habits={otherHabits}
            interactive={false}
            subheading={STRINGS.otherSubheading}
            onOpen={onOpen}
          />
        ) : null}
      </>
    );
  }
}
