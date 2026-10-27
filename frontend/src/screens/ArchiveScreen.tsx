/**
 * Настройки → «Архив»: привычки, убранные в архив в их настройках (HabitScreen). Список —
 * тот же, что на экране «Привычки» (HabitsList: на день отметки, остальные, замороженные):
 * архивные отмечаются и открываются как обычные, их просто нет в списке привычек и в
 * папках (папок здесь нет). Заголовок — сразу по центру шапки (Screen `pinnedTitle`), как
 * у «Папок». Пусто — значок и пояснение, как пустой список привычек.
 */

import { HabitsList } from "../components/HabitsList";
import { Screen } from "../components/Screen";
import { StatusMessage } from "../components/StatusMessage";
import { useStrings } from "../preferences";
import type { Habit } from "../types/habit";
import formStyles from "./HabitFormScreen.module.css";

interface ArchiveScreenProps {
  /** Архивные привычки. */
  habits: Habit[];
  /** Режим «Отмечать за вчера»: день отметки — вчера. */
  markYesterday: boolean;
  onToggle: (taskId: number) => void;
  /** Открыть экран привычки. */
  onOpen: (taskId: number) => void;
}

export function ArchiveScreen({ habits, markYesterday, onToggle, onOpen }: ArchiveScreenProps) {
  const strings = useStrings();
  return (
    <Screen title={strings.archiveTitle} withTabBar={false} enterAnimation pinnedTitle>
      {habits.length === 0 ? (
        <StatusMessage
          icon="archive"
          title={strings.archiveEmptyTitle}
          description={strings.archiveEmptyDescription}
        />
      ) : (
        <div className={formStyles.pinned}>
          <HabitsList
            habits={habits}
            markYesterday={markYesterday}
            interactive
            onToggle={onToggle}
            onOpen={onOpen}
          />
        </div>
      )}
    </Screen>
  );
}
