/**
 * Вкладка «Аналитика» админ-панели. Сверху — период (7, 30 или 90 дней): он один на все
 * графики ниже. Секции — как на экране привычки, каждая в своём цвете (иконки показателей
 * и её график):
 *  - Пользователи — всего, новые за 7 и 30 дней, сейчас в приложении; график числа
 *    пользователей по дням;
 *  - Активность — DAU, WAU, MAU и их отношение; график DAU (сегодняшний день ещё идёт —
 *    отрезок к нему пунктиром);
 *  - Аудитория — все пользователи без пересечений: пользуются приложением, ещё не
 *    открывали его, заблокировали бота;
 *  - Привычки — в среднем на пользователя и всего; распределение по числу привычек;
 *  - Выполнение — доля выполненных запланированных привычек по дням.
 *
 * Данные хранит AdminApp: при возврате на вкладку они видны сразу и тихо обновляются, а
 * пока идёт загрузка другого периода, на экране — прежние, приглушённые.
 */

import { useState } from "react";

import { ADMIN_STRINGS as S, describeAdminError } from "../adminStrings";
import { formatCount, formatDay, formatDecimal, formatPercent } from "../adminFormat";
import {
  ChecklistIcon,
  MonthIcon,
  OnlineIcon,
  RepeatIcon,
  StackIcon,
  SunIcon,
  UserPlusIcon,
  UsersStatIcon,
  WeekIcon,
} from "../components/AdminIcons";
import { ChartCard, type ChartTable } from "../components/ChartCard";
import { ColumnChart } from "../components/ColumnChart";
import { LineChart } from "../components/LineChart";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { MenuSelect } from "../components/MenuSelect";
import { Screen } from "../components/Screen";
import { Section } from "../components/Section";
import { StackedBar } from "../components/StackedBar";
import { StatCard } from "../components/StatCard";
import { StatusMessage } from "../components/StatusMessage";
import { ANALYTICS_PERIODS } from "../constants";
import type { Resource } from "../hooks/useResource";
import { habitColorStyle } from "../theme";
import type { Analytics, AnalyticsDay } from "../types/admin";
import type { HabitColor } from "../types/habit";
import styles from "./AdminAnalyticsScreen.module.css";

// Цвет секции: иконки её показателей и её график.
const USERS_COLOR: HabitColor = "blue";
const ACTIVITY_COLOR: HabitColor = "indigo";
const HABITS_COLOR: HabitColor = "purple";
const COMPLETION_COLOR: HabitColor = "teal";

const PERIOD_OPTIONS = ANALYTICS_PERIODS.map((days) => ({
  value: String(days),
  label: S.periodNames[days],
}));

interface AdminAnalyticsScreenProps {
  analytics: Resource<Analytics>;
  period: number;
  onPeriodChange: (period: number) => void;
}

export function AdminAnalyticsScreen({ analytics, period, onPeriodChange }: AdminAnalyticsScreenProps) {
  const { data, status, error, refreshing, reload } = analytics;

  return (
    <Screen title={S.analyticsTitle}>
      <div className={styles.filters}>
        <ListGroup>
          <ListItem label={S.period}>
            <MenuSelect
              options={PERIOD_OPTIONS}
              value={String(period)}
              onChange={(value) => onPeriodChange(Number(value))}
              label={S.period}
            />
          </ListItem>
        </ListGroup>
      </div>
      {renderContent()}
    </Screen>
  );

  function renderContent() {
    if (status === "error" && !data) {
      return (
        <StatusMessage
          emoji={S.errorEmoji}
          title={S.errorTitle}
          description={describeAdminError(error, S.analyticsLoadFailed)}
          actionLabel={S.retry}
          onAction={reload}
        />
      );
    }
    if (!data) {
      return <StatusMessage emoji={S.loadingEmoji} title={S.loading} />;
    }
    return (
      <div className={`${styles.sections} ${refreshing ? styles.refreshing : ""}`}>
        <Dashboard data={data} />
      </div>
    );
  }
}

