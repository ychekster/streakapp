/**
 * Вкладка «Аналитика» админ-панели — главный экран: только основное, без фильтров и
 * пояснений, читается с одного взгляда.
 *
 *  - Живые — сколько людей пользуются приложением (определение — backend/analytics/
 *    data.py, Dataset.is_live) и изменение к неделе назад; все пользователи полосой:
 *    живые, перестали, без привычек; график живых по дням;
 *  - Пришли — сегодня, вчера, за 7 и 30 дней, всего; график новых по дням;
 *  - Где пользуются — Telegram, веб-приложение, оба, только бот (полоса долей); в
 *    веб-приложении — вошли через Telegram или без входа;
 *  - Заходят — сейчас, сегодня, за 7 и 30 дней; за неделю в Telegram и в веб-приложении;
 *    отметили привычки сегодня; не заходят больше 2 недель; график по дням;
 *  - Привычки — сколько людей с привычками и сколько привычек всего;
 *  - Подробная аналитика — разделы (воронка, удержание…) открываются отдельными экранами
 *    поверх (AnalyticsScreen) со своим фильтром.
 *
 * Любая цифра про людей нажимается: открывается список этих людей (группа «overview» на
 * сервере, backend/analytics/overview.py), оттуда — рассылка именно им. Администраторы и
 * тестовые аккаунты в цифры не входят.
 */

import type { CSSProperties } from "react";

import { useAdminFormat } from "../adminFormat";
import { useAdminStrings } from "../adminStrings";
import { Disclosure } from "../../components/Disclosure";
import { ListItem } from "../../components/ListItem";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Section";
import { habitColorStyle } from "../../theme";
import type {
  AnalyticsFilter,
  AnalyticsOverview,
  AnalyticsSection,
  OverviewGroup,
  PeopleQuery,
} from "../../types/admin";
import { Block, MetricCard } from "./kit";
import { Loaded, SeriesCard } from "./Sections";
import { useSection } from "./useSection";
import styles from "./Analytics.module.css";
import overviewStyles from "./Overview.module.css";

/** Обзор — всегда все пользователи; этот же фильтр уходит в список людей за цифрой. */
export const OVERVIEW_FILTER: AnalyticsFilter = { period: "all", platform: null, source: null };

/** Разделы подробной аналитики — по порядку в списке. */
const DETAIL_SECTIONS: AnalyticsSection[] = [
  "summary",
  "funnel",
  "retention",
  "churn",
  "habits",
  "sources",
  "messaging",
];

interface OverviewScreenProps {
  onOpenPeople: (query: PeopleQuery, filter: AnalyticsFilter) => void;
  onOpenSection: (section: AnalyticsSection) => void;
}

export function OverviewScreen({ onOpenPeople, onOpenSection }: OverviewScreenProps) {
  const strings = useAdminStrings();
  const resource = useSection("overview", OVERVIEW_FILTER);
  return (
    <Screen title={strings.an.title}>
      <Loaded resource={resource}>
        {(data) => <Overview data={data} onOpenPeople={onOpenPeople} onOpenSection={onOpenSection} />}
      </Loaded>
    </Screen>
  );
}

