/** Отзывы пользователя (настройки → «Написать отзыв»).
 *
 *  История отзывов загружается заранее (loadReviews вместе со справочниками форм, см.
 *  App) и хранится в памяти: экран отзыва открывается сразу со списком, а свежий список
 *  (новый ответ администратора) подменяет его, когда придёт. */

import type { ReviewsResponse, UserReview } from "../types/review";
import { apiRequest } from "./client";

let kept: UserReview[] | null = null;
let inFlight: Promise<UserReview[]> | null = null;

/** История, загруженная раньше; null — ещё не загружалась. */
export function keptReviews(): UserReview[] | null {
  return kept;
}

/** Загрузить историю своих отзывов с ответами администратора (новые сначала). */
export function loadReviews(): Promise<UserReview[]> {
  if (!inFlight) {
    inFlight = apiRequest<ReviewsResponse>("/reviews")
      .then(({ reviews }) => {
        kept = reviews;
        return reviews;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Отправить отзыв — он появится в админ-панели; ответ — отзыв в форме истории. */
export async function sendReview(text: string): Promise<UserReview> {
  const review = await apiRequest<UserReview>("/reviews", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  kept = [review, ...(kept ?? []).filter((item) => item.id !== review.id)];
  return review;
}
