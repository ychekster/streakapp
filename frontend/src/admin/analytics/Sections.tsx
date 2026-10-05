/**
 * Разделы аналитики. У каждого — свои данные (useSection) под общим фильтром сверху.
 * Любая цифра про людей нажимается: `onOpenPeople` открывает список этих людей (группа
 * на сервере, backend/analytics/people.py), оттуда — рассылка именно им.
 */

import { useState, type CSSProperties, type ReactNode } from "react";

import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { ChartCard, type ChartTable } from "../components/ChartCard";
import { LineChart } from "../components/LineChart";
import { WebFunnelSection } from "../components/WebFunnelSection";
import { ListItem } from "../../components/ListItem";
import { Card } from "../../components/Section";
import { StatusMessage } from "../../components/StatusMessage";
import type { Resource } from "../../hooks/useResource";
import { habitColorStyle } from "../../theme";
import type {
  AnalyticsFilter,
  AnalyticsMeta,
  AnalyticsSections,
  Bucket,
  FunnelReport,
  Metric,
  PeopleQuery,
  RetentionBasis,
  RetentionCompare,
} from "../../types/admin";
import type { HabitColor } from "../../types/habit";
import {
  BarList,
  Block,
  DataTable,
  HourColumns,
  MetricCard,
  MultiLineChart,
  PairsTable,
  Pills,
  TableCard,
  WeekdayBars,
  type BarItem,
  type DeltaSpec,
} from "./kit";
import { useSection, useTrackingNote } from "./useSection";
import styles from "./Analytics.module.css";

export interface SectionProps {
  filter: AnalyticsFilter;
  onOpenPeople: (query: PeopleQuery) => void;
  onOpenLinks: () => void;
}

// Цвета разделов — как секции экрана привычки.
const BLUE: HabitColor = "blue";
const RED: HabitColor = "red";
const PURPLE: HabitColor = "purple";
const TEAL: HabitColor = "teal";
const GREEN: HabitColor = "green";

/** Загрузка, ошибка или содержимое раздела (прежние данные видны, пока грузятся новые). */
function Loaded<T>({
  resource,
  children,
}: {
  resource: Resource<T>;
  children: (data: T) => ReactNode;
}) {
  const strings = useAdminStrings();
  if (!resource.data) {
    return resource.status === "error" ? (
      <StatusMessage
        icon="alert"
        title={strings.errorTitle}
        description={describeAdminError(strings, resource.error, strings.an.loadFailed)}
        actionLabel={strings.retry}
        onAction={resource.reload}
      />
    ) : (
      <StatusMessage icon="spinner" title={strings.loading} />
    );
  }
  return (
    <div className={resource.refreshing ? styles.refreshing : undefined}>{children(resource.data)}</div>
  );
}

/** Изменение счётчика к прошлому периоду. */
function useDeltas(meta: AnalyticsMeta) {
  const strings = useAdminStrings();
  const label = strings.an.compareTo[meta.period] ?? "";
  return {
    count: (metric: Metric, inverse = false): DeltaSpec => ({
      current: metric.value,
      previous: metric.previous,
      kind: "count",
      inverse,
      label,
    }),
    rate: (metric: Metric, inverse = false): DeltaSpec => ({
      current: metric.value,
      previous: metric.previous,
      kind: "rate",
      inverse,
      label,
    }),
  };
}

function rate(format: ReturnType<typeof useAdminFormat>, value: number | null): string {
  return value === null ? "—" : format.percent(value);
}

/** Карточка с линейным графиком по дням (как в прежней аналитике). */
function SeriesCard({
  title,
  values,
  dates,
  summary,
  isRate = false,
}: {
  title: string;
  values: (number | null)[];
  dates: string[];
  summary: { value: string; note: string };
  isRate?: boolean;
}) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const [selected, setSelected] = useState<number | null>(null);
  const labels = dates.map((day) => format.day(day));
  const show = (value: number | null): string =>
    value === null ? "—" : isRate ? format.percent(value) : format.count(value);
  const table: ChartTable = {
    columns: [strings.tableDate, strings.tableValue],
    rows: labels.map((label, index) => [label, show(values[index])]),
  };
  const shown = selected === null ? summary : { value: show(values[selected]), note: labels[selected] };
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
        max={isRate ? 1 : undefined}
        tickCount={isRate ? 2 : 3}
        integer={!isRate}
        formatTick={isRate ? format.percent : format.count}
        partialLast
        selected={selected}
        onSelect={setSelected}
        label={title}
      />
    </ChartCard>
  );
}

/* ------------------------------------------------------------------------ */
/*  1. Сводка                                                               */
/* ------------------------------------------------------------------------ */

export function SummarySection({ filter, onOpenPeople }: SectionProps) {
  const resource = useSection("summary", filter);
  return <Loaded resource={resource}>{(data) => <Summary data={data} onOpenPeople={onOpenPeople} />}</Loaded>;
}

