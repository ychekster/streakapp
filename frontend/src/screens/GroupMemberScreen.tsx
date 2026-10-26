/**
 * Страница участника групповой привычки: та же сводка, что на экране привычки
 * (HabitSummary — сетка за последние 364 дня, «Основное», календарь), но только по его
 * отметкам — как обычная привычка, в его днях (его пояс). В карточке — название и
 * описание привычки (как у меня: у него название может быть с номером), его имя («Вы» —
 * я) — заголовком в шапке. На чужой странице кнопка отметки только показывает, как у
 * него дела сегодня; на своей — отмечает мою привычку, как на экране привычки: сегодняшний
 * день виден сразу (с устройства), остальное — из ответа сервера, когда отметка до него
 * дойдёт.
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
import { periodGoal } from "../data/derive";
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
  /** Отметить мою привычку (моя страница). */
  onToggle: (taskId: number) => void;
  /** Участника исключили — вернуться к экрану привычки. */
  onRemoved: () => void;
  /** Войти через Telegram (веб-приложение): групповые привычки — только с ним. */
  onLinkTelegram: () => void;
}

export function GroupMemberScreen({
  habit,
  group,
  member,
  onToggle,
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
  const mine = member.is_me;
  const shown = useMemo(() => {
    if (!loaded) {
      return null;
    }
    const page = {
      ...loaded.habit,
      name: habit.name,
      description: habit.description ?? null,
      color: habit.color,
    };
    return mine && loaded.day === gridView.day ? withMyToday(page, habit, loaded.day) : page;
  }, [loaded, mine, habit, gridView.day]);

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
              interactive={mine && habit.scheduled_today && habit.frozen_since === null}
              onToggle={mine ? onToggle : undefined}
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

/**
 * Моя страница со мной сегодняшним с устройства (`mine` — моя привычка из data/store, её
 * кнопка — моя часть): отметка видна сразу, серия и «Всего выполнено» — на день больше
 * или меньше, пока не ответит сервер. У «Гибкого графика» серия — в периодах: на день
 * меняется счёт периода, а серия — закончившиеся периоды (`prior_streak`) и текущий, если
 * в нём набрана цель. `day` — мой день отметки.
 */
function withMyToday(page: Habit, mine: Habit, day: string): Habit {
  const done = mine.done_today;
  const count = mine.today_count ?? 0;
  const shown = { ...page, id: mine.id };
  if (page.done_today === done && (page.today_count ?? 0) === count) {
    return shown;
  }
  const delta = Number(done) - Number(page.done_today);
  const goal = periodGoal(page, day);
  const periodDone = Math.max(0, (page.period_done ?? 0) + delta);
  const current =
    goal === null
      ? Math.max(0, page.current_streak + delta)
      : (page.prior_streak ?? 0) + Number(periodDone >= goal);
  const best =
    goal === null ? Math.max(page.best_streak, current) : Math.max(page.prior_best ?? 0, current);
  const last = page.history.length - 1;
  const counts = page.history_counts ?? [];
  return {
    ...shown,
    done_today: done,
    today_count: count,
    history: page.history.map((value, index) => (index === last ? done : value)),
    history_counts: counts.map((value, index) => (index === counts.length - 1 ? count : value)),
    total_done: Math.max(0, page.total_done + delta),
    period_done: goal === null ? page.period_done : periodDone,
    current_streak: current,
    best_streak: best,
  };
}
