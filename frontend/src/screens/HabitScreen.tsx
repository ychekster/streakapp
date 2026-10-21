/**
 * Экран привычки: карточка с сеткой выполнения за последние 364 дня, основные
 * показатели (текущая и лучшая серии, всего выполнено — «18/25»: из скольких дней с первого
 * дня привычки, цель серии), календарь по месяцам (HabitCalendar) и настройки
 * привычки (редактировать, заморозить / разморозить, удалить). Весь экран окрашен в цвет
 * привычки.
 *
 * Открывается нажатием на привычку в списке. Пока экран открыт, кнопка «Закрыть»
 * Telegram заменена на «Назад», а нижняя навигация скрыта (см. App). Привычка берётся
 * из общего состояния, поэтому отметка и изменения здесь сразу видны и в списке.
 *
 * «Редактировать привычку» открывает форму привычки (см. HabitFormScreen). «Заморозить
 * привычку» сначала объясняет системным диалогом, что будет с привычкой, и после
 * согласия замораживает её и возвращает к списку (как удаление); «Разморозить привычку»
 * размораживает сразу, без диалога, и экран остаётся открытым. «Удалить
 * привычку» спрашивает подтверждение системным диалогом Telegram (на iPhone — обычный
 * алерт iOS); после удаления App возвращает к списку, а при ошибке она появляется под
 * карточкой.
 *
 * Совместная привычка (data/groups.ts): первым блоком, над историей, — «Участники» (кто
 * как выполнил свою часть; владелец нажатием исключает) с рядом «Добавить участника» —
 * отправить ссылку-приглашение (она загружается заранее, при открытии экрана, чтобы окно
 * «Поделиться» открывалось сразу). В той же карточке настроек — «Отметки участников» и «Сбросить ссылку»
 * (владелец); вместо «Удалить» — «Выйти из привычки» (привычка пропадает, по ссылке
 * вернётся). Обычную привычку совместной не сделать. Автоотметки в совместной привычке нет.
 * «Редактировать» у участника открывает ту же форму, где менять можно только напоминания.
 * Эти действия идут на сервер сразу; ошибка — системным диалогом, гостю веб-приложения
 * предлагается войти через Telegram.
 */

import { useEffect, useRef, useState } from "react";

import { Disclosure } from "../components/Disclosure";
import { GroupMembers } from "../components/GroupMembers";
import { useGridView } from "../components/gridLayout";
import { HabitBlock } from "../components/HabitBlock";
import { HabitCalendar } from "../components/HabitCalendar";
import { trackedDays } from "../components/calendarDays";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import {
  AutoCheckIcon,
  BellIcon,
  LinkIcon,
  PencilIcon,
  SnowflakeIcon,
} from "../components/SettingsIcons";
import { StatCard } from "../components/StatCard";
import { Switch } from "../components/Switch";
import { DestructiveButton } from "../components/DestructiveButton";
import {
  CompletedIcon,
  FlameIcon,
  TargetIcon,
  TrophyIcon,
} from "../components/StatIcons";
import { HISTORY_COLUMNS, HISTORY_DAYS } from "../constants";
import { isShared } from "../data/derive";
import {
  inviteToShared,
  leaveShared,
  notifyShared,
  prefetchInvite,
  removeFromShared,
  reportGroupError,
  resetSharedLink,
} from "../data/groups";
import { describeError } from "../errors";
import { useStrings } from "../preferences";
import type { Strings } from "../strings";
import { confirmAction, hapticNotification } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { GroupMember, Habit } from "../types/habit";
import { weekdayLabel } from "../weekdayLabel";
import styles from "./HabitScreen.module.css";

/** Подпись цели серии: «Ежедневно», «Через день», «Каждый месяц», «Будние дни»,
 *  «Выходные» или дни («Пн, Ср и Пт») — как «Повтор» в форме привычки. */
function formatStreakGoal(habit: Habit, strings: Strings): string {
  if (habit.frequency_type === "every_other_day") {
    return strings.goalEveryOtherDay;
  }
  if (habit.frequency_type === "monthly") {
    return strings.goalMonthly;
  }
  if (habit.frequency_type === "daily") {
    return strings.goalDaily;
  }
  return weekdayLabel(habit.days, strings, strings.goalDaily);
}

interface HabitScreenProps {
  habit: Habit;
  onToggle: (taskId: number) => void;
  /** Въехать при открытии. Нет — при возврате из формы редактирования: «назад» не должно
   *  выглядеть как переход вперёд. */
  animateEnter: boolean;
  /** Открыть форму редактирования привычки. */
  onEdit: (habit: Habit) => void;
  /** Заморозить (`frozen: true`, App возвращает к списку) или разморозить привычку. */
  onFreeze: (taskId: number, frozen: boolean) => void;
  /** Включить или выключить «Автоотметка». */
  onAutoMark: (taskId: number, on: boolean) => void;
  /** Удалить привычку и вернуться к списку; при ошибке промис отклоняется. */
  onDelete: (taskId: number) => Promise<void>;
  /** Войти через Telegram (веб-приложение): совместные привычки — только с ним. */
  onLinkTelegram: () => void;
}

