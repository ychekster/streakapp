/**
 * Отзыв целиком — вложенный экран отзывов (или профиля пользователя). Секции — как на
 * экране привычки:
 *  - От кого — автор; нажатие открывает его профиль;
 *  - Отзыв — дата и текст;
 *  - Ваш ответ — последний отправленный ответ, если он есть;
 *  - кнопка «Ответить» («Ответить ещё раз») — диалог с полем ответа: бот присылает его
 *    автору в Telegram с цитатой отзыва. Если автор заблокировал бота, диалог так и
 *    скажет, а ответ не запомнится.
 *
 * Открытый из списка отзыв виден сразу (строка списка) и тихо обновляется; ответ сразу
 * виден и в списке (onReplied).
 */

import { useState } from "react";

import { fetchReview, replyToReview } from "../api/admin";
import { formatDateTime, userName } from "../adminFormat";
import { ADMIN_STRINGS as S, describeAdminError } from "../adminStrings";
import { PersonIcon, ReplyIcon } from "../components/AdminIcons";
import { ComposeDialog } from "../components/ComposeDialog";
import { Disclosure } from "../components/Disclosure";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { StatusMessage } from "../components/StatusMessage";
import { MESSAGE_MAX_LENGTH } from "../constants";
import { useResource } from "../hooks/useResource";
import type { AdminReview, AdminUserRef } from "../types/admin";
import styles from "./AdminReviewScreen.module.css";

interface AdminReviewScreenProps {
  reviewId: number;
  /** Уже известный отзыв (строка списка) — виден сразу. */
  initial: AdminReview | null;
  onOpenUser: (user: AdminUserRef) => void;
  onReplied: (review: AdminReview) => void;
}

export function AdminReviewScreen({ reviewId, initial, onOpenUser, onReplied }: AdminReviewScreenProps) {
  const review = useResource(() => fetchReview(reviewId), String(reviewId), initial);
  const [replying, setReplying] = useState(false);

  async function sendReply(text: string): Promise<string | null> {
    try {
      const result = await replyToReview(reviewId, text);
      review.setData(() => result.review);
      onReplied(result.review);
      return result.delivered ? null : S.undelivered[result.reason ?? "bot_blocked"];
    } catch (error) {
      return describeAdminError(error, S.replyFailed);
    }
  }

  return (
    <Screen title={S.reviewTitle} withTabBar={false} enterAnimation>
      {renderContent()}
      <ComposeDialog
        open={replying}
        title={S.replyDialogTitle}
        message={S.replyDialogMessage}
        placeholder={S.replyPlaceholder}
        cancelLabel={S.cancel}
        sendLabel={S.send}
        maxLength={MESSAGE_MAX_LENGTH}
        onSend={sendReply}
        onClose={() => setReplying(false)}
        done={{ title: S.replySentTitle, message: S.replySentMessage, label: S.done }}
      />
    </Screen>
  );

  function renderContent() {
    const data = review.data;
    if (!data) {
      return review.status === "error" ? (
        <StatusMessage
          emoji={S.errorEmoji}
          title={S.errorTitle}
          description={describeAdminError(review.error, S.reviewLoadFailed)}
          actionLabel={S.retry}
          onAction={review.reload}
        />
      ) : (
        <StatusMessage emoji={S.loadingEmoji} title={S.loading} />
      );
    }
    return (
      <div className={styles.review}>
        <Section title={S.reviewAuthorHeading}>
          <Card>
            <ListItem
              icon={<PersonIcon />}
              iconColor="blue"
              label={userName(data.user)}
              onPress={() => onOpenUser(data.user)}
            >
              <span className={styles.username}>
                {data.user.username ? `@${data.user.username}` : data.user.telegram_id}
              </span>
              <Disclosure />
            </ListItem>
          </Card>
        </Section>

        <Section title={S.reviewHeading}>
          <Card padded>
            <div className={styles.message}>
              <p className={styles.date}>{formatDateTime(data.created_at)}</p>
              <p className={styles.text}>{data.text}</p>
            </div>
          </Card>
        </Section>

        {data.reply_text && data.replied_at ? (
          <Section title={S.reviewReplyHeading}>
            <Card padded>
              <div className={styles.message}>
                <p className={styles.date}>{S.sentOn(formatDateTime(data.replied_at))}</p>
                <p className={styles.text}>{data.reply_text}</p>
              </div>
            </Card>
          </Section>
        ) : null}

        <div className={styles.actions}>
          <Card>
            <ListItem
              icon={<ReplyIcon />}
              iconColor="blue"
              label={data.reply_text ? S.replyAgain : S.reply}
              accent
              onPress={() => setReplying(true)}
            />
          </Card>
        </div>
      </div>
    );
  }
}
