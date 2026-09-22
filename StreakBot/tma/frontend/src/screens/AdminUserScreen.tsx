/**
 * Профиль пользователя — экран поверх вкладки (во весь экран, без нижней навигации).
 * Секции — как на экране привычки:
 *  - Профиль — id Telegram, @username, язык, пояс, регистрация, первое открытие
 *    приложения, последний визит, число привычек и статус;
 *  - Отзывы — его отзывы (если есть); нажатие открывает отзыв, там можно ответить;
 *  - Действия — «Написать сообщение» (бот пришлёт текст в Telegram), «Заблокировать» /
 *    «Разблокировать» и «Удалить». Блокировка и удаление — только после подтверждения в
 *    диалоге; администратора нельзя ни заблокировать, ни удалить (сначала забирают права).
 *
 * После блокировки или удаления список пользователей обновляется (onChanged, onDeleted);
 * после удаления AdminApp возвращает на вкладку.
 */

import { useState } from "react";

import { deleteUser, fetchUser, messageUser, setUserBlocked } from "../api/admin";
import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings, type AdminStrings } from "../adminStrings";
import { BlockIcon, PaperPlaneIcon, UnlockIcon } from "../components/AdminIcons";
import { ComposeDialog } from "../components/ComposeDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { TrashIcon } from "../components/SettingsIcons";
import { StatusMessage } from "../components/StatusMessage";
import { MESSAGE_MAX_LENGTH } from "../constants";
import { useResource } from "../hooks/useResource";
import { hapticNotification } from "../telegram/webapp";
import type { AdminReview, AdminUserProfile, AdminUserRef } from "../types/admin";
import { ReviewRow } from "./AdminReviewsScreen";
import styles from "./AdminUserScreen.module.css";

type Confirming = "block" | "delete" | null;

interface AdminUserScreenProps {
  telegramId: number;
  /** Уже известные имя и id (строка списка) — для заголовка, пока профиль грузится. */
  initial: AdminUserRef | null;
  onOpenReview: (review: AdminReview) => void;
  /** Профиль изменился (блокировка) — обновить список пользователей. */
  onChanged: (profile: AdminUserProfile) => void;
  /** Пользователь удалён (AdminApp возвращает на вкладку). */
  onDeleted: (telegramId: number) => void;
}

function statusLabel(
  profile: AdminUserProfile,
  strings: AdminStrings,
): { text: string; danger: boolean } {
  if (profile.is_admin) {
    return { text: strings.statusAdmin, danger: false };
  }
  if (profile.blocked_at) {
    return { text: strings.statusBlocked, danger: true };
  }
  if (profile.bot_blocked_at) {
    return { text: strings.statusBotBlocked, danger: false };
  }
  return { text: strings.statusActive, danger: false };
}

