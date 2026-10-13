/**
 * Раздел подробной аналитики — экран поверх «Обзора» (OverviewScreen): ключевые метрики,
 * воронка, удержание, отток и возврат, привычки, источники, напоминания и рассылки
 * (Sections.tsx). Администраторы и тестовые аккаунты в цифры не входят.
 *
 * Сверху — фильтр, общий для всех разделов: период (сегодня, 7, 30, 90 дней, всё время;
 * дни — по Алматы), платформа (все / Telegram / веб-приложение) и источник.
 *
 * Любая цифра про людей нажимается: открывается список этих людей (AdminPeopleScreen),
 * оттуда — рассылка именно им. Фильтр и вид удержания хранит AdminApp — в другом разделе
 * и при возврате они те же.
 */

import { useAdminStrings } from "../adminStrings";
import { ListGroup } from "../../components/ListGroup";
import { ListItem } from "../../components/ListItem";
import { MenuSelect } from "../../components/MenuSelect";
import { Screen } from "../../components/Screen";
import { ANALYTICS_PERIODS, PLATFORMS } from "../../constants";
import type {
  AnalyticsFilter,
  AnalyticsSection,
  PeopleQuery,
  RetentionBasis,
  RetentionCompare,
} from "../../types/admin";
import { Pills } from "./kit";
import {
  ChurnSection,
  FunnelSection,
  HabitsSection,
  MessagingSection,
  RetentionSection,
  SourcesSection,
  SummarySection,
} from "./Sections";
import { useSection } from "./useSection";
import styles from "./Analytics.module.css";

export interface AnalyticsView {
  filter: AnalyticsFilter;
  basis: RetentionBasis;
  compare: RetentionCompare;
}

interface AnalyticsScreenProps {
  section: AnalyticsSection;
  view: AnalyticsView;
  onViewChange: (view: AnalyticsView) => void;
  onOpenPeople: (query: PeopleQuery, filter: AnalyticsFilter) => void;
  onOpenLinks: () => void;
}

export function AnalyticsScreen({ section, view, onViewChange, onOpenPeople, onOpenLinks }: AnalyticsScreenProps) {
  const strings = useAdminStrings();
  const an = strings.an;
  const { filter } = view;
  // Источники для фильтра — из сводки за всё время (она же главный экран).
  const known = useSection("summary", { period: "all", platform: null, source: null });
  const sources = known.data?.meta.sources ?? [];
  const sourceOptions = [
    { value: "", label: an.sourceAll },
    ...Array.from(new Set([...sources, ...(filter.source ? [filter.source] : [])])).map((name) => ({
      value: name,
      label: an.sourceName(name),
    })),
  ];
  const setFilter = (patch: Partial<AnalyticsFilter>) =>
    onViewChange({ ...view, filter: { ...filter, ...patch } });
  const sectionProps = {
    filter,
    onOpenPeople: (query: PeopleQuery) => onOpenPeople(query, filter),
    onOpenLinks,
  };

  return (
    <Screen title={strings.ov.more[section] ?? an.title} withTabBar={false} enterAnimation>
      <div className={styles.filters}>
        <Pills
          label={an.periodLabel}
          value={filter.period}
          onChange={(period) => setFilter({ period })}
          options={ANALYTICS_PERIODS.map((period) => ({ value: period, label: an.periods[period] }))}
        />
        <ListGroup>
          <ListItem label={an.platform}>
            <MenuSelect
              options={[
                { value: "", label: an.platformAll },
                ...PLATFORMS.map((platform) => ({ value: platform, label: an.platformNames[platform] })),
              ]}
              value={filter.platform ?? ""}
              onChange={(value) => setFilter({ platform: value ? (value as AnalyticsFilter["platform"]) : null })}
              label={an.platform}
            />
          </ListItem>
          <ListItem label={an.source}>
            <MenuSelect
              options={sourceOptions}
              value={filter.source ?? ""}
              onChange={(value) => setFilter({ source: value || null })}
              label={an.source}
            />
          </ListItem>
        </ListGroup>
      </div>
      <div className={styles.content}>{renderSection()}</div>
    </Screen>
  );

  function renderSection() {
    switch (section) {
      case "summary":
        return <SummarySection {...sectionProps} />;
      case "funnel":
        return <FunnelSection {...sectionProps} />;
      case "retention":
        return (
          <RetentionSection
            {...sectionProps}
            basis={view.basis}
            onBasisChange={(basis) => onViewChange({ ...view, basis })}
            compare={view.compare}
            onCompareChange={(compare) => onViewChange({ ...view, compare })}
          />
        );
      case "churn":
        return <ChurnSection {...sectionProps} />;
      case "habits":
        return <HabitsSection {...sectionProps} />;
      case "sources":
        return <SourcesSection {...sectionProps} />;
      case "messaging":
        return <MessagingSection {...sectionProps} />;
      default:
        return null;
    }
  }
}