export function HabitScreen({
  habit,
  onToggle,
  animateEnter,
  onEdit,
  onFreeze,
  onAutoMark,
  onDelete,
  onLinkTelegram,
}: HabitScreenProps) {
  const strings = useStrings();
  // Первый подзаголовок: когда он уходит под кнопки Telegram, в шапке появляется название.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Действие с совместной привычкой идёт на сервер — повторное нажатие ничего не делает
  // (ряды при этом не бледнеют).
  const groupBusy = useRef(false);
  const shared = isShared(habit);
  const group = habit.group ?? null;
  // «Отметки участников» переключаются сразу; ответ сервера их подтверждает.
  const [notify, setNotify] = useState(group?.notify_marks ?? false);
  useEffect(() => setNotify(group?.notify_marks ?? false), [group?.notify_marks]);
  // Ссылка-приглашение — заранее: «Добавить участника» открывает окно сразу.
  const groupId = group?.id;
  useEffect(() => {
    if (groupId !== undefined) {
      prefetchInvite(groupId);
    }
  }, [groupId]);

  const frozen = habit.frozen_since !== null;
  // День отметки — последний день истории; неизвестен (ещё нет настроек) — без календаря
  // и без «из скольких дней».
  const markDay = useGridView().day;
  const days = markDay ? trackedDays(habit, markDay) : 0;

  async function toggleFreeze(): Promise<void> {
    if (frozen) {
      onFreeze(habit.id, false);
      return;
    }
    const confirmed = await confirmAction({
      title: strings.freezeDialogTitle,
      message: strings.freezeDialogMessage,
      confirmLabel: strings.freezeDialogConfirm,
      cancelLabel: strings.freezeDialogCancel,
    });
    if (confirmed) {
      onFreeze(habit.id, true);
    }
  }

  async function askToDelete(): Promise<void> {
    setDeleteError(null);
    const confirmed = await confirmAction({
      title: strings.deleteDialogTitle,
      message: strings.deleteDialogMessage,
      confirmLabel: strings.deleteDialogConfirm,
      cancelLabel: strings.deleteDialogCancel,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setDeleting(true);
    try {
      // При успехе App закрывает этот экран — сбрасывать состояние не нужно.
      await onDelete(habit.id);
    } catch (error) {
      setDeleteError(describeError(strings, error, strings.deleteFailed));
      setDeleting(false);
      hapticNotification("error");
    }
  }

  /** Действие с совместной привычкой: ошибка — диалогом; без входа через Telegram —
   *  предложение войти. */
  async function groupAction(action: () => Promise<void>, success = true): Promise<void> {
    if (groupBusy.current) {
      return;
    }
    groupBusy.current = true;
    try {
      await action();
      if (success) {
        hapticNotification("success");
      }
    } catch (error) {
      hapticNotification("error");
      await reportGroupError(error, strings, onLinkTelegram);
    } finally {
      groupBusy.current = false;
    }
  }

  function invite(): void {
    void groupAction(() => inviteToShared(habit.id, habit.name, strings), false);
  }

  async function askToResetLink(): Promise<void> {
    if (!group) {
      return;
    }
    const confirmed = await confirmAction({
      title: strings.resetInviteDialogTitle,
      message: strings.resetInviteDialogMessage,
      confirmLabel: strings.resetInviteDialogConfirm,
      cancelLabel: strings.groupDialogCancel,
      destructive: true,
    });
    if (confirmed) {
      void groupAction(() => resetSharedLink(group.id));
    }
  }

  async function askToLeave(): Promise<void> {
    if (!group) {
      return;
    }
    const confirmed = await confirmAction({
      title: strings.leaveGroupDialogTitle,
      message: strings.leaveGroupDialogMessage,
      confirmLabel: strings.leaveGroupDialogConfirm,
      cancelLabel: strings.groupDialogCancel,
      destructive: true,
    });
    if (confirmed) {
      void groupAction(() => leaveShared(group.id));
    }
  }

  async function askToRemove(member: GroupMember): Promise<void> {
    if (!group) {
      return;
    }
    const confirmed = await confirmAction({
      title: strings.kickDialogTitle(member.name),
      message: strings.kickDialogMessage,
      confirmLabel: strings.kickDialogConfirm,
      cancelLabel: strings.groupDialogCancel,
      destructive: true,
    });
    if (confirmed) {
      void groupAction(() => removeFromShared(group.id, member.user_id));
    }
  }

  function switchNotify(on: boolean): void {
    if (!group) {
      return;
    }
    setNotify(on);
    void groupAction(async () => {
      try {
        await notifyShared(group.id, on);
      } catch (error) {
        setNotify(!on);
        throw error;
      }
    }, false);
  }

  return (
    <Screen title={habit.name} titleAnchorRef={headingRef} withTabBar={false}>
      <div className={animateEnter ? styles.enter : undefined} style={habitColorStyle(habit.color)}>
        {shared && group ? (
          <GroupMembers
            group={group}
            total={habit.times_per_day}
            mineDone={habit.done_today}
            mineCount={habit.today_count}
            onPressMember={(member) => void askToRemove(member)}
            onAddMember={invite}
            headingRef={headingRef}
          />
        ) : null}

        <Section
          title={strings.habitHistoryHeading}
          headingRef={shared && group ? undefined : headingRef}
        >
          <Card padded>
            <HabitBlock
              habit={habit}
              interactive={habit.scheduled_today && !frozen}
              gridDays={HISTORY_DAYS}
              gridColumns={HISTORY_COLUMNS}
              onToggle={onToggle}
            />
          </Card>
        </Section>

        <Section title={strings.habitMainHeading}>
          <div className={styles.stats}>
            <StatCard
              icon={<FlameIcon />}
              value={habit.current_streak}
              label={strings.statCurrentStreak}
            />
            <StatCard
              icon={<TrophyIcon />}
              value={habit.best_streak}
              label={strings.statBestStreak}
            />
            <StatCard
              icon={<CompletedIcon />}
              value={days > 0 ? `${habit.total_done} / ${days}` : habit.total_done}
              label={strings.statTotalDone}
            />
            <StatCard
              icon={<TargetIcon />}
              value={formatStreakGoal(habit, strings)}
              label={strings.statStreakGoal}
            />
          </div>
        </Section>

        {markDay ? (
          <Section title={strings.calendarHeading}>
            <Card padded>
              <HabitCalendar habit={habit} day={markDay} />
            </Card>
          </Section>
        ) : null}

        <Section title={strings.habitSettingsHeading}>
          <Card>
            <ListItem
              icon={<PencilIcon />}
              // Свой постоянный цвет, а не цвет привычки (как у остальных рядов).
              iconColor="orange"
              label={strings.editHabit}
              onPress={() => onEdit(habit)}
            >
              <Disclosure />
            </ListItem>
            {/* Только у привычек «раз в день»: у «несколько раз в день» автоотметки нет;
                в совместной — тоже. */}
            {habit.times_per_day === 1 && !shared ? (
              <ListItem icon={<AutoCheckIcon />} iconColor="green" label={strings.autoMarkHabit}>
                <span className={styles.autoMarkSwitch}>
                  <Switch
                    checked={habit.auto_mark}
                    onChange={(on) => onAutoMark(habit.id, on)}
                    label={strings.autoMarkHabit}
                  />
                </span>
              </ListItem>
            ) : null}
            <ListItem
              icon={<SnowflakeIcon />}
              iconColor="lightblue"
              label={frozen ? strings.unfreezeHabit : strings.freezeHabit}
              onPress={() => void toggleFreeze()}
            >
              <Disclosure />
            </ListItem>
            {/* Совместная привычка — в той же карточке. */}
            {shared && group ? (
              <ListItem icon={<BellIcon />} iconColor="red" label={strings.groupNotify}>
                <span className={styles.autoMarkSwitch}>
                  <Switch checked={notify} onChange={switchNotify} label={strings.groupNotify} />
                </span>
              </ListItem>
            ) : null}
            {shared && group?.is_owner ? (
              <ListItem
                icon={<LinkIcon />}
                iconColor="graphite"
                label={strings.resetInvite}
                onPress={() => void askToResetLink()}
              >
                <Disclosure />
              </ListItem>
            ) : null}
          </Card>
          {/* Удаление — отдельной кнопкой-капсулой под блоком (как «Удалить будильник» в
              «Часах» iOS). У совместной — выход: привычка пропадает, по ссылке вернётся. */}
          {shared ? (
            <DestructiveButton
              label={strings.leaveGroup}
              onPress={() => void askToLeave()}
            />
          ) : (
            <DestructiveButton
              label={strings.deleteHabit}
              disabled={deleting}
              onPress={() => void askToDelete()}
            />
          )}
          {deleteError ? (
            <p className={styles.error} role="alert">
              {deleteError}
            </p>
          ) : null}
        </Section>
      </div>
    </Screen>
  );
}
