/**
 * Отзывы — вложенный экран вкладки «Люди»: как список пользователей, но без поиска.
 * Одна карточка, новые отзывы сначала; в ряду — имя автора и дата, под ними текст отзыва
 * (длинный обрезан) и отметка, если на отзыв уже ответили. Следующая страница
 * догружается, когда список прокручен к концу.
 *
 * Нажатие на отзыв открывает его целиком (AdminReviewScreen): там можно ответить и
 * перейти к профилю автора. Список хранит AdminApp.
 */

import { formatDate, userName } from "../adminFormat";
import { ADMIN_STRINGS as S, describeAdminError } from "../adminStrings";
import { ListItem } from "../components/ListItem";
import { LoadMore } from "../components/LoadMore";
import { Screen } from "../components/Screen";
import { Card } from "../components/Section";
import { StatusMessage } from "../components/StatusMessage";
import type { PagedList } from "../hooks/usePagedList";
import type { AdminReview } from "../types/admin";
import styles from "./AdminReviewsScreen.module.css";

interface AdminReviewsScreenProps {
  reviews: PagedList<AdminReview>;
  onOpen: (reviewId: number) => void;
}

export function AdminReviewsScreen({ reviews, onOpen }: AdminReviewsScreenProps) {
  return (
    <Screen title={S.reviewsTitle} withTabBar={false} enterAnimation>
      {renderList()}
    </Screen>
  );

  function renderList() {
    if (reviews.status === "error") {
      return (
        <StatusMessage
          emoji={S.errorEmoji}
          title={S.errorTitle}
          description={describeAdminError(reviews.error, S.reviewsLoadFailed)}
          actionLabel={S.retry}
          onAction={reviews.reload}
        />
      );
    }
    if (reviews.status === "loading") {
      return <StatusMessage emoji={S.loadingEmoji} title={S.loading} />;
    }
    if (reviews.items.length === 0) {
      return <p className={styles.empty}>{S.reviewsEmpty}</p>;
    }
    return (
      <>
        <Card>
          {reviews.items.map((review) => (
            <ListItem key={review.id} alignTop onPress={() => onOpen(review.id)}>
              <ReviewRow review={review} />
            </ListItem>
          ))}
        </Card>
        <LoadMore
          hasMore={reviews.hasMore}
          loading={reviews.loadingMore}
          failed={reviews.moreError !== null}
          onLoad={reviews.loadMore}
          loadingLabel={S.loading}
          failedLabel={S.loadMoreFailed}
          retryLabel={S.retry}
        />
      </>
    );
  }
}

/** Содержимое ряда отзыва: имя и дата, текст, отметка об ответе. Нужен и в профиле. */
export function ReviewRow({ review, showAuthor = true }: { review: AdminReview; showAuthor?: boolean }) {
  return (
    <span className={styles.review}>
      <span className={styles.meta}>
        {showAuthor ? <span className={styles.author}>{userName(review.user)}</span> : null}
        <span className={styles.date}>{formatDate(review.created_at)}</span>
      </span>
      <span className={styles.text}>{review.text}</span>
      {review.reply_text ? <span className={styles.replied}>{S.replied}</span> : null}
    </span>
  );
}
