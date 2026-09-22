/**
 * Профиль пользователя — вложенный экран (во весь экран, без нижней навигации). Секции —
 * как на экране привычки:
 *  - Профиль — id Telegram, @username, язык, пояс, регистрация, первое открытие
 *    приложения, последний визит, число привычек и статус;
 *  - Отзывы — его отзывы (если есть); нажатие открывает отзыв, там можно ответить;
 *  - Действия — «Отправить сообщение» (бот пришлёт текст в Telegram), «Заблокировать» /
 *    «Разблокировать» и «Удалить». Блокировка и удаление — только после подтверждения в
 *    диалоге; администратора нельзя ни заблокировать, ни удалить (сначала забирают права).
 *
 * После блокировки или удаления список пользователей обновляется (onChanged, onDeleted);
 * после удаления AdminApp возвращает к списку.
 */

import { useState } from "react";

import { deleteUser, fetchUser, messageUser, setUserBlocked } from "../api/admin";
import { formatCount, formatDate, formatRelative, userName } from "../adminFormat";
import { ADMIN_STRINGS as S, describeAdminError } from "../adminStrings";
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
  /** Пользователь удалён (AdminApp возвращает к списку). */
  onDeleted: (telegramId: number) => void;
}

function statusLabel(profile: AdminUserProfile): { text: string; danger: boolean } {
  if (profile.is_admin) {
    return { text: S.statusAdmin, danger: false };
  }
  if (profile.blocked_at) {
    return { text: S.statusBlocked, danger: true };
  }
  if (profile.bot_blocked_at) {
    return { text: S.statusBotBlocked, danger: false };
  }
  return { text: S.statusActive, danger: false };
}

export function AdminUserScreen({
  telegramId,
  initial,
  onOpenReview,
  onChanged,
  onDeleted,
}: AdminUserScreenProps) {
  const profile = useResource(() => fetchUser(telegramId), String(telegramId));
  const [messaging, setMessaging] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const data = profile.data;
  const name = data ? userName(data) : initial ? userName(initial) : S.unnamedUser(telegramId);

  async function sendMessage(text: string): Promise<string | null> {
    try {
      const result = await messageUser(telegramId, text);
      if (!result.delivered) {
        profile.reload(); // отметка «заблокировал бота» появилась на сервере
        return S.undelivered[result.reason ?? "bot_blocked"];
      }
      return null;
    } catch (error) {
      return describeAdminError(error, S.messageFailed);
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
      const message = describeAdminError(error, S.blockFailed);
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
      setDialogError(describeAdminError(error, S.deleteFailed));
      setBusy(false);
      hapticNotification("error");
    }
  }

  return (
    <Screen title={name} withTabBar={false} enterAnimation>
      {renderContent()}
      <ComposeDialog
        open={messaging}
        title={S.messageDialogTitle}
        message={S.messageDialogMessage(name)}
        placeholder={S.messagePlaceholder}
        cancelLabel={S.cancel}
        sendLabel={S.send}
        maxLength={MESSAGE_MAX_LENGTH}
        onSend={sendMessage}
        onClose={() => setMessaging(false)}
        done={{ title: S.messageSentTitle, message: S.messageSentMessage, label: S.done }}
      />
      <ConfirmDialog
        open={confirming === "block"}
        title={S.blockDialogTitle}
        message={dialogError ?? S.blockDialogMessage(name)}
        cancelLabel={S.cancel}
        confirmLabel={S.blockDialogConfirm}
        destructive
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={() => void changeBlock(true)}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        title={S.deleteDialogTitle}
        message={dialogError ?? S.deleteDialogMessage(name)}
        cancelLabel={S.cancel}
        confirmLabel={S.deleteDialogConfirm}
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
          emoji={S.errorEmoji}
          title={S.errorTitle}
          description={describeAdminError(profile.error, S.profileLoadFailed)}
          actionLabel={S.retry}
          onAction={profile.reload}
        />
      ) : (
        <StatusMessage emoji={S.loadingEmoji} title={S.loading} />
      );
    }
    const status = statusLabel(data);
    return (
      <div className={styles.profile}>
        <Section title={S.profileHeading}>
          <Card>
            <InfoRow label={S.profileTelegramId} value={String(data.telegram_id)} numeric />
            <InfoRow
              label={S.profileUsername}
              value={data.username ? `@${data.username}` : S.notSet}
            />
            <InfoRow
              label={S.profileLanguage}
              value={S.languageNames[data.language] ?? data.language}
            />
            <InfoRow label={S.profileTimezone} value={data.timezone ?? S.notSet} />
            <InfoRow label={S.profileRegistered} value={formatDate(data.created_at)} />
            <InfoRow
              label={S.profileOpenedApp}
              value={data.app_opened_at ? formatDate(data.app_opened_at) : S.never}
            />
            <InfoRow
              label={S.profileLastActive}
              value={data.last_seen_at ? formatRelative(data.last_seen_at) : S.never}
            />
            <InfoRow label={S.profileHabits} value={formatCount(data.habits)} numeric />
            <ListItem label={S.profileStatus}>
              <span className={status.danger ? styles.danger : undefined}>{status.text}</span>
            </ListItem>
          </Card>
        </Section>

        {data.reviews.length > 0 ? (
          <Section title={S.profileReviewsHeading}>
            <Card>
              {data.reviews.map((review) => (
                <ListItem key={review.id} alignTop onPress={() => onOpenReview(review)}>
                  <ReviewRow review={review} showAuthor={false} />
                </ListItem>
              ))}
            </Card>
          </Section>
        ) : null}

        <Section title={S.actionsHeading} footer={data.is_admin ? S.adminNoActions : undefined}>
          <Card>
            <ListItem
              icon={<PaperPlaneIcon />}
              iconColor="blue"
              label={S.sendMessage}
              onPress={() => setMessaging(true)}
            />
            {data.is_admin ? null : (
              <>
                {data.blocked_at ? (
                  <ListItem
                    icon={<UnlockIcon />}
                    iconColor="green"
                    label={S.unblockUser}
                    disabled={busy}
                    onPress={() => void changeBlock(false)}
                  />
                ) : (
                  <ListItem
                    icon={<BlockIcon />}
                    iconColor="orange"
                    label={S.blockUser}
                    onPress={() => ask("block")}
                  />
                )}
                <ListItem
                  icon={<TrashIcon />}
                  label={S.deleteUser}
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
function InfoRow({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return (
    <ListItem label={label}>
      <span className={`${styles.value} ${numeric ? styles.numeric : ""}`}>{value}</span>
    </ListItem>
  );
}
