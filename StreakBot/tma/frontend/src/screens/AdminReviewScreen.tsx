/**
 * Отзыв целиком — экран поверх вкладки «Отзывы» (или профиля пользователя). Секции — как
 * на экране привычки:
 *  - От кого — автор; нажатие открывает его профиль;
 *  - Отзыв — дата и текст;
 *  - Ваш ответ — последний отправленный ответ, если он есть;
 *  - кнопка «Ответить» («Ответить ещё раз») — открывает экран ответа (см.
 *    AdminReplyScreen): бот присылает его автору в Telegram с цитатой отзыва.
 *
 * Открытый из списка отзыв виден сразу (строка списка) и тихо обновляется; ответ сразу
 * виден и здесь, и в списке (AdminApp).
 */

import { fetchReview } from "../api/admin";
import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { PersonIcon, ReplyIcon } from "../components/AdminIcons";
import { Disclosure } from "../components/Disclosure";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { StatusMessage } from "../components/StatusMessage";
import { useResource } from "../hooks/useResource";
import type { AdminReview, AdminUserRef } from "../types/admin";
import styles from "./AdminReviewScreen.module.css";

interface AdminReviewScreenProps {
  reviewId: number;
  /** Уже известный отзыв (строка списка или только что отправленный ответ) — виден сразу. */
  initial: AdminReview | null;
  onOpenUser: (user: AdminUserRef) => void;
  /** Открыть экран ответа на этот отзыв. */
  onReply: () => void;
}

export function AdminReviewScreen({
  reviewId,
  initial,
  onOpenUser,
  onReply,
}: AdminReviewScreenProps) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const review = useResource(() => fetchReview(reviewId), String(reviewId), initial);

  return (
    <Screen title={strings.reviewTitle} withTabBar={false} enterAnimation>
      {renderContent()}
    </Screen>
  );

  function renderContent() {
    const data = review.data;
    if (!data) {
      return review.status === "error" ? (
        <StatusMessage
          emoji={strings.errorEmoji}
          title={strings.errorTitle}
          description={describeAdminError(strings, review.error, strings.reviewLoadFailed)}
          actionLabel={strings.retry}
          onAction={review.reload}
        />
      ) : (
        <StatusMessage emoji={strings.loadingEmoji} title={strings.loading} />
      );
    }
    return (
      <div className={styles.review}>
        <Section title={strings.reviewAuthorHeading}>
          <Card>
            <ListItem
              icon={<PersonIcon />}
              iconColor="blue"
              label={format.userName(data.user)}
              onPress={() => onOpenUser(data.user)}
            >
              <span className={styles.username}>
                {data.user.username ? `@${data.user.username}` : data.user.telegram_id}
              </span>
              <Disclosure />
            </ListItem>
          </Card>
        </Section>

        <Section title={strings.reviewHeading}>
          <Card padded>
            <div className={styles.message}>
              <p className={styles.date}>{format.dateTime(data.created_at)}</p>
              <p className={styles.text}>{data.text}</p>
            </div>
          </Card>
        </Section>

        {data.reply_text && data.replied_at ? (
          <Section title={strings.reviewReplyHeading}>
            <Card padded>
              <div className={styles.message}>
                <p className={styles.date}>{strings.sentOn(format.dateTime(data.replied_at))}</p>
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
              label={data.reply_text ? strings.replyAgain : strings.reply}
              accent
              onPress={onReply}
            />
          </Card>
        </div>
      </div>
    );
  }
}