/** Подписи дней оси X: последний — «Сегодня». */
function dayLabels(days: AnalyticsDay[]): string[] {
  return days.map((day, index) => (index === days.length - 1 ? S.today : formatDay(day.date)));
}

function Dashboard({ data }: { data: Analytics }) {
  const periodName = S.periodNames[data.period_days] ?? S.periodDays(data.period_days);
  const labels = dayLabels(data.days);
  const lastIndex = data.days.length - 1;
  const { users, activity, habits, audience } = data;
  const added = data.days.reduce((sum, day) => sum + day.new_users, 0);
  const averageDau = data.days.length
    ? data.days.reduce((sum, day) => sum + day.active_users, 0) / data.days.length
    : 0;
  const appUsers = habits.distribution.reduce((sum, bucket) => sum + bucket.users, 0);

  return (
    <>
      <Section title={S.usersHeading}>
        <div className={styles.group} style={habitColorStyle(USERS_COLOR)}>
          <div className={styles.stats}>
            <StatCard icon={<UsersStatIcon />} value={formatCount(users.total)} label={S.statTotalUsers} />
            <StatCard icon={<UserPlusIcon />} value={formatCount(users.new_week)} label={S.statNewWeek} />
            <StatCard icon={<UserPlusIcon />} value={formatCount(users.new_month)} label={S.statNewMonth} />
            <StatCard icon={<OnlineIcon />} value={formatCount(users.active_now)} label={S.statActiveNow} />
          </div>
          <TrendCard
            title={S.chartTotalUsers}
            summary={{ value: formatCount(users.total), note: S.chartTotalUsersNote(added, periodName) }}
            values={data.days.map((day) => day.total_users)}
            labels={labels}
            readout={(index) => ({
              value: formatCount(data.days[index].total_users),
              note: `${labels[index]} · +${formatCount(data.days[index].new_users)}`,
            })}
            formatTick={formatCount}
          />
        </div>
      </Section>

      <Section title={S.activityHeading}>
        <div className={styles.group} style={habitColorStyle(ACTIVITY_COLOR)}>
          <div className={styles.stats}>
            <StatCard icon={<SunIcon />} value={formatCount(activity.dau)} label={S.statDau} />
            <StatCard icon={<WeekIcon />} value={formatCount(activity.wau)} label={S.statWau} />
            <StatCard icon={<MonthIcon />} value={formatCount(activity.mau)} label={S.statMau} />
            <StatCard
              icon={<RepeatIcon />}
              value={activity.mau ? formatPercent(activity.dau / activity.mau) : "—"}
              label={S.statStickiness}
            />
          </div>
          <TrendCard
            title={S.chartDau}
            summary={{ value: formatDecimal(averageDau), note: S.chartDauNote(periodName) }}
            values={data.days.map((day) => day.active_users)}
            labels={labels}
            partialLast
            readout={(index) => ({
              value: formatCount(data.days[index].active_users),
              note: index === lastIndex ? S.todaySoFar : labels[index],
            })}
            formatTick={formatCount}
          />
        </div>
      </Section>

      <Section title={S.audienceHeading} footer={S.audienceFooter}>
        <AudienceCard audience={audience} total={users.total} />
      </Section>

      <Section title={S.habitsHeading}>
        <div className={styles.group} style={habitColorStyle(HABITS_COLOR)}>
          <div className={styles.stats}>
            <StatCard
              icon={<ChecklistIcon />}
              value={formatDecimal(habits.average)}
              label={S.statAverageHabits}
            />
            <StatCard icon={<StackIcon />} value={formatCount(habits.total)} label={S.statTotalHabits} />
          </div>
          <HabitsCard distribution={habits.distribution} appUsers={appUsers} />
        </div>
      </Section>

      <Section title={S.completionHeading}>
        <div className={styles.group} style={habitColorStyle(COMPLETION_COLOR)}>
          <TrendCard
            title={S.chartCompletion}
            summary={{
              value: data.completion_rate === null ? "—" : formatPercent(data.completion_rate),
              note: S.chartCompletionNote(periodName),
            }}
            values={data.days.map((day) => day.completion_rate)}
            labels={labels}
            max={1}
            tickCount={2}
            integer={false}
            partialLast
            readout={(index) => {
              const day = data.days[index];
              const when = index === lastIndex ? S.todaySoFar : labels[index];
              return day.completion_rate === null
                ? { value: "—", note: `${S.nothingScheduled} · ${when}` }
                : {
                    value: formatPercent(day.completion_rate),
                    note: `${S.completionPoint(day.completed, day.scheduled)} · ${when}`,
                  };
            }}
            formatTick={formatPercent}
          />
        </div>
      </Section>
    </>
  );
}

