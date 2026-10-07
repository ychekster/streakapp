/** Отзывы пользователя (настройки → «Написать отзыв»). */

import type { ReviewsResponse, UserReview } from "../types/review";
import { apiRequest } from "./client";

/** Отправить отзыв — он появится в админ-панели; ответ — отзыв в форме истории. */
export async function sendReview(text: string): Promise<UserReview> {
  return apiRequest<UserReview>("/reviews", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/** История своих отзывов с ответами администратора, новые сначала. */
export async function fetchReviews(): Promise<UserReview[]> {
  return (await apiRequest<ReviewsResponse>("/reviews")).reviews;
}
