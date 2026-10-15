/** Экран «Привычки»: две секции (на день отметки — интерактивные, остальные — просмотр).
 *  Сам список — HabitsList: тот же, что показывает админ-панель. Если у пользователя есть
 *  папки, над списком — таблетка папок (FolderBar), и список показывает привычки
 *  выбранной (App отдаёт уже отобранные). */

import { FolderBar, type FolderTab } from "../components/FolderBar";
import { HabitsList } from "../components/HabitsList";
import { Screen } from "../components/Screen";
import { Skeleton } from "../components/Skeleton";
import { StatusMessage } from "../components/StatusMessage";
import { describeError } from "../errors";
import type { HabitsStatus } from "../hooks/useHabits";
import { useStrings } from "../preferences";
import type { Habit } from "../types/habit";

/** Таблетка папок: вкладки, выбранная и выбор другой. */
export interface FolderBarState {
  tabs: FolderTab[];
  active: string;
  onSelect: (key: string) => void;
  /** Выбрана папка (не «Все привычки»): пустой список — «Папка пуста». */
  inFolder: boolean;
}

interface HabitsScreenProps {
  habits: Habit[];
  /** Нет папок — null. */
  folders: FolderBarState | null;
  status: HabitsStatus;
  error: unknown;
  /** Режим «Отмечать за вчера»: день отметки — вчера. */
  markYesterday: boolean;
  onToggle: (taskId: number) => void;
  /** Открыть экран привычки. */
  onOpen: (taskId: number) => void;
  onReload: () => void;
}

export function HabitsScreen({
  habits,
  folders,
  status,
  error,
  markYesterday,
  onToggle,
  onOpen,
  onReload,
}: HabitsScreenProps) {
  const strings = useStrings();
  return (
    <Screen title={strings.screenTitle}>
      {folders && status === "ready" ? (
        <FolderBar tabs={folders.tabs} active={folders.active} onSelect={folders.onSelect} />
      ) : null}
      {renderContent()}
    </Screen>
  );

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
    if (habits.length === 0 && folders?.inFolder) {
      return (
        <StatusMessage
          icon="folder"
          title={strings.folderEmptyTitle}
          description={strings.folderEmptyDescription}
        />
      );
    }
    if (habits.length === 0) {
      return (
        <StatusMessage
          icon="check"
          title={strings.emptyTitle}
          description={strings.emptyDescription}
        />
      );
    }
    return (
      <HabitsList
        habits={habits}
        markYesterday={markYesterday}
        interactive
        onToggle={onToggle}
        onOpen={onOpen}
      />
    );
  }
}
