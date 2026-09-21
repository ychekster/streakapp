/**
 * Экран привычки: карточка с сеткой выполнения за последние 364 дня, основные
 * показатели (текущая и лучшая серии, всего выполнено, цель серии) и настройки
 * привычки (редактировать, удалить). Весь экран окрашен в цвет привычки.
 *
 * Открывается нажатием на привычку в списке. Пока экран открыт, кнопка «Закрыть»
 * Telegram заменена на «Назад», а нижняя навигация скрыта (см. App). Привычка берётся
 * из общего состояния, поэтому отметка и изменения здесь сразу видны и в списке.
 *
 * «Редактировать привычку» открывает форму привычки (см. HabitFormScreen). «Удалить
 * привычку» открывает диалог подтверждения; после удаления App возвращает к списку.
 * При ошибке диалог остаётся открытым и показывает её вместо пояснения.
 */

import { useRef, useState } from "react";

import { ApiRequestError } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { HabitBlock } from "../components/HabitBlock";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { PencilIcon, TrashIcon } from "../components/SettingsIcons";
import { StatCard } from "../components/StatCard";
import {
  CompletedIcon,
  FlameIcon,
  TargetIcon,
  TrophyIcon,
} from "../components/StatIcons";
import { FALLBACK_WEEKDAYS, HISTORY_DAYS } from "../constants";
import { useMeta } from "../hooks/useMeta";
import { STRINGS } from "../strings";
import { hapticNotification } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { Habit } from "../types/habit";
import type { Weekday } from "../types/meta";
import styles from "./HabitScreen.module.css";

// Наборы дней с собственной подписью (коды в порядке недели, как их хранит бэкенд).
const WORKDAYS_KEY = "mon,tue,wed,thu,fri";
const WEEKENDS_KEY = "sat,sun";

/** Подпись цели серии: «Ежедневно», «Будни», «Выходные» или дни («Пн, Ср, Пт»). */
function formatStreakGoal(habit: Habit, weekdays: readonly Weekday[]): string {
  const selected = weekdays.filter((day) => habit.days.includes(day.code));
  if (habit.frequency_type === "daily" || selected.length === weekdays.length) {
    return STRINGS.goalDaily;
  }
  const key = selected.map((day) => day.code).join(",");
  if (key === WORKDAYS_KEY) {
    return STRINGS.goalWorkdays;
  }
  if (key === WEEKENDS_KEY) {
    return STRINGS.goalWeekends;
  }
  // Короткие подписи приходят капсом («ПН») — в тексте пишем «Пн».
  return selected
    .map((day) => day.short.charAt(0) + day.short.slice(1).toLowerCase())
    .join(", ");
}

interface HabitScreenProps {
  habit: Habit;
  onToggle: (taskId: number) => void;
  /** Въехать при открытии. Нет — при возврате из формы редактирования: «назад» не должно
   *  выглядеть как переход вперёд. */
  animateEnter: boolean;
  /** Открыть форму редактирования привычки. */
  onEdit: (habit: Habit) => void;
  /** Удалить привычку и вернуться к списку; при ошибке промис отклоняется. */
  onDelete: (taskId: number) => Promise<void>;
}

export function HabitScreen({
  habit,
  onToggle,
  animateEnter,
  onEdit,
  onDelete,
}: HabitScreenProps) {
  const meta = useMeta();
  // Первый подзаголовок: когда он уходит под кнопки Telegram, в шапке появляется название.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const weekdays = meta?.weekdays ?? FALLBACK_WEEKDAYS;

  function askToDelete(): void {
    setDeleteError(null);
    setConfirmingDelete(true);
  }

  async function confirmDelete(): Promise<void> {
    setDeleting(true);
    setDeleteError(null);
    try {
      // При успехе App закрывает этот экран — сбрасывать состояние не нужно.
      await onDelete(habit.id);
    } catch (error) {
      setDeleteError(error instanceof ApiRequestError ? error.message : STRINGS.deleteFailed);
      setDeleting(false);
      hapticNotification("error");
    }
  }

  return (
    <Screen title={habit.name} titleAnchorRef={headingRef} withTabBar={false}>
      <div className={animateEnter ? styles.enter : undefined} style={habitColorStyle(habit.color)}>
        <Section title={STRINGS.habitHistoryHeading} headingRef={headingRef}>
          <Card padded>
            <HabitBlock
              habit={habit}
              interactive={habit.scheduled_today}
              gridDays={HISTORY_DAYS}
              onToggle={onToggle}
            />
          </Card>
        </Section>

        <Section title={STRINGS.habitMainHeading}>
          <div className={styles.stats}>
            <StatCard
              icon={<FlameIcon />}
              value={habit.current_streak}
              label={STRINGS.statCurrentStreak}
            />
            <StatCard
              icon={<TrophyIcon />}
              value={habit.best_streak}
              label={STRINGS.statBestStreak}
            />
            <StatCard
              icon={<CompletedIcon />}
              value={habit.total_done}
              label={STRINGS.statTotalDone}
            />
            <StatCard
              icon={<TargetIcon />}
              value={formatStreakGoal(habit, weekdays)}
              label={STRINGS.statStreakGoal}
            />
          </div>
        </Section>

        <Section title={STRINGS.habitSettingsHeading}>
          <Card>
            <ListItem
              icon={<PencilIcon />}
              label={STRINGS.editHabit}
              onPress={() => onEdit(habit)}
            />
            <ListItem
              icon={<TrashIcon />}
              label={STRINGS.deleteHabit}
              destructive
              onPress={askToDelete}
            />
          </Card>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={STRINGS.deleteDialogTitle}
        message={deleteError ?? STRINGS.deleteDialogMessage}
        cancelLabel={STRINGS.deleteDialogCancel}
        confirmLabel={STRINGS.deleteDialogConfirm}
        destructive
        busy={deleting}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
      />
    </Screen>
  );
}
