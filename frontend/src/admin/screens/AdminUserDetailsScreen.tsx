/**
 * «Подробнее о пользователе» — экран поверх профиля: то, что не нужно с первого взгляда.
 *  - Активность — статус в аналитике (активен, ушёл, заблокировал бота, вероятно удалил
 *    веб-приложение), активирован ли, «живой» ли, серия, дни с отметками, выполнение за
 *    30 дней, последняя отметка, первое открытие приложения;
 *  - Настройки — язык и пояс;
 *  - История действий — лента (UserTimeline), новые сначала, страницами.
 */

import { fetchUser } from "../../api/admin";
import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { UserTimeline } from "../components/UserTimeline";
import { ListItem } from "../../components/ListItem";
import { Screen } from "../../components/Screen";
import { Card, Section } from "../../components/Section";
import { StatusMessage } from "../../components/StatusMessage";
import { useResource } from "../../hooks/useResource";
import { InfoRow } from "./AdminUserScreen";
import styles from "./AdminUserScreen.module.css";

interface AdminUserDetailsScreenProps {
  telegramId: number;
  /** Имя из профиля — для заголовка. */
  name: string;
}

export function AdminUserDetailsScreen({ telegramId, name }: AdminUserDetailsScreenProps) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const profile = useResource(() => fetchUser(telegramId), String(telegramId));

  return (
    <Screen title={name} withTabBar={false} enterAnimation>
      {renderContent()}
    </Screen>
  );

  function renderContent() {
    const data = profile.data;
    if (!data) {
      return profile.status === "error" ? (
        <StatusMessage
          icon="alert"
          title={strings.errorTitle}
          description={describeAdminError(strings, profile.error, strings.profileLoadFailed)}
          actionLabel={strings.retry}
          onAction={profile.reload}
        />
      ) : (
        <StatusMessage icon="spinner" title={strings.loading} />
      );
    }
    const an = strings.an;
    const ov = strings.ov;
    return (
      <div className={styles.profile}>
        <Section title={ov.activityHeading}>
          <Card>
            <ListItem label={an.profileStatus}>
              <span className={data.status === "active" ? undefined : styles.danger}>
                {an.statuses[data.status] ?? data.status}
              </span>
            </ListItem>
            <InfoRow label={an.activationLabel} value={an.activation(data.activated)} />
            <InfoRow label={an.liveLabel} value={data.live ? an.yes : an.no} />
            <InfoRow label={an.streakLabel} value={an.streakValue(data.current_streak, data.best_streak)} numeric />
            <InfoRow label={an.checkinDays} value={format.count(data.checkin_days)} numeric />
            <InfoRow
              label={an.completion30}
              value={data.completion_30d === null ? "—" : format.percent(data.completion_30d)}
              numeric
            />
            <InfoRow
              label={an.lastCheckin}
              value={data.last_checkin ? format.day(data.last_checkin) : strings.never}
            />
            <InfoRow
              label={strings.profileOpenedApp}
              value={data.app_opened_at ? format.date(data.app_opened_at) : strings.never}
            />
          </Card>
        </Section>

        <Section title={ov.settingsHeading}>
          <Card>
            <InfoRow
              label={strings.profileLanguage}
              value={strings.languageNames[data.language] ?? data.language}
            />
            <InfoRow label={strings.profileTimezone} value={data.timezone ?? strings.notSet} />
          </Card>
        </Section>

        <UserTimeline telegramId={data.telegram_id} />
      </div>
    );
  }
}
