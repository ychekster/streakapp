/**
 * Вкладка «Отзывы» админ-панели: как список пользователей, но без поиска. Одна карточка,
 * новые отзывы сначала; в ряду — имя автора и дата, под ними текст отзыва (длинный
 * обрезан) и отметка, если на отзыв уже ответили. Следующая страница догружается, когда
 * список прокручен к концу.
 *
 * Нажатие на отзыв открывает его целиком (AdminReviewScreen): там можно ответить и
 * перейти к профилю автора. Список хранит AdminApp.
 */

import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
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
  onOpen: (review: AdminReview) => void;
}

export function AdminReviewsScreen({ reviews, onOpen }: AdminReviewsScreenProps) {
  const strings = useAdminStrings();

  return <Screen title={strings.reviewsTitle}>{renderList()}</Screen>;

  function renderList() {
    if (reviews.status === "error") {
      return (
        <StatusMessage
          emoji={strings.errorEmoji}
          title={strings.errorTitle}
          description={describeAdminError(strings, reviews.error, strings.reviewsLoadFailed)}
          actionLabel={strings.retry}
          onAction={reviews.reload}
        />
      );
    }
    if (reviews.status === "loading") {
      return <StatusMessage emoji={strings.loadingEmoji} title={strings.loading} />;
    }
    if (reviews.items.length === 0) {
      return <p className={styles.empty}>{strings.reviewsEmpty}</p>;
    }
    return (
      <>
        <Card>
          {reviews.items.map((review) => (
            <ListItem key={review.id} alignTop onPress={() => onOpen(review)}>
              <ReviewRow review={review} />
            </ListItem>
          ))}
        </Card>
        <LoadMore
          hasMore={reviews.hasMore}
          loading={reviews.loadingMore}
          failed={reviews.moreError !== null}
          onLoad={reviews.loadMore}
          loadingLabel={strings.loading}
          failedLabel={strings.loadMoreFailed}
          retryLabel={strings.retry}
        />
      </>
    );
  }
}

/** Содержимое ряда отзыва: имя и дата, текст, отметка об ответе. Нужен и в профиле. */
export function ReviewRow({
  review,
  showAuthor = true,
}: {
  review: AdminReview;
  showAuthor?: boolean;
}) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  return (
    <span className={styles.review}>
      <span className={styles.meta}>
        {showAuthor ? <span className={styles.author}>{format.userName(review.user)}</span> : null}
        <span className={styles.date}>{format.date(review.created_at)}</span>
      </span>
      <span className={styles.text}>{review.text}</span>
      {review.reply_text ? <span className={styles.replied}>{strings.replied}</span> : null}
    </span>
  );
}
