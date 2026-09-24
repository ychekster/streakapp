/** Отзыв пользователя (настройки → «Написать отзыв»). */

import { apiRequest } from "./client";

/** Отправить отзыв — он появится в админ-панели. */
export async function sendReview(text: string): Promise<void> {
  await apiRequest<{ id: number }>("/reviews", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
