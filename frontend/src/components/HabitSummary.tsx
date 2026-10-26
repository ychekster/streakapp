/**
 * Сводка привычки — общая часть экрана привычки (HabitScreen) и страницы участника
 * групповой привычки (GroupMemberScreen): карточка с сеткой за последние 364 дня,
 * «Основное» (текущая и лучшая серии, всего выполнено — «18/25»: из скольких дней с первого
 * дня привычки, цель серии) и календарь по месяцам (HabitCalendar).
 *
 * «Гибкий график» — свои карточки (flexibleStats): у недели и месяца серии в периодах
 * («5 нед.»), «Дней выполнено» без «из скольких» и вместо цели серии — сделано в текущем
 * периоде («2 / 3»); у года вместо серий — «Осталось» и темп (на сколько дней впереди или
 * позади равномерного плана с начала года — или с создания привычки, если позже).
 *
 * День отметки — последний день истории — из «Вида сетки» (GridViewContext): у страницы
 * участника это его день. Неизвестен (ещё нет настроек) — без календаря и без «из скольких
 * дней».
 */

import type { ReactNode, Ref } from "react";

import { HISTORY_COLUMNS, HISTORY_DAYS } from "../constants";
import { daysBetween } from "../data/dates";
import { flexiblePeriod, periodBounds, periodQuota } from "../data/derive";
import { localDate } from "./DateField";
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

interface Stat {
  icon: ReactNode;
  value: string | number;
  label: string;
}

/** Карточки «Основного» у «Гибкого графика»; `day` — день отметки. */
function flexibleStats(habit: Habit, day: string, strings: Strings): Stat[] | null {
  const period = flexiblePeriod(habit);
  if (period === null) {
    return null;
  }
  const [start, end] = periodBounds(period, day);
  const quota = periodQuota(habit.period_times ?? 1, start, end);
  const done = habit.period_done ?? 0;
  const progress: Stat = {
    icon: period === "year" ? <TrophyIcon /> : <TargetIcon />,
    value: `${done} / ${quota}`,
    label: strings.statThisPeriod[period],
  };
  const total: Stat = {
    icon: <CompletedIcon />,
    value: habit.total_done,
    label: strings.statDaysDone,
  };
  if (period !== "year") {
    const streak = strings.streakInPeriods[period];
    return [
      { icon: <FlameIcon />, value: streak(habit.current_streak), label: strings.statCurrentStreak },
      { icon: <TrophyIcon />, value: streak(habit.best_streak), label: strings.statBestStreak },
      total,
      progress,
    ];
  }
  // Равномерный план к дню отметки: с начала года или с того, что позже — создания
  // привычки или смены частоты на эту.
  const history = habit.schedule_history ?? [];
  const changed = history.length > 0 ? history[history.length - 1].until : null;
  const from = [start, habit.created_on ?? start, changed ?? start].reduce((a, b) =>
    a > b ? a : b,
  );
  const span = daysBetween(from, end) + 1;
  const plan = Math.floor((quota * (daysBetween(from, day) + 1)) / Math.max(span, 1));
  const pace = done - plan;
  return [
    { icon: <TargetIcon />, value: Math.max(0, quota - done), label: strings.statRemaining },
    {
      icon: <FlameIcon />,
      value: Math.abs(pace),
      label: pace > 0 ? strings.statAhead : pace < 0 ? strings.statBehind : strings.statOnPlan,
    },
    total,
    progress,
  ];
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
  // День отметки ещё неизвестен (нет настроек) — сегодня на устройстве.
  const flexible = flexibleStats(habit, markDay ?? localDate(), strings);
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
          {flexible ? (
            flexible.map((stat) => <StatCard key={stat.label} {...stat} />)
          ) : (
            <>
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
            </>
          )}
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
