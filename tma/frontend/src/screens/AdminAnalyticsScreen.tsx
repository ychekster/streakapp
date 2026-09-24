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

import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
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
import type { Analytics } from "../types/admin";
import type { HabitColor } from "../types/habit";
import styles from "./AdminAnalyticsScreen.module.css";

// Цвет секции: иконки её показателей и её график.
const USERS_COLOR: HabitColor = "blue";
const ACTIVITY_COLOR: HabitColor = "indigo";
const HABITS_COLOR: HabitColor = "purple";
const COMPLETION_COLOR: HabitColor = "teal";

interface AdminAnalyticsScreenProps {
  analytics: Resource<Analytics>;
  period: number;
  onPeriodChange: (period: number) => void;
}

export function AdminAnalyticsScreen({
  analytics,
  period,
  onPeriodChange,
}: AdminAnalyticsScreenProps) {
  const strings = useAdminStrings();
  const { data, status, error, refreshing, reload } = analytics;
  const periodOptions = ANALYTICS_PERIODS.map((days) => ({
    value: String(days),
    label: strings.periodNames[days],
  }));

  return (
    <Screen title={strings.analyticsTitle}>
      <div className={styles.filters}>
        <ListGroup>
          <ListItem label={strings.period}>
            <MenuSelect
              options={periodOptions}
              value={String(period)}
              onChange={(value) => onPeriodChange(Number(value))}
              label={strings.period}
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
          icon="alert"
          title={strings.errorTitle}
          description={describeAdminError(strings, error, strings.analyticsLoadFailed)}
          actionLabel={strings.retry}
          onAction={reload}
        />
      );
    }
    if (!data) {
      return <StatusMessage icon="spinner" title={strings.loading} />;
    }
    return (
      <div className={`${styles.sections} ${refreshing ? styles.refreshing : ""}`}>
        <Dashboard data={data} />
      </div>
    );
  }
}

