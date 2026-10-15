/** Экран «Привычки»: две секции (на день отметки — интерактивные, остальные — просмотр).
 *  Сам список — HabitsList: тот же, что показывает админ-панель. Если у пользователя есть
 *  папки, над списком — таблетка папок (FolderBar), и список показывает привычки
 *  выбранной (App отдаёт уже отобранные). С настройкой «Переключение свайпом» свайп по
 *  экрану справа налево — следующая папка (вкладка правее), слева направо — предыдущая; на
 *  крайней вкладке дальше не идёт. */

import { useCallback, useRef } from "react";

import { FolderBar, type FolderTab } from "../components/FolderBar";
import { HabitsList } from "../components/HabitsList";
import { Screen } from "../components/Screen";
import { Skeleton } from "../components/Skeleton";
import { StatusMessage } from "../components/StatusMessage";
import { describeError } from "../errors";
import type { HabitsStatus } from "../hooks/useHabits";
import { useHorizontalSwipe, type SwipeDirection } from "../hooks/useHorizontalSwipe";
import { useStrings } from "../preferences";
import type { FolderKind } from "../types/folder";
import type { Habit } from "../types/habit";

/** Таблетка папок: вкладки, выбранная и выбор другой. */
export interface FolderBarState {
  tabs: FolderTab[];
  active: string;
  onSelect: (key: string) => void;
  /** Выбрана папка (не «Все привычки»): пустой список — «Папка пуста». */
  inFolder: boolean;
  /** Выбрана рекомендуемая папка: у пустой — свои слова («Всё выполнено»). */
  kind: FolderKind | null;
  /** «Переключение свайпом» включено. */
  swipe: boolean;
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
  // Обработчик свайпа стабилен (иначе переподписка на каждом рендере), а таблетку берёт
  // свежую из ref.
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const switchFolder = useCallback((direction: SwipeDirection) => {
    const bar = foldersRef.current;
    if (!bar) {
      return;
    }
    const index = bar.tabs.findIndex((tab) => tab.key === bar.active);
    const next = bar.tabs[index + (direction === "left" ? 1 : -1)];
    if (index !== -1 && next) {
      bar.onSelect(next.key);
    }
  }, []);
  useHorizontalSwipe(folders?.swipe && status === "ready" ? switchFolder : null);

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
    if (habits.length === 0 && folders?.kind) {
      return (
        <StatusMessage
          icon="check"
          title={strings.folderKindEmptyTitle[folders.kind]}
          description={strings.folderKindEmptyDescription[folders.kind]}
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
