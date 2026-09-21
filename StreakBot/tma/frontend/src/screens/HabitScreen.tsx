/**
 * Экран привычки: карточка с сеткой выполнения за последние 364 дня и основные
 * показатели — текущая и лучшая серии, всего выполнено, цель серии.
 *
 * Открывается нажатием на привычку в списке. Пока экран открыт, кнопка «Закрыть»
 * Telegram заменена на «Назад», а нижняя навигация скрыта (см. App). Привычка берётся
 * из общего состояния, поэтому отметка здесь сразу видна и в списке.
 */

import { useEffect, useRef } from "react";

import { HabitBlock } from "../components/HabitBlock";
import { Screen } from "../components/Screen";
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
import { showBackButton } from "../telegram/webapp";
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
  /** Вернуться к списку привычек (должна быть стабильной — см. эффект кнопки «Назад»). */
  onBack: () => void;
}

export function HabitScreen({ habit, onToggle, onBack }: HabitScreenProps) {
  const meta = useMeta();
  // Первый подзаголовок: когда он уходит под кнопки Telegram, в шапке появляется название.
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => showBackButton(onBack), [onBack]);

  const weekdays = meta?.weekdays ?? FALLBACK_WEEKDAYS;

  return (
    <Screen title={habit.name} titleAnchorRef={headingRef} withTabBar={false}>
      <div className={styles.body}>
        <section>
          <h2 ref={headingRef} className={styles.heading}>
            {STRINGS.habitHistoryHeading}
          </h2>
          <div className={styles.card}>
            <HabitBlock
              habit={habit}
              interactive={habit.scheduled_today}
              gridDays={HISTORY_DAYS}
              onToggle={onToggle}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>{STRINGS.habitMainHeading}</h2>
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
        </section>
      </div>
    </Screen>
  );
}
