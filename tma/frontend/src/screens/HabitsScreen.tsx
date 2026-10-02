/** Экран «Привычки»: две секции (на день отметки — интерактивные, остальные — просмотр).
 *  Сам список — HabitsList: тот же, что показывает админ-панель. */

import type { ReactNode } from "react";

import { HabitsList } from "../components/HabitsList";
import { Screen } from "../components/Screen";
import { Skeleton } from "../components/Skeleton";
import { StatusMessage } from "../components/StatusMessage";
import { describeError } from "../errors";
import type { HabitsStatus } from "../hooks/useHabits";
import { useStrings } from "../preferences";
import type { Habit } from "../types/habit";

interface HabitsScreenProps {
  habits: Habit[];
  status: HabitsStatus;
  error: unknown;
  /** Режим «Отмечать за вчера»: день отметки — вчера. */
  markYesterday: boolean;
  onToggle: (taskId: number) => void;
  /** Открыть экран привычки. */
  onOpen: (taskId: number) => void;
  onReload: () => void;
  /** Shown above the list when there are habits (web app: save-account banner). */
  banner?: ReactNode;
  /** Empty list of a new web guest: «Уже пользуетесь в Telegram? Войти через Telegram». */
  onTelegramLogin?: () => void;
}

export function HabitsScreen({
  habits,
  status,
  error,
  markYesterday,
  onToggle,
  onOpen,
  onReload,
  banner,
  onTelegramLogin,
}: HabitsScreenProps) {
  const strings = useStrings();
  return <Screen title={strings.screenTitle}>{renderContent()}</Screen>;

  function renderContent() {
    if (status === "loading") {
      return <Skeleton />;
    }
    if (status === "error") {
      return (
        <StatusMessage
          icon="alert"
          title={strings.errorTitle}
          description={describeError(strings, error, strings.habitsLoadFailed)}
          actionLabel={strings.errorRetry}
          onAction={onReload}
        />
      );
    }
    if (habits.length === 0) {
      return (
        <StatusMessage
          icon="check"
          title={strings.emptyTitle}
          description={onTelegramLogin ? strings.webEmptyTelegramHint : strings.emptyDescription}
          actionLabel={onTelegramLogin ? strings.webEmptyTelegramLogin : undefined}
          onAction={onTelegramLogin}
        />
      );
    }
    return (
      <>
        {banner}
        <HabitsList
          habits={habits}
          markYesterday={markYesterday}
          interactive
          onToggle={onToggle}
          onOpen={onOpen}
        />
      </>
    );
  }
}
