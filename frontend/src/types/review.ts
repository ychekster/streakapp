/** Отзывы пользователя — зеркалят UserReview / ReviewsResponse в backend/schemas.py. */

export interface UserReview {
  id: number;
  text: string;
  /** Когда отправлен (ISO, UTC). */
  created_at: string;
  /** Последний ответ администратора; null — ответа нет. */
  reply_text: string | null;
  replied_at: string | null;
}

/** GET /reviews — отзывы пользователя, новые сначала. */
export interface ReviewsResponse {
  reviews: UserReview[];
}
