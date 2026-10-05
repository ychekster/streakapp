/**
 * Данные раздела аналитики под фильтром. Ответы запоминаются на время сеанса: при
 * возврате к разделу или фильтру прежние цифры видны сразу и тихо обновляются.
 */

import { fetchAnalyticsSection } from "../../api/admin";
import { useAdminFormat } from "../adminFormat";
import { useAdminStrings } from "../adminStrings";
import { useResource, type Resource } from "../../hooks/useResource";
import type {
  AnalyticsFilter,
  AnalyticsMeta,
  AnalyticsSection,
  AnalyticsSections,
  RetentionBasis,
  RetentionCompare,
} from "../../types/admin";

const cache = new Map<string, unknown>();

export function useSection<S extends AnalyticsSection>(
  section: S,
  filter: AnalyticsFilter,
  options: { basis?: RetentionBasis; compare?: RetentionCompare } = {},
): Resource<AnalyticsSections[S]> {
  const key = [section, filter.period, filter.platform ?? "", filter.source ?? "", options.basis ?? "", options.compare ?? ""].join("|");
  return useResource(
    () =>
      fetchAnalyticsSection(section, filter, options).then((data) => {
        cache.set(key, data);
        return data;
      }),
    key,
    (cache.get(key) as AnalyticsSections[S] | undefined) ?? null,
  );
}

/** «Данные собираются с …», если сбор начался позже начала периода; иначе null. */
export function useTrackingNote(meta: AnalyticsMeta | undefined): string | null {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  if (!meta?.tracking_since) {
    return null;
  }
  const since = meta.tracking_since.slice(0, 10);
  if (meta.start !== null && since <= meta.start) {
    return null;
  }
  return strings.an.collectingSince(format.date(meta.tracking_since));
}
