/**
 * Сводка привычки — общая часть экрана привычки (HabitScreen) и страницы участника
 * групповой привычки (GroupMemberScreen): карточка с сеткой за последние 364 дня,
 * «Основное» (текущая и лучшая серии, всего выполнено — «18/25»: из скольких дней с первого
 * дня привычки, цель серии) и календарь по месяцам (HabitCalendar).
 *
 * День отметки — последний день истории — из «Вида сетки» (GridViewContext): у страницы
 * участника это его день. Неизвестен (ещё нет настроек) — без календаря и без «из скольких
 * дней».
 */

import type { ReactNode, Ref } from "react";

import { HISTORY_COLUMNS, HISTORY_DAYS } from "../constants";
import { useStrings } from "../preferences";
import type { Strings } from "../strings";
import type { Habit } from "../types/habit";
import { weekdayLabel } from "../weekdayLabel";
import { trackedDays } from "./calendarDays";
import { useGridView } from "./gridLayout";
import { HabitBlock } from "./HabitBlock";
import { HabitCalendar } from "./HabitCalendar";
import { Card, Section } from "./Section";
import { StatCard } from "./StatCard";
import { CompletedIcon, FlameIcon, TargetIcon, TrophyIcon } from "./StatIcons";
import styles from "./HabitSummary.module.css";

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

interface HabitSummaryProps {
  habit: Habit;
  /** Заголовки разделов: у групповой привычки — «…группы». */
  headings: { history: string; main: string; calendar: string };
  /** Можно ли отмечать выполнение кнопкой в карточке. */
  interactive: boolean;
  onToggle?: (taskId: number) => void;
  /** Подзаголовок истории — якорь заголовка в шапке (когда он первый на экране). */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Под последней карточкой (кнопка «Исключить участника»). */
  children?: ReactNode;
}

export function HabitSummary({
  habit,
  headings,
  interactive,
  onToggle,
  headingRef,
  children,
}: HabitSummaryProps) {
  const strings = useStrings();
  const markDay = useGridView().day;
  const days = markDay ? trackedDays(habit, markDay) : 0;
  return (
    <>
      <Section title={headings.history} headingRef={headingRef}>
        <Card padded>
          <HabitBlock
            habit={habit}
            interactive={interactive}
            gridDays={HISTORY_DAYS}
            gridColumns={HISTORY_COLUMNS}
            onToggle={onToggle}
          />
        </Card>
      </Section>

      <Section title={headings.main}>
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
        {markDay ? null : children}
      </Section>

      {markDay ? (
        <Section title={headings.calendar}>
          <Card padded>
            <HabitCalendar habit={habit} day={markDay} />
          </Card>
          {children}
        </Section>
      ) : null}
    </>
  );
}