function Overview({
  data,
  onOpenPeople,
  onOpenSection,
}: {
  data: AnalyticsOverview;
  onOpenPeople: OverviewScreenProps["onOpenPeople"];
  onOpenSection: OverviewScreenProps["onOpenSection"];
}) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const ov = strings.ov;
  const { counts } = data;
  const open = (group: OverviewGroup) => () =>
    onOpenPeople({ metric: "overview", arg: group, title: ov.people[group] }, OVERVIEW_FILTER);
  const share = (group: OverviewGroup) =>
    counts.all ? ov.ofAll(format.percent(counts[group] / counts.all)) : undefined;

  /** Ряд «подпись — число ›», открывает людей группы. */
  const row = (group: OverviewGroup, label: string, color?: string) => (
    <ListItem key={group} onPress={open(group)}>
      <span className={overviewStyles.rowLabel}>
        {color ? <span className={overviewStyles.dot} style={{ "--dot-rgb": `var(${color})` } as CSSProperties} /> : null}
        {label}
      </span>
      <span className={overviewStyles.trailing}>
        <span className={overviewStyles.rowValue}>{format.count(counts[group])}</span>
        <Disclosure />
      </span>
    </ListItem>
  );

  const telegramOnly = counts.telegram - counts.both;
  const webOnly = counts.web - counts.both;

  return (
    <div className={overviewStyles.overview}>
      <Block title={ov.aliveHeading}>
        <div className={styles.grid} style={habitColorStyle("green")}>
          <MetricCard
            wide
            label={ov.alive}
            value={format.count(counts.alive)}
            delta={{ current: counts.alive, previous: data.alive_week_ago, kind: "count", label: ov.weekAgo }}
            onPress={open("alive")}
          />
        </div>
        <div className={overviewStyles.gap}>
          <Card>
            <ShareBar
              label={ov.aliveHeading}
              segments={[
                { key: "alive", value: counts.alive, color: "--palette-green" },
                { key: "stopped", value: counts.stopped, color: "--palette-orange" },
                { key: "none", value: counts.without_habits, color: "--palette-graphite" },
              ]}
            />
            {row("alive", ov.alive, "--palette-green")}
            {row("stopped", ov.stopped, "--palette-orange")}
            {row("without_habits", ov.withoutHabits, "--palette-graphite")}
          </Card>
        </div>
        <div className={overviewStyles.chart} style={habitColorStyle("green")}>
          <SeriesCard
            title={ov.aliveChart}
            values={data.alive_by_day.map((day) => day.value)}
            dates={data.alive_by_day.map((day) => day.date)}
            summary={{ value: format.count(counts.alive), note: ov.today }}
          />
        </div>
      </Block>

      <Block title={ov.joinedHeading}>
        <div className={styles.grid} style={habitColorStyle("blue")}>
          <MetricCard label={ov.today} value={format.count(counts.new_today)} onPress={open("new_today")} />
          <MetricCard label={ov.yesterday} value={format.count(counts.new_yesterday)} onPress={open("new_yesterday")} />
          <MetricCard label={ov.week} value={format.count(counts.new_week)} onPress={open("new_week")} />
          <MetricCard label={ov.month} value={format.count(counts.new_month)} onPress={open("new_month")} />
          <MetricCard wide label={ov.totalUsers} value={format.count(counts.all)} onPress={open("all")} />
        </div>
        <div className={overviewStyles.chart} style={habitColorStyle("blue")}>
          <SeriesCard
            title={ov.newChart}
            values={data.new_by_day.map((day) => day.telegram + day.web)}
            dates={data.new_by_day.map((day) => day.date)}
            summary={{ value: format.count(counts.new_month), note: ov.last30 }}
          />
        </div>
      </Block>

      <Block title={ov.whereHeading}>
        <Card>
          <ShareBar
            label={ov.whereHeading}
            segments={[
              { key: "telegram", value: telegramOnly, color: "--palette-blue" },
              { key: "both", value: counts.both, color: "--palette-purple" },
              { key: "web", value: webOnly, color: "--palette-teal" },
              { key: "bot", value: counts.bot_only, color: "--palette-graphite" },
            ]}
          />
          {row("telegram", ov.telegram, "--palette-blue")}
          {row("web", ov.web, "--palette-teal")}
          {row("both", ov.both, "--palette-purple")}
          {row("bot_only", ov.botOnly, "--palette-graphite")}
        </Card>
        <h3 className={overviewStyles.subheading}>{ov.webHeading}</h3>
        <Card>
          {row("web_logged_in", ov.webLoggedIn)}
          {row("web_guests", ov.webGuests)}
        </Card>
      </Block>

      <Block title={ov.activeHeading}>
        <div className={styles.grid} style={habitColorStyle("green")}>
          <MetricCard label={ov.online} value={format.count(counts.online)} onPress={open("online")} />
          <MetricCard label={ov.activeToday} value={format.count(counts.active_today)} onPress={open("active_today")} />
          <MetricCard label={ov.activeWeek} value={format.count(counts.active_week)} onPress={open("active_week")} />
          <MetricCard label={ov.activeMonth} value={format.count(counts.active_month)} onPress={open("active_month")} />
        </div>
        <div className={overviewStyles.gap}>
          <Card>
            {row("telegram_week", ov.weekTelegram)}
            {row("web_week", ov.weekWeb)}
            {row("checked_today", ov.checkedToday)}
            {row("gone", ov.gone)}
          </Card>
        </div>
        <div className={overviewStyles.chart} style={habitColorStyle("green")}>
          <SeriesCard
            title={ov.activityChart}
            values={data.activity_by_day.map((day) => day.opened)}
            dates={data.activity_by_day.map((day) => day.date)}
            summary={{ value: format.count(counts.active_month), note: ov.last30 }}
          />
        </div>
      </Block>

      <Block title={ov.habitsHeading}>
        <div className={styles.grid} style={habitColorStyle("orange")}>
          <MetricCard
            label={ov.withHabits}
            value={format.count(counts.with_habits)}
            note={share("with_habits")}
            onPress={open("with_habits")}
          />
          <MetricCard label={ov.habitsTotal} value={format.count(data.habits)} />
        </div>
      </Block>

      <Block title={ov.moreHeading}>
        <Card>
          {DETAIL_SECTIONS.map((section) => (
            <ListItem key={section} label={ov.more[section]} onPress={() => onOpenSection(section)}>
              <Disclosure />
            </ListItem>
          ))}
        </Card>
      </Block>
    </div>
  );
}

/** Доли одной полосой над рядами карточки (цвета — как точки рядов). */
function ShareBar({
  label,
  segments,
}: {
  label: string;
  segments: { key: string; value: number; color: string }[];
}) {
  const total = Math.max(1, segments.reduce((sum, segment) => sum + segment.value, 0));
  return (
    <div className={overviewStyles.shareBar} role="img" aria-label={label}>
      {segments.map((segment) =>
        segment.value > 0 ? (
          <span
            key={segment.key}
            style={{ flexGrow: segment.value / total, "--dot-rgb": `var(${segment.color})` } as CSSProperties}
          />
        ) : null,
      )}
    </div>
  );
}
