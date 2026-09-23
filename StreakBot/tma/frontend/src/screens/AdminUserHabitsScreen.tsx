/**
 * Привычки одного пользователя — экран поверх профиля в админ-панели (во весь экран,
 * без нижней навигации, «Закрыть» Telegram заменена на «Назад»).
 *
 * Это тот же список, что пользователь видит у себя на экране «Привычки» (HabitsList):
 * те же две секции, те же сетки выполнения и тот же порядок. День отметки считает
 * сервер — в поясе пользователя и с его режимом «Отмечать за вчера», поэтому и
 * подзаголовок второй секции («не запланированы на сегодня» или «на вчера») — его.
 *
 * Панель привычки только показывает: отмечать выполнение нельзя (кнопки отметки
 * приглушены, как у незапланированных привычек в приложении), и блоки не открываются —
 * чужие данные здесь не меняются. Список загружается при каждом открытии экрана.
 */

import { fetchUserHabits } from "../api/admin";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { HabitsList } from "../components/HabitsList";
import { Screen } from "../components/Screen";
import { StatusMessage } from "../components/StatusMessage";
import { useResource } from "../hooks/useResource";

interface AdminUserHabitsScreenProps {
  telegramId: number;
}

export function AdminUserHabitsScreen({ telegramId }: AdminUserHabitsScreenProps) {
  const strings = useAdminStrings();
  const habits = useResource(() => fetchUserHabits(telegramId), String(telegramId));

  return (
    <Screen title={strings.habitsTitle} withTabBar={false} enterAnimation>
      {renderContent()}
    </Screen>
  );

  function renderContent() {
    const data = habits.data;
    if (!data) {
      return habits.status === "error" ? (
        <StatusMessage
          icon="alert"
          title={strings.errorTitle}
          description={describeAdminError(strings, habits.error, strings.habitsLoadFailed)}
          actionLabel={strings.retry}
          onAction={habits.reload}
        />
      ) : (
        <StatusMessage icon="spinner" title={strings.loading} />
      );
    }
    if (data.habits.length === 0) {
      return (
        <StatusMessage
          icon="check"
          title={strings.habitsEmpty}
          description={strings.habitsEmptyDescription}
        />
      );
    }
    return (
      <HabitsList
        habits={data.habits}
        markYesterday={data.mark_yesterday}
        interactive={false}
      />
    );
  }
}