export function AdminUserScreen({
  telegramId,
  initial,
  onOpenReview,
  onChanged,
  onDeleted,
}: AdminUserScreenProps) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const profile = useResource(() => fetchUser(telegramId), String(telegramId));
  const [messaging, setMessaging] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const data = profile.data;
  const name = data
    ? format.userName(data)
    : initial
      ? format.userName(initial)
      : strings.unnamedUser(telegramId);

  async function sendMessage(text: string): Promise<string | null> {
    try {
      const result = await messageUser(telegramId, text);
      if (!result.delivered) {
        profile.reload(); // отметка «заблокировал бота» появилась на сервере
        return strings.undelivered[result.reason ?? "bot_blocked"];
      }
      return null;
    } catch (error) {
      return describeAdminError(strings, error, strings.messageFailed);
    }
  }

  function ask(action: Exclude<Confirming, null>): void {
    setDialogError(null);
    setConfirming(action);
  }

  async function changeBlock(blocked: boolean): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await setUserBlocked(telegramId, blocked);
      profile.setData(() => updated);
      onChanged(updated);
      hapticNotification("success");
      setConfirming(null);
    } catch (error) {
      const message = describeAdminError(strings, error, strings.blockFailed);
      if (confirming) {
        setDialogError(message);
      } else {
        setActionError(message);
      }
      hapticNotification("error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    setBusy(true);
    setDialogError(null);
    try {
      await deleteUser(telegramId);
      hapticNotification("success");
      // AdminApp закрывает этот экран — сбрасывать состояние не нужно.
      onDeleted(telegramId);
    } catch (error) {
      setDialogError(describeAdminError(strings, error, strings.deleteFailed));
      setBusy(false);
      hapticNotification("error");
    }
  }

  return (
    <Screen title={name} withTabBar={false} enterAnimation>
      {renderContent()}
      <ComposeDialog
        open={messaging}
        title={strings.messageDialogTitle}
        message={strings.messageDialogMessage(name)}
        placeholder={strings.messagePlaceholder}
        cancelLabel={strings.cancel}
        sendLabel={strings.send}
        maxLength={MESSAGE_MAX_LENGTH}
        onSend={sendMessage}
        onClose={() => setMessaging(false)}
        done={{
          title: strings.messageSentTitle,
          message: strings.messageSentMessage,
          label: strings.done,
        }}
      />
      <ConfirmDialog
        open={confirming === "block"}
        title={strings.blockDialogTitle}
        message={dialogError ?? strings.blockDialogMessage(name)}
        cancelLabel={strings.cancel}
        confirmLabel={strings.blockDialogConfirm}
        destructive
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => void changeBlock(true)}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        title={strings.deleteDialogTitle}
        message={dialogError ?? strings.deleteDialogMessage(name)}
        cancelLabel={strings.cancel}
        confirmLabel={strings.deleteDialogConfirm}
        destructive
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => void confirmDelete()}
      />
    </Screen>
  );

  function renderContent() {
    if (!data) {
      return profile.status === "error" ? (
        <StatusMessage
          emoji={strings.errorEmoji}
          title={strings.errorTitle}
          description={describeAdminError(strings, profile.error, strings.profileLoadFailed)}
          actionLabel={strings.retry}
          onAction={profile.reload}
        />
      ) : (
        <StatusMessage emoji={strings.loadingEmoji} title={strings.loading} />
      );
    }
    const status = statusLabel(data, strings);
    return (
      <div className={styles.profile}>
        <Section title={strings.profileHeading}>
          <Card>
            <InfoRow label={strings.profileTelegramId} value={String(data.telegram_id)} numeric />
            <InfoRow
              label={strings.profileUsername}
              value={data.username ? `@${data.username}` : strings.notSet}
            />
            <InfoRow
              label={strings.profileLanguage}
              value={strings.languageNames[data.language] ?? data.language}
            />
            <InfoRow label={strings.profileTimezone} value={data.timezone ?? strings.notSet} />
            <InfoRow label={strings.profileRegistered} value={format.date(data.created_at)} />
            <InfoRow
              label={strings.profileOpenedApp}
              value={data.app_opened_at ? format.date(data.app_opened_at) : strings.never}
            />
            <InfoRow
              label={strings.profileLastActive}
              value={data.last_seen_at ? format.relative(data.last_seen_at) : strings.never}
            />
            <InfoRow label={strings.profileHabits} value={format.count(data.habits)} numeric />
            <ListItem label={strings.profileStatus}>
              <span className={status.danger ? styles.danger : undefined}>{status.text}</span>
            </ListItem>
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

        <Section
          title={strings.actionsHeading}
          footer={data.is_admin ? strings.adminNoActions : undefined}
        >
          <Card>
            <ListItem
              icon={<PaperPlaneIcon />}
              iconColor="blue"
              label={strings.sendMessage}
              onPress={() => setMessaging(true)}
            />
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
                    onPress={() => ask("block")}
                  />
                )}
                <ListItem
                  icon={<TrashIcon />}
                  label={strings.deleteUser}
                  destructive
                  onPress={() => ask("delete")}
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
}

/** Ряд «подпись — значение» профиля. */
function InfoRow({
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
