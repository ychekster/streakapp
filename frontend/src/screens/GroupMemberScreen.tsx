/**
 * Страница участника групповой привычки: та же сводка, что на экране привычки
 * (HabitSummary — сетка за последние 364 дня, «Основное», календарь), но только по его
 * отметкам — как обычная привычка, в его днях (его пояс). В карточке вместо названия — его
 * имя («Вы» — я), кнопка отметки только показывает, как у него дела сегодня.
 *
 * Открывается нажатием на участника в «Участниках» (любой участник — любого, себя тоже).
 * Данные — с сервера (data/groups.ts, загружены заранее, при открытии экрана привычки, и
 * ещё раз при открытии страницы); пока их нет — пустая сетка и прочерки, нет связи — ошибка
 * с «Повторить».
 *
 * Владелец на чужой странице может исключить участника (системный диалог); после
 * исключения App возвращает к экрану привычки. Других настроек нет.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { MemberHabit } from "../api/groups";
import { DestructiveButton } from "../components/DestructiveButton";
import { GridViewContext, useGridView } from "../components/gridLayout";
import { HabitSummary } from "../components/HabitSummary";
import { Screen } from "../components/Screen";
import { StatusMessage } from "../components/StatusMessage";
import {
  knownMemberHabit,
  loadMemberHabit,
  removeFromShared,
  reportGroupError,
} from "../data/groups";
import { useStrings } from "../preferences";
import { confirmAction, hapticNotification } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { GroupMember, Habit, HabitGroup } from "../types/habit";
import styles from "./HabitScreen.module.css";

interface GroupMemberScreenProps {
  /** Групповая привычка (моя): цвет, расписание — пока нет данных участника. */
  habit: Habit;
  group: HabitGroup;
  member: GroupMember;
  /** Участника исключили — вернуться к экрану привычки. */
  onRemoved: () => void;
  /** Войти через Telegram (веб-приложение): групповые привычки — только с ним. */
  onLinkTelegram: () => void;
}

/** Пока данных нет: та же привычка без отметок, сегодня — как в «Участниках». */
function emptyHabit(habit: Habit, member: GroupMember): Habit {
  const none = habit.history.map(() => false);
  return {
    ...habit,
    history: none,
    frozen_history: none,
    history_counts: [],
    current_streak: 0,
    best_streak: 0,
    total_done: 0,
    done_today: member.done,
    today_count: member.count,
    frozen_since: null,
    next_day_done: false,
    next_day_count: 0,
    started_on: null,
    group: null,
  };
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
  const [loaded, setLoaded] = useState<MemberHabit | null>(() =>
    knownMemberHabit(group.id, member.user_id),
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    let current = true;
    loadMemberHabit(group.id, member.user_id, member.is_me).then(
      (fresh) => {
        if (current) {
          setLoaded(fresh);
          setFailed(false);
        }
      },
      () => {
        if (current) {
          setFailed(true);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [group.id, member.user_id, member.is_me, attempt]);

  const name = member.is_me ? strings.groupMe : member.name;
  const shown: Habit = {
    ...(loaded ? loaded.habit : emptyHabit(habit, member)),
    name,
    description: null,
  };
  // Сетка и календарь — в днях участника.
  const memberDay = loaded?.day ?? gridView.day;
  const memberView = useMemo(
    () => ({ layout: gridView.layout, day: memberDay }),
    [gridView.layout, memberDay],
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
    <Screen title={name} titleAnchorRef={headingRef} withTabBar={false}>
      <div className={styles.enter} style={habitColorStyle(habit.color)}>
        {failed && !loaded ? (
          <StatusMessage
            icon="alert"
            title={strings.errorTitle}
            description={strings.memberLoadFailed}
            actionLabel={strings.errorRetry}
            onAction={() => setAttempt((value) => value + 1)}
          />
        ) : (
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
              pending={!loaded}
            >
              {group.is_owner && !member.is_me ? (
                <DestructiveButton label={strings.kickMember} onPress={() => void askToRemove()} />
              ) : null}
            </HabitSummary>
          </GridViewContext.Provider>
        )}
      </div>
    </Screen>
  );
}
