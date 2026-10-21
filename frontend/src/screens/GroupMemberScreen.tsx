/**
 * Страница участника групповой привычки: та же сводка, что на экране привычки
 * (HabitSummary — сетка за последние 364 дня, «Основное», календарь), но только по его
 * отметкам — как обычная привычка, в его днях (его пояс). В карточке — название и
 * описание привычки (как у меня: у него название может быть с номером), его имя («Вы» —
 * я) — заголовком в шапке; кнопка отметки только показывает, как у него дела сегодня.
 *
 * Открывается нажатием на участника в «Участниках» (любой участник — любого, себя тоже) и
 * только когда его данные уже есть (HabitScreen их дожидается): они загружаются заранее и
 * обновляются сами (data/groups.ts, preloadMemberHabits), поэтому страница открывается
 * сразу целиком; пришли новые, пока она открыта, — видны сразу.
 *
 * Владелец на чужой странице может исключить участника (системный диалог); после
 * исключения App возвращает к экрану привычки. Других настроек нет.
 */

import { useMemo, useRef, useSyncExternalStore } from "react";

import { DestructiveButton } from "../components/DestructiveButton";
import { GridViewContext, useGridView } from "../components/gridLayout";
import { HabitSummary } from "../components/HabitSummary";
import { Screen } from "../components/Screen";
import {
  knownMemberHabit,
  removeFromShared,
  reportGroupError,
  subscribeMemberHabits,
} from "../data/groups";
import { useStrings } from "../preferences";
import { confirmAction, hapticNotification } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { GroupMember, Habit, HabitGroup } from "../types/habit";
import styles from "./HabitScreen.module.css";

interface GroupMemberScreenProps {
  /** Групповая привычка (моя): название, описание, цвет. */
  habit: Habit;
  group: HabitGroup;
  member: GroupMember;
  /** Участника исключили — вернуться к экрану привычки. */
  onRemoved: () => void;
  /** Войти через Telegram (веб-приложение): групповые привычки — только с ним. */
  onLinkTelegram: () => void;
}

export function GroupMemberScreen({
  habit,
  group,
  member,
  onRemoved,
  onLinkTelegram,
}: GroupMemberScreenProps) {
  const strings = useStrings();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const gridView = useGridView();
  const loaded = useSyncExternalStore(subscribeMemberHabits, () =>
    knownMemberHabit(group.id, member.user_id),
  );
  const busy = useRef(false);
  // Сетка и календарь — в днях участника.
  const memberDay = loaded?.day ?? gridView.day;
  const memberView = useMemo(
    () => ({ layout: gridView.layout, day: memberDay }),
    [gridView.layout, memberDay],
  );
  const shown = useMemo(
    () =>
      loaded
        ? {
            ...loaded.habit,
            name: habit.name,
            description: habit.description ?? null,
            color: habit.color,
          }
        : null,
    [loaded, habit.name, habit.description, habit.color],
  );

  async function askToRemove(): Promise<void> {
    const confirmed = await confirmAction({
      title: strings.kickDialogTitle(member.name),
      message: strings.kickDialogMessage,
      confirmLabel: strings.kickDialogConfirm,
      cancelLabel: strings.groupDialogCancel,
      destructive: true,
    });
    if (!confirmed || busy.current) {
      return;
    }
    busy.current = true;
    try {
      await removeFromShared(group.id, member.user_id);
      hapticNotification("success");
      onRemoved();
    } catch (error) {
      hapticNotification("error");
      await reportGroupError(error, strings, onLinkTelegram);
    } finally {
      busy.current = false;
    }
  }

  return (
    <Screen
      title={member.is_me ? strings.groupMe : member.name}
      titleAnchorRef={headingRef}
      withTabBar={false}
    >
      <div className={styles.enter} style={habitColorStyle(habit.color)}>
        {/* Без данных страница не открывается (HabitScreen их дожидается). */}
        {shown ? (
          <GridViewContext.Provider value={memberView}>
            <HabitSummary
              habit={shown}
              headings={{
                history: strings.habitHistoryHeading,
                main: strings.habitMainHeading,
                calendar: strings.calendarHeading,
              }}
              interactive={false}
              headingRef={headingRef}
            >
              {group.is_owner && !member.is_me ? (
                <DestructiveButton label={strings.kickMember} onPress={() => void askToRemove()} />
              ) : null}
            </HabitSummary>
          </GridViewContext.Provider>
        ) : null}
      </div>
    </Screen>
  );
}
