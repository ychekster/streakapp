/**
 * Подробности цифры «Обзора» — экран поверх вкладки «Аналитика»: кто эти люди простыми
 * словами и из чего складывается группа (backend/analytics/overview.py, group_details).
 *
 *  - сколько человек и какая это доля от всех; пояснение, кого сюда считаем;
 *  - у живых — сколько за неделю стали живыми и сколько перестали;
 *  - график по дням (если у цифры он есть);
 *  - кто эти люди: где пользуются, откуда и когда пришли, сколько привычек, когда
 *    последний раз заходили и сколько дней отмечали за прошедшую неделю. Разбивка, где
 *    все люди в одной строке, не показывается — она ничего не говорит;
 *  - последней строкой — список этих людей.
 */

import { fetchOverviewGroup } from "../../api/admin";
import { useAdminFormat } from "../adminFormat";
import { useAdminStrings } from "../adminStrings";
import { Disclosure } from "../../components/Disclosure";
import { ListItem } from "../../components/ListItem";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Section";
import { useResource } from "../../hooks/useResource";
import { habitColorStyle } from "../../theme";
import type { AnalyticsOverviewGroup, Bucket, OverviewGroup } from "../../types/admin";
import { BarList, Block, MetricCard, type BarItem } from "./kit";
import { Loaded, SeriesCard } from "./Sections";
import styles from "./Analytics.module.css";
import overviewStyles from "./Overview.module.css";

/** Сколько источников показывать отдельно; остальные — одной строкой. */
const TOP_SOURCES = 5;

/** Разбивки по порядку на экране. */
const BREAKDOWNS = ["platforms", "sources", "joined", "habits", "last_seen", "checked"] as const;

const cache = new Map<OverviewGroup, AnalyticsOverviewGroup>();

interface OverviewGroupScreenProps {
  group: OverviewGroup;
  onOpenPeople: () => void;
}

export function OverviewGroupScreen({ group, onOpenPeople }: OverviewGroupScreenProps) {
  const strings = useAdminStrings();
  const resource = useResource(
    () =>
      fetchOverviewGroup(group).then((data) => {
        cache.set(group, data);
        return data;
      }),
    group,
    cache.get(group) ?? null,
  );
  return (
    <Screen title={strings.ov.people[group]} withTabBar={false} enterAnimation>
      <Loaded resource={resource}>{(data) => <Details data={data} onOpenPeople={onOpenPeople} />}</Loaded>
    </Screen>
  );
}

function Details({ data, onOpenPeople }: { data: AnalyticsOverviewGroup; onOpenPeople: () => void }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const ov = strings.ov;
  const an = strings.an;
  const color = habitColorStyle(data.group === "alive" ? "green" : "blue");

  function items(name: (typeof BREAKDOWNS)[number]): BarItem[] {
    if (name === "sources") {
      const top = data.sources.slice(0, TOP_SOURCES);
      const rest = data.sources.slice(TOP_SOURCES).reduce((sum, bucket) => sum + bucket.users, 0);
      const list: BarItem[] = top.map((bucket) => ({ key: bucket.key, label: an.sourceName(bucket.key), value: bucket.users }));
      return rest > 0 ? [...list, { key: "other", label: ov.otherSources, value: rest }] : list;
    }
    const labels = ov.bucket[name];
    return (data[name] as Bucket[])
      .filter((bucket) => bucket.users > 0)
      .map((bucket) => ({ key: bucket.key, label: labels[bucket.key] ?? bucket.key, value: bucket.users }));
  }

  // Разбивка, где все в одной строке, ничего не говорит — её не показываем.
  const breakdowns = BREAKDOWNS.map((name) => ({ name, items: items(name) })).filter(
    (breakdown) => breakdown.items.length > 1,
  );

  return (
    <div className={overviewStyles.overview}>
      <Block title={ov.groupWho} footnote={ov.explain[data.group]}>
        <div className={styles.grid} style={color}>
          <MetricCard
            wide
            label={ov.groupPeople}
            value={format.count(data.users)}
            note={data.all_users ? ov.ofAll(format.percent(data.users / data.all_users)) : undefined}
          />
        </div>
      </Block>

      {data.moves ? (
        <Block title={ov.groupMovesHeading} footnote={ov.groupMovesNote}>
          <Card>
            <ListItem label={ov.groupJoinedAlive}>
              <span className={overviewStyles.rowValue}>+{format.count(data.moves.joined)}</span>
            </ListItem>
            <ListItem label={ov.groupLeftAlive}>
              <span className={overviewStyles.rowValue}>−{format.count(data.moves.left)}</span>
            </ListItem>
          </Card>
        </Block>
      ) : null}

      {data.trend_kind && data.trend.length > 0 ? (
        <div style={color}>
          <SeriesCard
            title={ov.trend[data.trend_kind]}
            values={data.trend.map((day) => day.value)}
            dates={data.trend.map((day) => day.date)}
            summary={{ value: format.count(data.trend[data.trend.length - 1].value ?? 0), note: ov.today }}
          />
        </div>
      ) : null}

      {breakdowns.length > 0 ? (
        <Block title={ov.groupBreakdownHeading}>
          {breakdowns.map((breakdown, index) => (
            <div key={breakdown.name} className={index > 0 ? overviewStyles.gap : undefined}>
              <BarList title={ov.breakdown[breakdown.name]} items={breakdown.items} />
            </div>
          ))}
        </Block>
      ) : null}

      <Block title={ov.groupPeopleHeading}>
        <Card>
          <ListItem onPress={onOpenPeople} disabled={data.users === 0}>
            <span className={overviewStyles.rowLabel}>{ov.groupPeopleList}</span>
            <span className={overviewStyles.trailing}>
              <span className={overviewStyles.rowValue}>{format.count(data.users)}</span>
              <Disclosure />
            </span>
          </ListItem>
        </Card>
      </Block>
    </div>
  );
}
