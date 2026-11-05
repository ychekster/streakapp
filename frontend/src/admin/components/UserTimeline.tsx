/**
 * Лента действий пользователя в профиле, страницами: открыл страницу (с какого устройства,
 * по какой метке) → выбрал «Установить» → пришёл → открыл приложение (откуда) → создал
 * «Читать 10 страниц» → отметил → … → заблокировал бота. По ней видно поведение конкретного
 * человека с первого клика. Справа от заголовка — порядок: «Сначала новые» или «С самого
 * начала».
 */

import { useCallback, useEffect, useState } from "react";

import { fetchTimeline } from "../../api/admin";
import { useAdminFormat } from "../adminFormat";
import { useAdminStrings, type AdminStrings } from "../adminStrings";
import { LoadMore } from "./LoadMore";
import { ListItem } from "../../components/ListItem";
import { Card, Section } from "../../components/Section";
import type { TimelineItem, TimelineOrder } from "../../types/admin";
import styles from "./UserTimeline.module.css";

/** Шаг страницы установки или приложения (`detail` — «платформа|браузер|метка|приложение»,
 *  backend/analytics/profile.event_item): «Открыли страницу (iPhone, встроенный браузер
 *  Threads, метка threads)». */
export function describeEvent(item: TimelineItem, strings: AdminStrings): string {
  const base = strings.webFunnelSteps[item.kind] ?? item.kind;
  const [platform, context, source, app] = (item.detail ?? "").split("|");
  const parts = [
    platform ? (strings.an.devices[platform] ?? platform) : "",
    context ? [strings.eventContexts[context] ?? context, app].filter(Boolean).join(" ") : app ?? "",
    source && source !== "direct" ? strings.eventSource(source) : "",
  ].filter(Boolean);
  return parts.length > 0 ? `${base} (${parts.join(", ")})` : base;
}

/** Строка ленты на языке панели. */
function describe(item: TimelineItem, strings: AdminStrings): string {
  const an = strings.an;
  if (!(item.kind in an.timeline) && item.kind in strings.webFunnelSteps) {
    return describeEvent(item, strings);
  }
  const base = an.timeline[item.kind] ?? item.kind;
  const detail = item.detail ?? "";
  if (item.kind === "joined") {
    const [source, tag] = detail.split(":");
    return `${base}: ${an.sourceWithTag(source || "direct", tag ?? null)}`;
  }
  if (item.kind === "app_open") {
    return detail && an.openFrom[detail] ? `${base} ${an.openFrom[detail]}` : base;
  }
  if (item.kind === "settings" && detail) {
    const names = Array.from(new Set(detail.split(",").map((name) => an.settingsNames[name] ?? name)));
    return `${base}: ${names.join(", ")}`;
  }
  const habit = item.habit ? ` «${item.habit}»` : "";
  if (item.kind === "reminder_sent" || item.kind === "reminder_failed") {
    const what = item.habit ? habit : ` «${an.features.checkin_reminder}»`;
    return `${base}${what}${detail ? ` (${an.channel[detail] ?? detail})` : ""}`;
  }
  return `${base}${habit}`;
}

export function UserTimeline({ telegramId }: { telegramId: number }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [next, setNext] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [order, setOrder] = useState<TimelineOrder>("new");

  const load = useCallback(
    (offset: number) => {
      setLoading(true);
      setFailed(false);
      fetchTimeline(telegramId, offset, order)
        .then((page) => {
          setItems((current) => (offset === 0 ? page.items : [...current, ...page.items]));
          setNext(page.next_offset);
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    },
    [telegramId, order],
  );

  useEffect(() => load(0), [load]);

  return (
    <Section
      title={strings.an.timelineHeading}
      action={
        <button
          type="button"
          className={styles.order}
          onClick={() => {
            setItems([]);
            setOrder(order === "new" ? "old" : "new");
          }}
        >
          {order === "new" ? strings.timelineOrderOld : strings.timelineOrderNew}
        </button>
      }
    >
      <Card>
        {items.length === 0 ? (
          <ListItem label={loading ? strings.loading : failed ? strings.an.timelineFailed : strings.an.timelineEmpty} />
        ) : (
          items.map((item, index) => (
            <ListItem key={`${item.at}-${item.kind}-${index}`} alignTop>
              <span className={styles.item}>
                <span className={styles.text}>{describe(item, strings)}</span>
                <span className={styles.time}>{format.dateTime(item.at)}</span>
              </span>
            </ListItem>
          ))
        )}
      </Card>
      {items.length > 0 ? (
        <LoadMore
          hasMore={next !== null}
          loading={loading}
          failed={failed}
          onLoad={() => (next !== null ? load(next) : undefined)}
          loadingLabel={strings.loading}
          failedLabel={strings.an.timelineFailed}
          retryLabel={strings.retry}
        />
      ) : null}
    </Section>
  );
}