interface TrendCardProps {
  title: string;
  /** Значение и пояснение, пока день не выбран. */
  summary: { value: string; note: string };
  values: (number | null)[];
  labels: string[];
  /** Значение и пояснение выбранного дня (и строка таблицы). */
  readout: (index: number) => { value: string; note: string };
  formatTick: (value: number) => string;
  max?: number;
  tickCount?: number;
  integer?: boolean;
  partialLast?: boolean;
}

/** Карточка с линейным графиком по дням: в шапке — итог или выбранный день. */
function TrendCard({
  title,
  summary,
  values,
  labels,
  readout,
  formatTick,
  max,
  tickCount,
  integer,
  partialLast,
}: TrendCardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const shown = selected === null ? summary : readout(selected);
  const table: ChartTable = {
    columns: [S.tableDate, S.tableValue],
    rows: labels.map((label, index) => [label, readout(index).value]),
  };

  return (
    <ChartCard
      title={title}
      value={shown.value}
      note={shown.note}
      table={table}
      showTableLabel={S.showTable}
      showChartLabel={S.showChart}
    >
      <LineChart
        values={values}
        labels={labels}
        max={max}
        tickCount={tickCount}
        integer={integer}
        formatTick={formatTick}
        partialLast={partialLast}
        selected={selected}
        onSelect={setSelected}
        label={title}
      />
    </ChartCard>
  );
}

function AudienceCard({ audience, total }: { audience: Analytics["audience"]; total: number }) {
  const segments = [
    { label: S.audienceUsesApp, value: audience.uses_app, color: "--chart-cat-1" },
    { label: S.audienceNeverOpened, value: audience.never_opened, color: "--chart-cat-2" },
    { label: S.audienceBlockedBot, value: audience.blocked_bot, color: "--chart-cat-3" },
  ];
  const table: ChartTable = {
    columns: [S.tableGroup, S.tableUsers],
    rows: segments.map((segment) => [segment.label, formatCount(segment.value)]),
  };
  return (
    <ChartCard
      title={S.chartAudience}
      value={formatCount(total)}
      table={table}
      showTableLabel={S.showTable}
      showChartLabel={S.showChart}
    >
      <StackedBar
        segments={segments}
        formatValue={formatCount}
        formatShare={formatPercent}
        label={segments.map((segment) => `${segment.label}: ${formatCount(segment.value)}`).join(", ")}
      />
    </ChartCard>
  );
}

function HabitsCard({
  distribution,
  appUsers,
}: {
  distribution: Analytics["habits"]["distribution"];
  appUsers: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const describe = (index: number): string => {
    const bucket = distribution[index];
    return S.habitsBucketUsers(bucket.users, bucket.habits, bucket.open_ended);
  };
  const labels = distribution.map((bucket) => S.habitsBucket(bucket.habits, bucket.open_ended));
  const table: ChartTable = {
    columns: [S.tableHabits, S.tableUsers],
    rows: distribution.map((bucket, index) => [labels[index], formatCount(bucket.users)]),
  };
  return (
    <ChartCard
      title={S.chartHabits}
      value={formatCount(selected === null ? appUsers : distribution[selected].users)}
      note={selected === null ? S.chartHabitsNote : describe(selected)}
      table={table}
      showTableLabel={S.showTable}
      showChartLabel={S.showChart}
    >
      <ColumnChart
        values={distribution.map((bucket) => bucket.users)}
        labels={labels}
        formatValue={formatCount}
        selected={selected}
        onSelect={setSelected}
        label={S.chartHabits}
        describe={describe}
      />
    </ChartCard>
  );
}
