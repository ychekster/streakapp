/**
 * Профиль пользователя — экран поверх вкладки (во весь экран, без нижней навигации).
 * Сверху — только основное, без пояснений:
 *  - кто это — id, @username, когда и откуда пришёл, когда был последний раз;
 *  - где пользуется — Telegram и веб-приложение (когда был там последний раз), вошёл ли
 *    в веб-приложение через Telegram, устройство, уведомления;
 *  - его привычки — названия и серии; нажатие открывает их так, как видит он сам
 *    (AdminUserHabitsScreen);
 *  - отзывы (если есть) — нажатие открывает отзыв, там можно ответить;
 *  - «Подробнее о пользователе» — сводка аналитики, настройки и история действий
 *    отдельным экраном (AdminUserDetailsScreen);
 *  - действия — «Написать сообщение» (бот пришлёт текст в Telegram), «Не учитывать в
 *    аналитике» (тестовый аккаунт), «Заблокировать» / «Разблокировать» и «Удалить».
 *    Блокировка и удаление — только после подтверждения системным диалогом Telegram;
 *    администратора нельзя ни заблокировать, ни удалить (сначала забирают права).
 *
 * После блокировки или удаления список пользователей обновляется (onChanged, onDeleted);
 * после удаления AdminApp возвращает на вкладку. Не удалось — причина под карточкой.
 */

import { useState } from "react";

import { deleteUser, fetchUser, fetchUserHabits, setUserBlocked, setUserTest } from "../../api/admin";
import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { BlockIcon, PaperPlaneIcon, UnlockIcon } from "../components/AdminIcons";
import { Disclosure } from "../../components/Disclosure";
import { ListItem } from "../../components/ListItem";
import { Screen } from "../../components/Screen";
import { Card, Section } from "../../components/Section";
import { TrashIcon } from "../../components/SettingsIcons";
import { StatusMessage } from "../../components/StatusMessage";
import { Switch } from "../../components/Switch";
import { useResource } from "../../hooks/useResource";
import { confirmAction, hapticNotification } from "../../telegram/webapp";
import { habitColorStyle } from "../../theme";
import type { AdminReview, AdminUserProfile, AdminUserRef } from "../../types/admin";
import { ReviewRow } from "./AdminReviewsScreen";
import styles from "./AdminUserScreen.module.css";

interface AdminUserScreenProps {
  telegramId: number;
  /** Уже известные имя и id (строка списка) — для заголовка, пока профиль грузится. */
  initial: AdminUserRef | null;
  onOpenReview: (review: AdminReview) => void;
  /** Открыть экран привычек этого пользователя. */
  onOpenHabits: () => void;
  /** Открыть «Подробнее о пользователе». */
  onOpenDetails: (name: string) => void;
  /** Открыть экран личного сообщения этому пользователю. */
  onWriteMessage: (name: string) => void;
  /** Профиль изменился (блокировка) — обновить список пользователей. */
  onChanged: (profile: AdminUserProfile) => void;
  /** Пользователь удалён (AdminApp возвращает на вкладку). */
  onDeleted: (telegramId: number) => void;
}

