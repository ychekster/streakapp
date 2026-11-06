/**
 * Экран статистики привычки — открывается кнопкой «Статистика» в «Основном» экрана
 * привычки. Всё считается на устройстве из истории привычки (data/habitStats.ts), по дню
 * отметки из «Вида сетки». Текста — минимум: заголовки разделов и подписи цифр.
 *
 *  - «Этот месяц» — одна карточка с цифрами и стрелкой к тем же дням прошлого месяца
 *    (StatDelta): у «Цели по времени» и «несколько раз в день» — минуты (повторения) и в
 *    среднем за день с отметкой, у остальных — выполнено и выполнение (%; у «Гибкого
 *    графика» — только выполнено);
 *  - «За всё время» (время, повторения) — «Всего» («24 / 100 мин», переехало сюда из
 *    «Основного») и рекорд за день;
 *  - «Динамика» — счёт привычки (растёт, пока её выполняют, падает от пропусков — см.
 *    habitStats.trend) сплошной линией с острыми углами за месяц (со дня после «месяц назад»),
 *    3 месяца или год (капсулы над ней), шкала — по видимым значениям; над ней значение
 *    последней точки целым числом, палец на графике — значение и дата выбранной;
 *  - «Недельный паттерн» — столбики выполнения по дням недели (палец — значение над
 *    столбиком), «i» рядом объясняет, что они значат;
 *  - «Итоги по дням» — крупное кольцо с долей выполненных в центре, под ним плитки:
 *    выполнено, частично (только со счётом), пропущено, заморожено (у «Гибкого графика»
 *    нет пропусков — круга нет).
 * Дни недели и круг — с первого дня привычки, по тем дням, что уже есть.
 */

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { BarChart } from "../components/charts/BarChart";
import { LineChart } from "../components/charts/LineChart";
import { PieChart, type PieSlice } from "../components/charts/PieChart";
import { localDate } from "../components/DateField";
import { useGridView } from "../components/gridLayout";
import { shortDate, timesStat, timeStat } from "../components/HabitSummary";
import { InfoTip } from "../components/InfoTip";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { StatDelta } from "../components/StatDelta";
import { WEEKDAYS } from "../constants";
import {
  bestDay,
  dayBreakdown,
  monthTotals,
  statsKind,
  trend,
  weekdayRates,
  type StatsKind,
  type StatsRange,
  type Totals,
} from "../data/habitStats";
import { useLanguage, useStrings } from "../preferences";
import type { Strings } from "../strings";
import { habitColorStyle } from "../theme";
import type { Habit } from "../types/habit";
import habitStyles from "./HabitScreen.module.css";
import styles from "./HabitStatsScreen.module.css";

const RANGES: StatsRange[] = ["month", "quarter", "year"];

/** Значение графика или карточки: минуты, повторения, отметки или %. */
function formatValue(kind: StatsKind, value: number, strings: Strings): string {
  if (kind === "time") {
    return strings.durationMinutes(value);
  }
  return kind === "check" ? `${value}%` : String(value);
}

/** Минуты из секунд (time) или как есть. */
function amountOf(kind: StatsKind, amount: number): number {
  return kind === "time" ? Math.floor(amount / 60) : amount;
}

/** Среднее за день с отметкой, null — таких дней нет. */
function averageOf(kind: StatsKind, totals: Totals): number | null {
  return totals.activeDays > 0 ? Math.round(amountOf(kind, totals.amount) / totals.activeDays) : null;
}

/** Выполнение (%), null — не было дней по расписанию. */
function rateOf(totals: Totals): number | null {
  return totals.due > 0 ? Math.round((totals.done / totals.due) * 100) : null;
}

interface Figure {
  value: string | number;
  label: string;
  delta?: ReactNode;
}

/** Карточка из цифр в ряд, через тонкий разделитель: значение (и стрелка), под ним подпись. */
function Figures({ items }: { items: Figure[] }) {
  return (
    <div className={styles.figures}>
      {items.map((item) => (
        <div key={item.label} className={styles.figure}>
          <p className={styles.figureValue}>
            {item.value}
            {item.delta}
          </p>
          <p className={styles.figureLabel}>{item.label}</p>
        </div>
      ))}
    </div>
  );
}

interface HabitStatsScreenProps {
  habit: Habit;
}