function Dashboard({ data }: { data: Analytics }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const periodName = strings.periodNames[data.period_days] ?? strings.periodDays(data.period_days);
  const lastIndex = data.days.length - 1;
  // Подписи дней оси X: последний — «Сегодня».
  const labels = data.days.map((day, index) =>
    index === lastIndex ? strings.today : format.day(day.date),
  );
  const { users, activity, habits, audience } = data;
  const added = data.days.reduce((sum, day) => sum + day.new_users, 0);
  const averageDau = data.days.length
    ? data.days.reduce((sum, day) => sum + day.active_users, 0) / data.days.length
    : 0;
  const appUsers = habits.distribution.reduce((sum, bucket) => sum + bucket.users, 0);

  return (
    <>
      <Section title={strings.usersHeading}>
        <div className={styles.group} style={habitColorStyle(USERS_COLOR)}>
          <div className={styles.stats}>
            <StatCard
              icon={<UsersStatIcon />}
              value={format.count(users.total)}
              label={strings.statTotalUsers}
            />
            <StatCard
              icon={<UserPlusIcon />}
              value={format.count(users.new_week)}
              label={strings.statNewWeek}
            />
            <StatCard
              icon={<UserPlusIcon />}
              value={format.count(users.new_month)}
              label={strings.statNewMonth}
            />
            <StatCard
              icon={<OnlineIcon />}
              value={format.count(users.active_now)}
              label={strings.statActiveNow}
            />
          </div>
          <TrendCard
            title={strings.chartTotalUsers}
            summary={{
              value: format.count(users.total),
              note: strings.chartTotalUsersNote(added, periodName),
            }}
            values={data.days.map((day) => day.total_users)}
            labels={labels}
            readout={(index) => ({
              value: format.count(data.days[index].total_users),
              note: `${labels[index]} · +${format.count(data.days[index].new_users)}`,
            })}
            formatTick={format.count}
          />
        </div>
      </Section>

      <Section title={strings.activityHeading}>
        <div className={styles.group} style={habitColorStyle(ACTIVITY_COLOR)}>
          <div className={styles.stats}>
            <StatCard icon={<SunIcon />} value={format.count(activity.dau)} label={strings.statDau} />
            <StatCard
              icon={<WeekIcon />}
              value={format.count(activity.wau)}
              label={strings.statWau}
            />
            <StatCard
              icon={<MonthIcon />}
              value={format.count(activity.mau)}
              label={strings.statMau}
            />
            <StatCard
              icon={<RepeatIcon />}
              value={activity.mau ? format.percent(activity.dau / activity.mau) : "—"}
              label={strings.statStickiness}
            />
          </div>
          <TrendCard
            title={strings.chartDau}
            summary={{
              value: format.decimal(averageDau),
              note: strings.chartDauNote(periodName),
            }}
            values={data.days.map((day) => day.active_users)}
            labels={labels}
            partialLast
            readout={(index) => ({
              value: format.count(data.days[index].active_users),
              note: index === lastIndex ? strings.todaySoFar : labels[index],
            })}
            formatTick={format.count}
          />
        </div>
      </Section>

      <Section title={strings.audienceHeading} footer={strings.audienceFooter}>
        <AudienceCard audience={audience} total={users.total} />
      </Section>

      <Section title={strings.habitsHeading}>
        <div className={styles.group} style={habitColorStyle(HABITS_COLOR)}>
          <div className={styles.stats}>
            <StatCard
              icon={<ChecklistIcon />}
              value={format.decimal(habits.average)}
              label={strings.statAverageHabits}
            />
            <StatCard
              icon={<StackIcon />}
              value={format.count(habits.total)}
              label={strings.statTotalHabits}
            />
          </div>
          <HabitsCard distribution={habits.distribution} appUsers={appUsers} />
        </div>
      </Section>

      <Section title={strings.completionHeading}>
        <div className={styles.group} style={habitColorStyle(COMPLETION_COLOR)}>
          <TrendCard
            title={strings.chartCompletion}
            summary={{
              value: data.completion_rate === null ? "—" : format.percent(data.completion_rate),
              note: strings.chartCompletionNote(periodName),
            }}
            values={data.days.map((day) => day.completion_rate)}
            labels={labels}
            max={1}
            tickCount={2}
            integer={false}
            partialLast
            readout={(index) => {
              const day = data.days[index];
              const when = index === lastIndex ? strings.todaySoFar : labels[index];
              return day.completion_rate === null
                ? { value: "—", note: `${strings.nothingScheduled} · ${when}` }
                : {
                    value: format.percent(day.completion_rate),
                    note: `${strings.completionPoint(day.completed, day.scheduled)} · ${when}`,
                  };
            }}
            formatTick={format.percent}
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
  const strings = useAdminStrings();
  const [selected, setSelected] = useState<number | null>(null);
  const shown = selected === null ? summary : readout(selected);
  const table: ChartTable = {
    columns: [strings.tableDate, strings.tableValue],
    rows: labels.map((label, index) => [label, readout(index).value]),
  };

  return (
    <ChartCard
      title={title}
      value={shown.value}
      note={shown.note}
      table={table}
      showTableLabel={strings.showTable}
      showChartLabel={strings.showChart}
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
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const segments = [
    { label: strings.audienceUsesApp, value: audience.uses_app, color: "--chart-cat-1" },
    { label: strings.audienceNeverOpened, value: audience.never_opened, color: "--chart-cat-2" },
    { label: strings.audienceBlockedBot, value: audience.blocked_bot, color: "--chart-cat-3" },
  ];
  const table: ChartTable = {
    columns: [strings.tableGroup, strings.tableUsers],
    rows: segments.map((segment) => [segment.label, format.count(segment.value)]),
  };
  return (
    <ChartCard
      title={strings.chartAudience}
      value={format.count(total)}
      table={table}
      showTableLabel={strings.showTable}
      showChartLabel={strings.showChart}
    >
      <StackedBar
        segments={segments}
        formatValue={format.count}
        formatShare={format.percent}
        label={segments
          .map((segment) => `${segment.label}: ${format.count(segment.value)}`)
          .join(", ")}
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
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const [selected, setSelected] = useState<number | null>(null);
  const describe = (index: number): string => {
    const bucket = distribution[index];
    return strings.habitsBucketUsers(bucket.users, bucket.habits, bucket.open_ended);
  };
  const labels = distribution.map((bucket) =>
    strings.habitsBucket(bucket.habits, bucket.open_ended),
  );
  const table: ChartTable = {
    columns: [strings.tableHabits, strings.tableUsers],
    rows: distribution.map((bucket, index) => [labels[index], format.count(bucket.users)]),
  };
  return (
    <ChartCard
      title={strings.chartHabits}
      value={format.count(selected === null ? appUsers : distribution[selected].users)}
      note={selected === null ? strings.chartHabitsNote : describe(selected)}
      table={table}
      showTableLabel={strings.showTable}
      showChartLabel={strings.showChart}
    >
      <ColumnChart
        values={distribution.map((bucket) => bucket.users)}
        labels={labels}
        formatValue={format.count}
        selected={selected}
        onSelect={setSelected}
        label={strings.chartHabits}
        describe={describe}
      />
    </ChartCard>
  );
}