function Summary({ data, onOpenPeople }: { data: AnalyticsSections["summary"]; onOpenPeople: SectionProps["onOpenPeople"] }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const an = strings.an;
  const deltas = useDeltas(data.meta);
  const tracking = useTrackingNote(data.meta);
  const period = an.periodNote[data.meta.period] ?? "";
  const open = (metric: string, title: string) => () => onOpenPeople({ metric, title });
  const previousPeriod = an.previousPeriod[data.meta.period] ?? "";

  return (
    <>
      <div className={styles.grid} style={habitColorStyle(BLUE)}>
        <MetricCard
          wide
          label={an.liveTitle}
          value={format.count(data.live.value ?? 0)}
          info={an.liveInfo}
          delta={{ current: data.live.value, previous: data.live.previous, kind: "count", label: an.liveCompare }}
          spark={data.live_weeks.map((point) => point.value)}
          note={an.liveWeeks}
          onPress={open("live", an.liveTitle)}
        />
        <MetricCard
          label={an.newTitle}
          value={format.count(data.new_users.value ?? 0)}
          info={an.newInfo}
          delta={deltas.count(data.new_users)}
          note={period}
          onPress={open("new", `${an.newTitle} ${period}`)}
        />
        <MetricCard
          label={an.activationTitle}
          value={rate(format, data.activation.value)}
          info={an.activationInfo(data.meta.activation_window_days, data.meta.activation_min_days)}
          delta={deltas.rate(data.activation)}
          note={data.activation_pending ? an.activationPending(data.activation_pending) : undefined}
          onPress={open("activated", `${an.activationTitle}: ${an.steps.activated.toLowerCase()} ${period}`)}
        />
        <MetricCard
          wide
          label={an.d7Title}
          value={rate(format, data.d7.value)}
          info={an.d7Info}
          delta={deltas.rate(data.d7)}
          note={data.d7_cohort ? an.d7Cohort(data.d7_cohort) : an.noData}
          onPress={open("d7_retained", `${an.d7Title} ${period}`)}
        />
      </div>

      <div className={styles.content}>
        <Block title={an.todayHeading}>
          <div className={styles.grid} style={habitColorStyle(TEAL)}>
            <MetricCard
              label={an.openedToday}
              value={format.count(data.today.opened)}
              info={an.openedTodayInfo}
              note={an.yesterday(data.today.opened_yesterday)}
              onPress={open("opened_today", `${an.openedToday} — ${strings.today.toLowerCase()}`)}
            />
            <MetricCard
              label={an.checkedToday}
              value={format.count(data.today.checked_in)}
              info={an.checkedTodayInfo}
              note={an.yesterday(data.today.checked_in_yesterday)}
              onPress={open("checked_today", `${an.checkedToday} — ${strings.today.toLowerCase()}`)}
            />
            <MetricCard
              wide
              label={an.onlineNow}
              value={format.count(data.today.online)}
              info={an.onlineInfo}
              onPress={open("online", an.onlineNow)}
            />
          </div>
        </Block>

        <Block title={an.leftHeading} tracking={tracking}>
          <div className={styles.grid} style={habitColorStyle(RED)}>
            <MetricCard
              label={an.blockedBot}
              value={format.count(data.blocked_bot.value ?? 0)}
              info={an.blockedInfo}
              delta={deltas.count(data.blocked_bot, true)}
              onPress={open("blocked_bot", `${an.blockedBot} ${period}`)}
            />
            <MetricCard
              label={an.becameInactive}
              value={format.count(data.became_inactive.value ?? 0)}
              info={an.becameInactiveInfo}
              delta={deltas.count(data.became_inactive, true)}
              onPress={open("became_inactive", `${an.becameInactive} ${period}`)}
            />
            <MetricCard
              wide
              label={an.uninstalled}
              value={format.count(data.uninstalled.value ?? 0)}
              info={an.uninstalledInfo}
              delta={deltas.count(data.uninstalled, true)}
              onPress={open("uninstalled", `${an.uninstalled} ${period}`)}
            />
          </div>
        </Block>

        <Block title={an.changesHeading}>
          <Card>
            {data.changes.length === 0 ? (
              <p className={styles.empty}>{an.noChanges}</p>
            ) : (
              <ul className={styles.changes}>
                {data.changes.map((item) => {
                  const up = item.current > item.previous;
                  const bad = item.kind === "blocked" || item.kind === "inactive" ? up : !up;
                  return (
                    <li key={item.kind} className={styles.change}>
                      <span className={`${styles.changeMark} ${bad ? styles.bad : styles.good}`}>{up ? "↑" : "↓"}</span>
                      <span>{an.change(item.kind, item.current, item.previous, item.source, previousPeriod)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Block>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/*  2. Воронка                                                              */
/* ------------------------------------------------------------------------ */

const PERIOD_DAYS: Record<string, number> = { today: 1, "7": 7, "30": 30, "90": 90, all: 365 };

export function FunnelSection({ filter, onOpenPeople }: SectionProps) {
  const strings = useAdminStrings();
  const resource = useSection("funnel", filter);
  return (
    <Loaded resource={resource}>
      {(data) => (
        <>
          {data.funnels.map((report) => (
            <FunnelBlock key={report.platform} report={report} onOpenPeople={onOpenPeople} />
          ))}
          {filter.platform !== "telegram" ? (
            <div className={styles.content}>
              <WebFunnelSection days={PERIOD_DAYS[filter.period] ?? 30} />
            </div>
          ) : null}
          <p className={styles.footnote}>{strings.an.funnelFooter}</p>
        </>
      )}
    </Loaded>
  );
}

function FunnelBlock({ report, onOpenPeople }: { report: FunnelReport; onOpenPeople: SectionProps["onOpenPeople"] }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const an = strings.an;
  const top = Math.max(1, ...report.steps.map((step) => step.users));
  const web = report.platform === "web";
  return (
    <div className={styles.block} style={habitColorStyle(web ? PURPLE : BLUE)}>
      <Block
        title={web ? an.funnelWeb : an.funnelTelegram}
        footnote={web ? an.pageStepsFooter : undefined}
      >
        <TableCard
          data={{
            columns: ["", an.peopleColumn, an.fromPrevious("%"), an.fromStart("%")],
            rows: report.steps.map((step) => [
              an.steps[step.key] ?? step.key,
              step.users,
              step.from_previous === null ? null : Math.round(step.from_previous * 100),
              step.from_start === null ? null : Math.round(step.from_start * 100),
            ]),
          }}
          title={web ? an.funnelWeb : an.funnelTelegram}
        >
          {report.steps.map((step, index) => {
            const name = an.steps[step.key] ?? step.key;
            const meta = [
              index ? an.fromPrevious(rate(format, step.from_previous)) : null,
              index ? an.fromStart(rate(format, step.from_start)) : null,
              step.median_minutes_to_next !== null ? an.usually(an.duration(step.median_minutes_to_next)) : null,
              an.stepInfo[step.key] ?? null,
            ]
              .filter(Boolean)
              .join(" · ");
            const body = (
              <>
                <span className={styles.stepHead}>
                  <span className={styles.stepName}>{name}</span>
                  <span className={styles.stepCount}>{format.count(step.users)}</span>
                </span>
                <span className={styles.stepBar}>
                  <span className={styles.stepFill} style={{ width: `${(step.users / top) * 100}%` }} />
                </span>
                {meta ? <span className={styles.stepMeta}>{meta}</span> : null}
              </>
            );
            return step.people ? (
              <button
                key={step.key}
                type="button"
                className={styles.step}
                onClick={() =>
                  onOpenPeople({
                    metric: "funnel_stuck",
                    arg: `${report.platform}:${step.key}`,
                    title: `${an.stuckTitle(name)} (${web ? an.funnelWeb : an.funnelTelegram})`,
                  })
                }
              >
                {body}
              </button>
            ) : (
              <div key={step.key} className={styles.step}>
                {body}
              </div>
            );
          })}
        </TableCard>
      </Block>
      {report.by_source.length > 1 ? (
        <div className={styles.content}>
          <DataTable
            title={`${an.bySource} · ${web ? an.funnelWeb : an.funnelTelegram}`}
            rows={report.by_source}
            rowKey={(row) => row.source}
            initialSort={report.steps[0]?.key}
            columns={[
              { key: "source", label: an.sourceColumn, value: (row) => an.sourceName(row.source) },
              ...report.steps.map((step, index) => ({
                key: step.key,
                label: an.steps[step.key] ?? step.key,
                value: (row: { steps: number[] }) => row.steps[index] ?? 0,
                display: (row: { steps: number[] }) => {
                  const first = row.steps[0] ?? 0;
                  const value = row.steps[index] ?? 0;
                  return index && first ? `${format.count(value)} · ${format.percent(value / first)}` : format.count(value);
                },
              })),
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  3. Удержание                                                            */
/* ------------------------------------------------------------------------ */

interface RetentionProps extends SectionProps {
  basis: RetentionBasis;
  onBasisChange: (basis: RetentionBasis) => void;
  compare: RetentionCompare;
  onCompareChange: (compare: RetentionCompare) => void;
}

export function RetentionSection({ filter, onOpenPeople, basis, onBasisChange, compare, onCompareChange }: RetentionProps) {
  const strings = useAdminStrings();
  const an = strings.an;
  const resource = useSection("retention", filter, { basis, compare });
  return (
    <>
      <Pills
        label={an.basisInfo}
        value={basis}
        onChange={onBasisChange}
        options={[
          { value: "checkin", label: an.basisCheckin },
          { value: "open", label: an.basisOpen },
        ]}
      />
      <p className={styles.footnote}>{an.basisInfo}</p>
      <div className={styles.content}>
        <Loaded resource={resource}>
          {(data) => (
            <Retention
              data={data}
              basis={basis}
              compare={compare}
              onCompareChange={onCompareChange}
              onOpenPeople={onOpenPeople}
            />
          )}
        </Loaded>
      </div>
    </>
  );
}

function heatStyle(value: number | null): CSSProperties | undefined {
  if (value === null) {
    return undefined;
  }
  return {
    backgroundColor: `rgba(var(--palette-blue), ${0.08 + Math.min(1, value) * 0.62})`,
    color: value > 0.55 ? "var(--color-on-habit)" : "var(--color-text-primary)",
  };
}

function Retention({
  data,
  basis,
  compare,
  onCompareChange,
  onOpenPeople,
}: {
  data: AnalyticsSections["retention"];
  basis: RetentionBasis;
  compare: RetentionCompare;
  onCompareChange: (compare: RetentionCompare) => void;
  onOpenPeople: SectionProps["onOpenPeople"];
}) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const an = strings.an;
  const deltas = useDeltas(data.meta);
  const basisName = basis === "checkin" ? an.basisCheckin : an.basisOpen;
  const period = an.periodNote[data.meta.period] ?? "";
  const cells = data.weeks[0]?.cells.length ?? 0;
  const leaveTotal = data.leave.reduce((sum, bucket) => sum + bucket.users, 0) + data.still_active;

  return (
    <>
      <div className={styles.grid} style={habitColorStyle(BLUE)}>
        {(["d1", "d7", "d30"] as const).map((key, index) => {
          const day = [1, 7, 30][index];
          return (
            <MetricCard
              key={key}
              wide={key === "d30"}
              label={`D${day} · ${basisName.toLowerCase()}`}
              value={rate(format, data[key].value)}
              info={an.dInfo(day)}
              delta={deltas.rate(data[key])}
              onPress={() =>
                onOpenPeople({ metric: "day_n", arg: String(day), basis, title: `D${day} (${basisName.toLowerCase()}) ${period}` })
              }
            />
          );
        })}
      </div>

      <div className={styles.content}>
        <Block title={an.weeksHeading} info={an.weeksInfo}>
          <TableCard
            data={{
              columns: [an.cohortColumn, an.sizeColumn, ...Array.from({ length: cells }, (_, index) => an.weekShort(index))],
              rows: data.weeks.map((week) => [
                week.start,
                week.size,
                ...week.cells.map((cell) => (cell === null ? null : Math.round(cell * 100))),
              ]),
            }}
            title={`${an.weeksHeading} · ${basisName}`}
          >
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{an.cohortColumn}</th>
                    <th scope="col">{an.sizeColumn}</th>
                    {Array.from({ length: cells }, (_, index) => (
                      <th key={index} scope="col">
                        {an.weekShort(index)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...data.weeks].reverse().map((week) => (
                    <tr key={week.start}>
                      <th scope="row">
                        <button
                          type="button"
                          className={styles.sortButton}
                          onClick={() =>
                            onOpenPeople({ metric: "cohort_week", arg: week.start, title: an.week(format.day(week.start)) })
                          }
                        >
                          {format.day(week.start)}
                        </button>
                      </th>
                      <td>{format.count(week.size)}</td>
                      {week.cells.map((cell, index) => (
                        <td key={index} className={styles.heat} data-empty={cell === null ? "" : undefined} style={heatStyle(cell)}>
                          {cell === null ? (
                            "—"
                          ) : (
                            <button
                              type="button"
                              className={styles.heatButton}
                              onClick={() =>
                                onOpenPeople({
                                  metric: "cohort_cell",
                                  arg: `${week.start}:${index}`,
                                  basis,
                                  title: `${an.week(format.day(week.start))} · ${an.weekShort(index)}`,
                                })
                              }
                            >
                              {format.percent(cell)}
                            </button>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableCard>
        </Block>

        <Block
          title={an.curveHeading}
          info={an.curveInfo}
        >
          <Pills
            label={an.compareLabel}
            value={compare}
            onChange={onCompareChange}
            options={[
              { value: "none", label: an.compareNone },
              { value: "platform", label: an.comparePlatform },
              { value: "source", label: an.compareSource },
            ]}
          />
          <div className={styles.content} style={{ marginTop: 10 }}>
            <MultiLineChart
              title={`${an.curveHeading} · ${basisName}`}
              series={data.curves.map((curve) => ({
                key: curve.key,
                label: `${an.curveGroup(curve.key)} (${format.count(curve.size)})`,
                points: curve.points,
              }))}
              xLabel={(index) => an.dayN(index)}
            />
          </div>
        </Block>

        <Block title={an.leaveHeading} info={an.leaveInfo}>
          <BarList
            title={an.leaveHeading}
            items={[
              ...data.leave.map((bucket) => ({
                key: bucket.key,
                label: an.leaveBuckets[bucket.key] ?? bucket.key,
                value: bucket.users,
                share: leaveTotal ? bucket.users / leaveTotal : null,
              })),
              {
                key: "still",
                label: an.stillActive,
                value: data.still_active,
                share: leaveTotal ? data.still_active / leaveTotal : null,
              },
            ]}
            onPress={(item) =>
              onOpenPeople(
                item.key === "still"
                  ? { metric: "still_active", title: `${an.stillActive} ${period}` }
                  : { metric: "left_after", arg: item.key, title: `${an.leaveHeading}: ${item.label.toLowerCase()}` },
              )
            }
          />
        </Block>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/*  4. Отток и возврат                                                      */
/* ------------------------------------------------------------------------ */

export function ChurnSection({ filter, onOpenPeople }: SectionProps) {
  const resource = useSection("churn", filter);
  return <Loaded resource={resource}>{(data) => <Churn data={data} onOpenPeople={onOpenPeople} />}</Loaded>;
}

function Churn({ data, onOpenPeople }: { data: AnalyticsSections["churn"]; onOpenPeople: SectionProps["onOpenPeople"] }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const an = strings.an;
  const deltas = useDeltas(data.meta);
  const tracking = useTrackingNote(data.meta);
  const period = an.periodNote[data.meta.period] ?? "";
  const open = (metric: string, title: string, arg?: string) => () => onOpenPeople({ metric, arg, title });
  const reasons: BarItem[] = data.return_reasons
    .filter((reason) => reason.key !== "unknown" || reason.users > 0)
    .map((reason) => ({ key: reason.key, label: an.returnReasons[reason.key] ?? reason.key, value: reason.users }));

  return (
    <>
      <div className={styles.grid} style={habitColorStyle(RED)}>
        <MetricCard
          label={an.blockedHeading}
          value={format.count(data.blocked.value ?? 0)}
          info={an.blockedInfo}
          delta={deltas.count(data.blocked, true)}
          note={`${an.blockedHadHabit(data.blocked_had_habit)} · ${an.blockedActivated(data.blocked_activated)}`}
          onPress={open("blocked_bot", `${an.blockedHeading} ${period}`)}
        />
        <MetricCard
          label={an.becameInactive}
          value={format.count(data.became_inactive.value ?? 0)}
          info={an.becameInactiveInfo}
          delta={deltas.count(data.became_inactive, true)}
          onPress={open("became_inactive", `${an.becameInactive} ${period}`)}
        />
        <MetricCard
          label={an.uninstalledHeading}
          value={format.count(data.uninstalled.value ?? 0)}
          info={an.uninstalledInfo}
          delta={deltas.count(data.uninstalled, true)}
          note={`${an.uninstalledNow}: ${format.count(data.uninstalled_total)}`}
          onPress={open("uninstalled", `${an.uninstalledHeading} ${period}`)}
        />
        <MetricCard
          label={an.returnedHeading}
          value={format.count(data.returned.value ?? 0)}
          info={an.returnedInfo}
          delta={deltas.count(data.returned)}
          onPress={open("returned", `${an.returnedHeading} ${period}`)}
          style={habitColorStyle(GREEN)}
        />
      </div>

      <div className={styles.content} style={habitColorStyle(RED)}>
        <Block title={an.blockedByDay} footnote={an.blockedDaysNote} tracking={tracking}>
          <SeriesCard
            title={an.blockedByDay}
            values={data.blocked_days.map((day) => day.value)}
            dates={data.blocked_days.map((day) => day.date)}
            summary={{ value: format.count(data.blocked.value ?? 0), note: period }}
          />
        </Block>

        <Block title={an.inactiveHeading} info={an.inactiveInfo}>
          <BarList
            title={`${an.inactiveHeading} · ${an.inactiveNow}: ${format.count(data.inactive_total)}`}
            items={data.inactive_buckets.map((bucket) => ({
              key: bucket.key,
              label: an.inactiveBuckets[bucket.key] ?? bucket.key,
              value: bucket.users,
            }))}
            onPress={(item) => onOpenPeople({ metric: "inactive_bucket", arg: item.key, title: `${an.inactiveHeading}: ${item.label}` })}
          />
        </Block>

        <Block title={an.returnedHeading} info={an.returnedInfo} tracking={tracking}>
          <BarList title={an.returnedHeading} items={reasons} />
        </Block>

        <Block title={an.groupsHeading} footnote={an.groupsFooter}>
          <BarList
            title={an.groupsHeading}
            shares={false}
            items={data.groups.map((group) => ({ key: group.key, label: an.groups[group.key] ?? group.key, value: group.users }))}
            onPress={(item) => onOpenPeople({ metric: item.key, title: item.label })}
          />
        </Block>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/*  5. Привычки и поведение                                                 */
/* ------------------------------------------------------------------------ */

export function HabitsSection({ filter, onOpenPeople }: SectionProps) {
  const resource = useSection("habits", filter);
  return <Loaded resource={resource}>{(data) => <Habits data={data} onOpenPeople={onOpenPeople} />}</Loaded>;
}

function bucketItems(buckets: Bucket[], label: (key: string) => string): BarItem[] {
  return buckets.map((bucket) => ({ key: bucket.key, label: label(bucket.key), value: bucket.users }));
}

function Habits({ data, onOpenPeople }: { data: AnalyticsSections["habits"]; onOpenPeople: SectionProps["onOpenPeople"] }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const an = strings.an;
  const deltas = useDeltas(data.meta);
  const tracking = useTrackingNote(data.meta);
  const period = an.periodNote[data.meta.period] ?? "";
  const known = data.completion_weekdays.filter((value): value is number => value !== null);
  const worst = known.length > 1 ? data.completion_weekdays.indexOf(Math.min(...known)) : -1;

  return (
    <div style={habitColorStyle(PURPLE)}>
      <Block title={an.perUserHeading} info={an.perUserInfo}>
        <div className={styles.stack}>
          <div className={styles.grid}>
            <MetricCard label={an.average} value={data.average === null ? "—" : format.decimal(data.average)} />
            <MetricCard
              label={an.withoutHabits}
              value={format.count(data.without_habits)}
              onPress={() => onOpenPeople({ metric: "without_habits", title: an.withoutHabits })}
            />
          </div>
          <BarList
            title={an.perUserHeading}
            items={bucketItems(data.per_user, an.perUserBucket)}
            onPress={(item) => onOpenPeople({ metric: "habits_bucket", arg: item.key, title: item.label })}
          />
        </div>
      </Block>

      <Block title={an.topHeading} footnote={an.topFooter}>
        <DataTable
          title={an.topHeading}
          rows={data.top_names}
          rowKey={(row) => row.key}
          initialSort="users"
          onRowPress={(row) => onOpenPeople({ metric: "habit_topic", arg: row.key, title: row.name })}
          columns={[
            { key: "name", label: an.habitColumn, value: (row) => row.name },
            { key: "users", label: an.peopleColumn, value: (row) => row.users, display: (row) => format.count(row.users) },
            { key: "habits", label: an.habitsColumn, value: (row) => row.habits, display: (row) => format.count(row.habits) },
          ]}
        />
      </Block>

      <Block title={an.frequencyHeading} footnote={an.withReminder(data.with_reminder, data.total_habits)}>
        <div className={styles.stack}>
          <BarList
            title={an.frequencyHeading}
            items={bucketItems(data.frequency, (key) => an.frequency[key] ?? key)}
            onPress={(item) => onOpenPeople({ metric: "frequency", arg: item.key, title: item.label })}
          />
          <HourColumns title={an.reminderHours} values={data.reminder_hours} />
        </div>
      </Block>

      <Block title={an.deletedHeading} tracking={tracking}>
        <div className={styles.stack}>
          <div className={styles.grid}>
            <MetricCard
              label={an.deletedCount}
              value={format.count(data.deleted.value ?? 0)}
              delta={deltas.count(data.deleted, true)}
              note={period}
            />
            <MetricCard
              label={an.deletedMedian}
              value={data.deleted_median_days === null ? "—" : an.deletedMedianValue(data.deleted_median_days)}
            />
            <MetricCard
              wide
              label={an.deletedFirstWeek}
              value={rate(format, data.deleted_first_week)}
              info={an.deletedFirstWeekInfo}
            />
          </div>
          <BarList
            title={an.deletedTop}
            shares={false}
            items={data.deleted_top.map((row) => ({ key: row.key, label: row.name, value: row.habits }))}
            onPress={(item) => onOpenPeople({ metric: "deleted_topic", arg: item.key, title: `${an.deletedTop}: ${item.label}` })}
          />
        </div>
      </Block>

      <Block title={an.streaksHeading} info={an.streaksInfo}>
        <div className={styles.stack}>
          <Card>
            <ul className={styles.changes}>
              {[
                [7, data.streak_7],
                [30, data.streak_30],
                [100, data.streak_100],
              ].map(([days, count]) => (
                <li key={days} className={styles.change}>
                  <button
                    type="button"
                    className={styles.sortButton}
                    style={{ textAlign: "left" }}
                    onClick={() => onOpenPeople({ metric: "streak_min", arg: String(days), title: an.contentLine(count, days) })}
                  >
                    {an.contentLine(count, days)}
                  </button>
                </li>
              ))}
              <li className={styles.change}>{an.longestStreak(data.longest_streak)}</li>
            </ul>
          </Card>
          <BarList
            title={an.streaksCurrent}
            items={bucketItems(data.streaks_current, an.streakBucket)}
            onPress={(item) => onOpenPeople({ metric: "streak_current", arg: item.key, title: `${an.streaksCurrent}: ${item.label}` })}
          />
          <BarList
            title={an.streaksBest}
            items={bucketItems(data.streaks_best, an.streakBucket)}
            onPress={(item) => onOpenPeople({ metric: "streak_best", arg: item.key, title: `${an.streaksBest}: ${item.label}` })}
          />
        </div>
      </Block>

      <Block
        title={an.completionHeading}
        info={an.completionInfo}
        footnote={worst >= 0 ? an.worstWeekday(an.weekdays[worst]) : undefined}
      >
        <div className={styles.stack} style={habitColorStyle(TEAL)}>
          <SeriesCard
            title={an.completionByDay}
            isRate
            values={data.completion_days.map((day) => day.value)}
            dates={data.completion_days.map((day) => day.date)}
            summary={{ value: rate(format, data.completion.value), note: period }}
          />
          <WeekdayBars title={an.completionByWeekday} values={data.completion_weekdays} labels={an.weekdays} />
        </div>
      </Block>

      <Block title={an.hoursHeading} info={an.hoursInfo}>
        <HourColumns title={an.hoursHeading} values={data.checkin_hours} />
      </Block>

      <Block title={an.featuresHeading} footnote={an.featuresFooter(data.app_users)}>
        <BarList
          title={an.featuresHeading}
          items={data.features.map((feature) => ({
            key: feature.key,
            label: an.features[feature.key] ?? feature.key,
            value: feature.users,
            share: data.app_users ? feature.users / data.app_users : null,
          }))}
          onPress={(item) => onOpenPeople({ metric: "feature", arg: item.key, title: item.label })}
        />
      </Block>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  6. Источники и аудитория                                                */
/* ------------------------------------------------------------------------ */

export function SourcesSection({ filter, onOpenPeople, onOpenLinks }: SectionProps) {
  const resource = useSection("sources", filter);
  return (
    <Loaded resource={resource}>
      {(data) => <Sources data={data} onOpenPeople={onOpenPeople} onOpenLinks={onOpenLinks} />}
    </Loaded>
  );
}

function Sources({
  data,
  onOpenPeople,
  onOpenLinks,
}: {
  data: AnalyticsSections["sources"];
  onOpenPeople: SectionProps["onOpenPeople"];
  onOpenLinks: () => void;
}) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const an = strings.an;
  const period = an.periodNote[data.meta.period] ?? "";
  const people = (metric: string, label: (key: string) => string) => (item: BarItem) =>
    onOpenPeople({ metric, arg: item.key, title: `${label(item.key)} — ${an.cohortNote(period).toLowerCase()}` });

  return (
    <div style={habitColorStyle(BLUE)}>
      <Card>
        <ListItem label={an.makeLink} accent onPress={onOpenLinks} />
      </Card>

      <div className={styles.content}>
        <Block title={an.sourcesHeading} info={an.sourcesInfo}>
          <DataTable
            title={`${an.sourcesHeading} · ${an.cohortNote(period)}`}
            rows={data.rows}
            rowKey={(row) => `${row.source}:${row.tag ?? ""}`}
            initialSort="new"
            rowClassName={(row) => (row.tag ? styles.subRow : undefined)}
            onRowPress={(row) =>
              onOpenPeople({
                metric: "source",
                arg: row.tag ? `${row.source}:${row.tag}` : row.source,
                title: `${an.sourceWithTag(row.source, row.tag)} — ${an.cohortNote(period).toLowerCase()}`,
              })
            }
            columns={[
              { key: "source", label: an.sourceColumn, value: (row) => an.sourceWithTag(row.source, row.tag) },
              { key: "new", label: an.columnNew, value: (row) => row.new_users, display: (row) => format.count(row.new_users) },
              { key: "opened", label: an.columnOpened, value: (row) => row.opened_rate, display: (row) => rate(format, row.opened_rate) },
              {
                key: "activated",
                label: an.columnActivated,
                value: (row) => row.activated_rate,
                display: (row) => rate(format, row.activated_rate),
              },
              { key: "d7", label: an.columnD7, value: (row) => row.d7_rate, display: (row) => rate(format, row.d7_rate) },
              { key: "live", label: an.columnLive, value: (row) => row.live, display: (row) => format.count(row.live) },
            ]}
          />
        </Block>

        <Block title={an.platformsHeading}>
          <div className={styles.stack}>
            <BarList
              title={an.platformsHeading}
              items={bucketItems(data.platforms, (key) => an.platformNames[key] ?? key)}
              onPress={people("platform", (key) => an.platformNames[key] ?? key)}
            />
            <BarList
              title={an.devicesHeading}
              items={bucketItems(data.devices, (key) => an.devices[key] ?? key)}
              onPress={people("device", (key) => an.devices[key] ?? key)}
            />
          </div>
        </Block>

        <Block title={an.languagesHeading}>
          <div className={styles.stack}>
            <BarList
              title={an.languagesHeading}
              items={bucketItems(data.languages, (key) => an.languages[key] ?? key)}
              onPress={people("language", (key) => an.languages[key] ?? key)}
            />
            <BarList
              title={an.timezonesHeading}
              items={data.timezones.map((zone) => ({ key: zone.key, label: zone.name, value: zone.users }))}
              onPress={(item) => onOpenPeople({ metric: "timezone", arg: item.key, title: item.label })}
            />
          </div>
        </Block>

        <Block title={an.webGuestsHeading} footnote={an.webGoogleNote}>
          <BarList
            title={an.webGuestsHeading}
            shares={false}
            items={[
              { key: "web_users", label: an.webUsers, value: data.web_users },
              { key: "web_linked", label: an.webLinked, value: data.web_linked },
              { key: "guests", label: an.webGuests, value: data.web_users - data.web_linked },
            ]}
            onPress={(item) =>
              item.key !== "guests" ? onOpenPeople({ metric: item.key, title: `${item.label} ${period}` }) : undefined
            }
          />
        </Block>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  7. Напоминания и рассылки                                               */
/* ------------------------------------------------------------------------ */

export function MessagingSection({ filter, onOpenPeople }: SectionProps) {
  const resource = useSection("messaging", filter);
  return <Loaded resource={resource}>{(data) => <Messaging data={data} onOpenPeople={onOpenPeople} />}</Loaded>;
}

function Messaging({ data, onOpenPeople }: { data: AnalyticsSections["messaging"]; onOpenPeople: SectionProps["onOpenPeople"] }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const an = strings.an;
  const tracking = useTrackingNote(data.meta);
  const period = an.periodNote[data.meta.period] ?? "";

  return (
    <div style={habitColorStyle(TEAL)}>
      <Block title={an.remindersHeading} tracking={tracking}>
        <div className={styles.grid}>
          <MetricCard label={an.sentTelegram} value={format.count(data.reminders_telegram)} />
          <MetricCard label={an.sentPush} value={format.count(data.reminders_push)} />
          <MetricCard label={an.notDelivered} value={format.count(data.reminders_failed)} />
          <MetricCard label={an.followed} value={rate(format, data.reminders_followed)} info={an.followedInfo} />
          <MetricCard
            label={an.openedFromReminder}
            value={format.count(data.reminder_open_users)}
            note={an.people(data.reminder_open_users)}
            onPress={() => onOpenPeople({ metric: "reminder_openers", title: `${an.openedFromReminder} ${period}` })}
          />
          <MetricCard label={an.openedFromPush} value={format.count(data.push_opens)} />
        </div>
      </Block>

      <Block title={an.compareHeading} info={an.compareInfo}>
        <Card>
          <PairsTable
            head={["", an.liveShare, an.d7Share]}
            rows={[
              { label: `${an.withReminders} (${format.count(data.with_reminders)})`, left: rate(format, data.live_with), right: rate(format, data.d7_with) },
              {
                label: `${an.withoutReminders} (${format.count(data.without_reminders)})`,
                left: rate(format, data.live_without),
                right: rate(format, data.d7_without),
              },
            ]}
          />
          <ListItem label={an.withReminders} onPress={() => onOpenPeople({ metric: "reminders_with", title: an.withReminders })}>
            <span>{format.count(data.with_reminders)}</span>
          </ListItem>
          <ListItem label={an.withoutReminders} onPress={() => onOpenPeople({ metric: "reminders_without", title: an.withoutReminders })}>
            <span>{format.count(data.without_reminders)}</span>
          </ListItem>
        </Card>
      </Block>

      <Block title={an.broadcastsHeading}>
        <TableCard
          title={an.broadcastsHeading}
          data={{
            columns: ["id", strings.tableDate, an.broadcastsHeading, "sent", an.opened24, an.opened72, an.checked72, an.blocked24, an.buttonOpens],
            rows: data.broadcasts.map((item) => [
              item.id,
              item.created_at,
              item.text,
              item.sent,
              item.opened_24h,
              item.opened_72h,
              item.checked_72h,
              item.blocked_24h,
              item.button_opens,
            ]),
          }}
        >
          {data.broadcasts.length === 0 ? (
            <p className={styles.empty}>{an.broadcastsEmpty}</p>
          ) : (
            data.broadcasts.map((item) => {
              const open = (metric: string, label: string) => () =>
                onOpenPeople({ metric, arg: String(item.id), title: `${label} · ${format.date(item.created_at)}` });
              return (
                <div key={item.id} className={styles.broadcast}>
                  <p className={styles.broadcastText}>
                    {item.text ?? (item.media_type ? an.mediaBroadcast[item.media_type] : "—")}
                  </p>
                  <p className={styles.broadcastMeta}>
                    {format.dateTime(item.created_at)} · {an.broadcastDelivered(item.sent, item.total)}
                  </p>
                  {item.tracked ? (
                    <div className={styles.chipsRow}>
                      <button type="button" className={styles.statChip} onClick={open("broadcast_opened", an.opened72)}>
                        {an.opened24} <strong>{format.count(item.opened_24h)}</strong>
                      </button>
                      <button type="button" className={styles.statChip} onClick={open("broadcast_opened", an.opened72)}>
                        {an.opened72} <strong>{format.count(item.opened_72h)}</strong>
                      </button>
                      <button type="button" className={styles.statChip} onClick={open("broadcast_checked", an.checked72)}>
                        {an.checked72} <strong>{format.count(item.checked_72h)}</strong>
                      </button>
                      <button type="button" className={`${styles.statChip} ${item.blocked_24h ? styles.bad : ""}`} onClick={open("broadcast_blocked", an.blocked24)}>
                        {an.blocked24} <strong>{format.count(item.blocked_24h)}</strong>
                      </button>
                      {item.button ? (
                        <span className={styles.statChip}>
                          {an.buttonOpens} <strong>{format.count(item.button_opens)}</strong>
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className={styles.broadcastMeta}>{an.broadcastUntracked}</p>
                  )}
                </div>
              );
            })
          )}
        </TableCard>
      </Block>

      <Block title={an.offerHeading} info={an.offerInfo}>
        <div className={styles.grid}>
          <MetricCard
            label={an.offerShown}
            value={format.count(data.offer_shown)}
            onPress={() => onOpenPeople({ metric: "offer_shown", title: `${an.offerHeading}: ${an.offerShown.toLowerCase()}` })}
          />
          <MetricCard label={an.offerClicked} value={format.count(data.offer_clicked)} note={tracking ?? undefined} />
          <MetricCard
            wide
            label={an.offerInstalled}
            value={format.count(data.offer_installed)}
            note={data.offer_shown ? format.percent(data.offer_installed / data.offer_shown) : undefined}
            onPress={() => onOpenPeople({ metric: "offer_installed", title: `${an.offerHeading}: ${an.offerInstalled.toLowerCase()}` })}
          />
        </div>
      </Block>

      <Block title={an.promptHeading}>
        <div className={styles.grid}>
          <MetricCard label={an.promptShown} value={format.count(data.prompt_shown)} />
          <MetricCard label={an.promptAccepted} value={format.count(data.prompt_accepted)} />
          <MetricCard wide label={an.promptInstalled} value={format.count(data.prompt_installed)} />
        </div>
      </Block>
    </div>
  );
}