export function HabitStatsScreen({ habit }: HabitStatsScreenProps) {
  const strings = useStrings();
  const language = useLanguage();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // День отметки ещё неизвестен (нет настроек) — сегодня на устройстве.
  const day = useGridView().day ?? localDate();
  const kind = statsKind(habit);
  const [range, setRange] = useState<StatsRange>("month");
  // Проявление графика — только при смене периода, не при открытии экрана.
  const [rangeSwitched, setRangeSwitched] = useState(false);
  const [point, setPoint] = useState<number | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);

  const month = useMemo(() => monthTotals(habit, day), [habit, day]);
  const best = useMemo(() => bestDay(habit, day), [habit, day]);
  const line = useMemo(() => trend(habit, day, range), [habit, day, range]);
  const rates = useMemo(() => weekdayRates(habit, day), [habit, day]);
  const breakdown = useMemo(() => dayBreakdown(habit, day), [habit, day]);
  const { current, previous } = month;
  const counts = kind === "time" || kind === "times";

  const monthFigures: Figure[] = counts
    ? [
        {
          value: formatValue(kind, amountOf(kind, current.amount), strings),
          label: kind === "time" ? strings.statsMinutes : strings.statsTimes,
          delta: (
            <StatDelta
              current={amountOf(kind, current.amount)}
              previous={previous ? amountOf(kind, previous.amount) : null}
              kind="count"
            />
          ),
        },
        {
          value: formatValue(kind, averageOf(kind, current) ?? 0, strings),
          label: strings.statsAverage,
          delta: (
            <StatDelta
              current={averageOf(kind, current) ?? 0}
              previous={previous ? averageOf(kind, previous) : null}
              kind="count"
            />
          ),
        },
      ]
    : [
        {
          value: current.amount,
          label: strings.statsDone,
          delta: <StatDelta current={current.amount} previous={previous?.amount ?? null} kind="count" />,
        },
        ...(kind === "check"
          ? [
              {
                value: rateOf(current) === null ? "—" : `${rateOf(current)}%`,
                label: strings.statsRate,
                delta:
                  rateOf(current) === null ? null : (
                    <StatDelta
                      current={rateOf(current) ?? 0}
                      previous={previous ? rateOf(previous) : null}
                      kind="rate"
                    />
                  ),
              },
            ]
          : []),
      ];

  const labels = line.dates.map((date) => shortDate(date, language));
  let lastKnown: number | null = null;
  line.values.forEach((value, index) => {
    if (value !== null) {
      lastKnown = index;
    }
  });
  const shownPoint = point ?? lastKnown;
  const shownValue = shownPoint === null ? null : line.values[shownPoint];

  // «Частично» — только у привычек со счётом (раз в день его не бывает): плиток три или четыре.
  const slices: PieSlice[] = (["done", "partial", "missed", "frozen"] as const)
    .filter((tone) => tone !== "partial" || counts || breakdown.partial > 0)
    .map((tone) => ({
      key: tone,
      label: strings.statsSlices[tone],
      value: breakdown[tone],
      tone,
    }));

  return (
    <Screen title={habit.name} titleAnchorRef={headingRef} withTabBar={false}>
      <div className={habitStyles.enter} style={habitColorStyle(habit.color)}>
        <Section title={strings.statsMonthHeading} headingRef={headingRef}>
          <Card>
            <Figures items={monthFigures} />
          </Card>
        </Section>

        {counts ? (
          <Section title={strings.statsAllTimeHeading}>
            <Card>
              <Figures
                items={[
                  {
                    value: kind === "time" ? timeStat(habit, day, strings) : timesStat(habit, day),
                    label: strings.statsTotal,
                  },
                  {
                    value: best ? formatValue(kind, amountOf(kind, best.amount), strings) : "—",
                    label: best
                      ? strings.statsBestDayOn(shortDate(best.date, language))
                      : strings.statsBestDay,
                  },
                ]}
              />
            </Card>
          </Section>
        ) : null}

        <Section
          title={strings.statsTrendHeading}
          hint={
            <InfoTip
              label={strings.statsTrendInfoLabel}
              text={
                kind === "flexible"
                  ? strings.statsTrendInfoFlexible
                  : counts
                    ? strings.statsTrendInfoAmount
                    : strings.statsTrendInfo
              }
            />
          }
        >
          <Card padded>
            <div className={styles.chartCard}>
              <div
                className={styles.pills}
                role="group"
                aria-label={strings.statsTrendHeading}
                style={
                  {
                    "--pill-count": RANGES.length,
                    "--pill-index": RANGES.indexOf(range),
                  } as CSSProperties
                }
              >
                <span className={styles.pillThumb} aria-hidden="true" />
                {RANGES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={styles.pill}
                    aria-pressed={option === range}
                    onClick={() => {
                      setRange(option);
                      setRangeSwitched(true);
                      setPoint(null);
                    }}
                  >
                    {strings.statsRanges[option]}
                  </button>
                ))}
              </div>
              <p className={styles.chartValue}>
                {/* Нетронутый график — целое; выбранный день — как есть (0,5, а не 1). */}
                {shownValue === null
                  ? "—"
                  : point === null
                    ? Math.round(shownValue)
                    : shownValue.toLocaleString(language === "ru" ? "ru-RU" : "en-US", {
                        maximumFractionDigits: 2,
                      })}
                {point !== null ? <span className={styles.chartDate}>{labels[point]}</span> : null}
              </p>
              {/* Другой период — график проявляется заново, а не подменяется рывком. */}
              <div key={range} className={rangeSwitched ? styles.chartSwap : undefined}>
                <LineChart
                  values={line.values}
                  labels={labels}
                  fit
                  tickCount={3}
                  formatTick={String}
                  selected={point}
                  onSelect={setPoint}
                  label={strings.statsTrendHeading}
                />
              </div>
            </div>
          </Card>
        </Section>

        <Section
          title={strings.statsWeekdaysHeading}
          hint={
            <InfoTip
              label={strings.statsWeekdaysInfoLabel}
              text={
                kind === "flexible" ? strings.statsWeekdaysInfoFlexible : strings.statsWeekdaysInfo
              }
            />
          }
        >
          <Card padded>
            <div className={styles.chartCard}>
              <BarChart
                values={rates}
                labels={WEEKDAYS.map((key) => strings.weekdays[key].short)}
                max={100}
                formatTick={(value) => `${value}%`}
                selected={weekday}
                onSelect={setWeekday}
                label={strings.statsWeekdaysHeading}
              />
            </div>
          </Card>
        </Section>

        {kind !== "flexible" ? (
          <Section title={strings.statsDaysHeading}>
            <Card padded>
              <div className={styles.chartCard}>
                <PieChart
                  slices={slices}
                  centerLabel={strings.statsPieCenter}
                  label={strings.statsDaysHeading}
                />
              </div>
            </Card>
          </Section>
        ) : null}
      </div>
    </Screen>
  );
}
