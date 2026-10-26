/**
 * Сводка привычки — общая часть экрана привычки (HabitScreen) и страницы участника
 * групповой привычки (GroupMemberScreen): карточка с сеткой за последние 364 дня,
 * «Основное» (текущая и лучшая серии, всего выполнено — «18/25»: из скольких дней с первого
 * дня привычки, цель серии) и календарь по месяцам (HabitCalendar).
 *
 * «Гибкий график» — свои карточки (flexibleStats): у недели и месяца серии в периодах
 * («5 нед.»), «Дней выполнено» без «из скольких» и вместо цели серии — сделано в текущем
 * периоде («2 / 3»). У года (yearStats): «121 / 150 — В этом году», сколько раз в неделю
 * нужно, чтобы успеть к 31 декабря, сколько сделано на этой неделе и прогноз — к какому
 * дню цель будет набрана в нынешнем темпе (не успевает — сколько выйдет к концу года).
 *
 * День отметки — последний день истории — из «Вида сетки» (GridViewContext): у страницы
 * участника это его день. Неизвестен (ещё нет настроек) — без календаря и без «из скольких
 * дней».
 */

import { useEffect, type ReactNode, type Ref } from "react";

import { HISTORY_COLUMNS, HISTORY_DAYS } from "../constants";
import { flexiblePeriod, periodBounds, periodQuota, yearStats } from "../data/derive";
import { localDate } from "./DateField";
import { useLanguage, useStrings } from "../preferences";
import type { Strings } from "../strings";
import type { Habit } from "../types/habit";
import { weekdayLabel } from "../weekdayLabel";
import { trackedDays } from "./calendarDays";
import { useGridView } from "./gridLayout";
import { HabitBlock } from "./HabitBlock";
import { closeDaySheet, openDaySheet } from "./DaySheet";
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

/** «14 дек.» / «Dec 14» — день «ГГГГ-ММ-ДД». */
function shortDate(day: string, language: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const format = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return format.format(new Date(Date.UTC(year, month - 1, date)));
}

/** Карточки «Основного» у «Гибкого графика»; `day` — день отметки. */
function flexibleStats(
  habit: Habit,
  day: string,
  strings: Strings,
  language: string,
): Stat[] | null {
  const period = flexiblePeriod(habit);
  if (period === null) {
    return null;
  }
  const [start, end] = periodBounds(period, day);
  const quota = periodQuota(habit.period_times ?? 1, start, end);
  const done = habit.period_done ?? 0;
  if (period !== "year") {
    const streak = strings.streakInPeriods[period];
    return [
      { icon: <FlameIcon />, value: streak(habit.current_streak), label: strings.statCurrentStreak },
      { icon: <TrophyIcon />, value: streak(habit.best_streak), label: strings.statBestStreak },
      { icon: <CompletedIcon />, value: habit.total_done, label: strings.statDaysDone },
      { icon: <TargetIcon />, value: `${done} / ${quota}`, label: strings.statThisPeriod[period] },
    ];
  }
  const year = yearStats(habit, day);
  const { need, forecast } = year;
  return [
    { icon: <TrophyIcon />, value: `${year.done} / ${year.quota}`, label: strings.statThisPeriod.year },
    need.per === "late"
      ? { icon: <TargetIcon />, value: "—", label: strings.statTooLate }
      : { icon: <TargetIcon />, value: need.times, label: strings.statNeedPerWeek },
    { icon: <CompletedIcon />, value: year.thisWeek, label: strings.statThisPeriod.week },
    forecast.kind === "reached"
      ? {
          icon: <FlameIcon />,
          value: forecast.date ? shortDate(forecast.date, language) : "✓",
          label: strings.statGoalReached,
        }
      : forecast.kind === "date"
        ? { icon: <FlameIcon />, value: shortDate(forecast.date, language), label: strings.statGoalBy }
        : forecast.kind === "total"
          ? { icon: <FlameIcon />, value: `≈ ${forecast.total}`, label: strings.statForecast }
          : { icon: <FlameIcon />, value: "—", label: strings.statForecastNone },
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
  const language = useLanguage();
  const markDay = useGridView().day;
  // Ушли с экрана привычки («Назад») — окно её дня закрывается вместе с ним.
  useEffect(() => closeDaySheet, []);
  const days = markDay ? trackedDays(habit, markDay) : 0;
  // День отметки ещё неизвестен (нет настроек) — сегодня на устройстве.
  const flexible = flexibleStats(habit, markDay ?? localDate(), strings, language);
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
            <HabitCalendar
              habit={habit}
              day={markDay}
              // Свои привычки — день можно исправить в окне дня.
              onPickDay={onToggle ? (date) => openDaySheet(habit.id, date) : undefined}
            />
          </Card>
          {children}
        </Section>
      ) : null}
    </>
  );
}