export function AdminUserScreen({
  telegramId,
  initial,
  onOpenReview,
  onOpenHabits,
  onOpenDetails,
  onWriteMessage,
  onChanged,
  onDeleted,
}: AdminUserScreenProps) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const profile = useResource(() => fetchUser(telegramId), String(telegramId));
  const habits = useResource(() => fetchUserHabits(telegramId), String(telegramId));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const data = profile.data;
  const name = data
    ? format.userName(data)
    : initial
      ? format.userName(initial)
      : strings.unnamedUser(telegramId);

  async function changeBlock(blocked: boolean): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await setUserBlocked(telegramId, blocked);
      profile.setData(() => updated);
      onChanged(updated);
      hapticNotification("success");
    } catch (error) {
      setActionError(describeAdminError(strings, error, strings.blockFailed));
      hapticNotification("error");
    } finally {
      setBusy(false);
    }
  }

  async function changeTest(isTest: boolean): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await setUserTest(telegramId, isTest);
      profile.setData(() => updated);
      onChanged(updated);
      hapticNotification("success");
    } catch (error) {
      setActionError(describeAdminError(strings, error, strings.blockFailed));
      hapticNotification("error");
    } finally {
      setBusy(false);
    }
  }

  async function askToBlock(): Promise<void> {
    setActionError(null);
    const confirmed = await confirmAction({
      title: strings.blockDialogTitle,
      message: strings.blockDialogMessage(name),
      confirmLabel: strings.blockDialogConfirm,
      cancelLabel: strings.cancel,
      destructive: true,
    });
    if (confirmed) {
      await changeBlock(true);
    }
  }

  async function askToDelete(): Promise<void> {
    setActionError(null);
    const confirmed = await confirmAction({
      title: strings.deleteDialogTitle,
      message: strings.deleteDialogMessage(name),
      confirmLabel: strings.deleteDialogConfirm,
      cancelLabel: strings.cancel,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      await deleteUser(telegramId);
      hapticNotification("success");
      // AdminApp закрывает этот экран — сбрасывать состояние не нужно.
      onDeleted(telegramId);
    } catch (error) {
      setActionError(describeAdminError(strings, error, strings.deleteFailed));
      setBusy(false);
      hapticNotification("error");
    }
  }

  return (
    <Screen title={name} withTabBar={false} enterAnimation>
      {renderContent()}
    </Screen>
  );

  function renderContent() {
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
    const device = data.device ? an.devices[data.device] ?? data.device : null;
    const seen = (moment: string | null, used: boolean): string =>
      moment ? format.relative(moment) : used ? an.yes : ov.notUsed;
    return (
      <div className={styles.profile}>
        <Section title={strings.profileHeading}>
          <Card>
            <InfoRow label={ov.profileId} value={String(data.telegram_id)} numeric />
            {data.username ? <InfoRow label={ov.profileUsername} value={`@${data.username}`} /> : null}
            <InfoRow label={ov.profileJoined} value={format.date(data.created_at)} />
            <InfoRow label={ov.profileSource} value={an.sourceWithTag(data.source, data.source_tag)} />
            <InfoRow
              label={ov.profileLastSeen}
              value={data.last_seen_at ? format.relative(data.last_seen_at) : strings.never}
            />
            {data.is_admin ? <InfoRow label={strings.profileStatus} value={strings.statusAdmin} /> : null}
            {data.blocked_at ? (
              <ListItem label={strings.profileStatus}>
                <span className={styles.danger}>{strings.statusBlocked}</span>
              </ListItem>
            ) : null}
          </Card>
        </Section>

        <Section title={ov.whereUses}>
          <Card>
            <InfoRow label={ov.telegram} value={seen(data.telegram_seen_at, data.uses_telegram)} />
            <InfoRow label={ov.web} value={seen(data.web_seen_at, data.uses_web)} />
            {data.uses_web ? (
              <InfoRow
                label={ov.webLogin}
                value={data.telegram_id > 0 ? ov.webLoginTelegram : ov.webLoginGuest}
              />
            ) : null}
            {device ? <InfoRow label={ov.device} value={device} /> : null}
            {data.telegram_id > 0 ? (
              data.bot_blocked_at ? (
                <ListItem label={ov.telegramNotifications}>
                  <span className={styles.danger}>{ov.botBlocked}</span>
                </ListItem>
              ) : (
                <InfoRow
                  label={ov.telegramNotifications}
                  value={data.telegram_notifications ? ov.on : ov.off}
                />
              )
            ) : null}
            {data.uses_web ? (
              <InfoRow label={ov.pushNotifications} value={data.push ? ov.on : ov.off} />
            ) : null}
          </Card>
        </Section>

        <Section title={ov.habitsHeading2(data.habits)}>
          <Card>
            {renderHabits()}
            {data.habits > 0 ? (
              <ListItem label={ov.openHabits} accent onPress={onOpenHabits}>
                <Disclosure />
              </ListItem>
            ) : null}
          </Card>
        </Section>

        {data.reviews.length > 0 ? (
          <Section title={strings.profileReviewsHeading}>
            <Card>
              {data.reviews.map((review) => (
                <ListItem key={review.id} alignTop onPress={() => onOpenReview(review)}>
                  <ReviewRow review={review} showAuthor={false} />
                </ListItem>
              ))}
            </Card>
          </Section>
        ) : null}

        <Section title={ov.detailsTitle}>
          <Card>
            <ListItem label={ov.details} onPress={() => onOpenDetails(name)}>
              <Disclosure />
            </ListItem>
          </Card>
        </Section>

        <Section
          title={strings.actionsHeading}
          footer={data.is_admin ? strings.adminNoActions : undefined}
        >
          <Card>
            <ListItem
              icon={<PaperPlaneIcon />}
              iconColor="blue"
              label={strings.sendMessage}
              onPress={() => onWriteMessage(name)}
            />
            <ListItem label={ov.testAccount}>
              <Switch
                checked={data.is_test}
                onChange={(checked) => void changeTest(checked)}
                label={ov.testAccount}
              />
            </ListItem>
            {data.is_admin ? null : (
              <>
                {data.blocked_at ? (
                  <ListItem
                    icon={<UnlockIcon />}
                    iconColor="green"
                    label={strings.unblockUser}
                    disabled={busy}
                    onPress={() => void changeBlock(false)}
                  />
                ) : (
                  <ListItem
                    icon={<BlockIcon />}
                    iconColor="orange"
                    label={strings.blockUser}
                    disabled={busy}
                    onPress={() => void askToBlock()}
                  />
                )}
                <ListItem
                  icon={<TrashIcon />}
                  label={strings.deleteUser}
                  destructive
                  disabled={busy}
                  onPress={() => void askToDelete()}
                />
              </>
            )}
          </Card>
          {actionError ? (
            <p className={styles.error} role="alert">
              {actionError}
            </p>
          ) : null}
        </Section>
      </div>
    );
  }

  /** Привычки списком: цвет, название, серия; нажатие — как у него в приложении. */
  function renderHabits() {
    const ov = strings.ov;
    const list = habits.data?.habits;
    if (!list) {
      return habits.status === "error" ? (
        <ListItem label={strings.habitsLoadFailed} onPress={habits.reload} />
      ) : (
        <ListItem label={<span className={styles.muted}>{strings.loading}</span>} />
      );
    }
    if (list.length === 0) {
      return <ListItem label={<span className={styles.muted}>{ov.noHabits}</span>} />;
    }
    return list.map((habit) => (
      <ListItem key={habit.id} onPress={onOpenHabits}>
        <span className={styles.habit} style={habitColorStyle(habit.color)}>
          <span className={styles.habitDot} />
          <span className={styles.habitName}>{habit.name}</span>
        </span>
        {habit.current_streak > 0 ? (
          <span className={`${styles.value} ${styles.numeric} ${styles.muted}`}>{ov.streakDays(habit.current_streak)}</span>
        ) : null}
      </ListItem>
    ));
  }
}

/** Ряд «подпись — значение» профиля. */
export function InfoRow({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <ListItem label={label}>
      <span className={`${styles.value} ${numeric ? styles.numeric : ""}`}>{value}</span>
    </ListItem>
  );
}
