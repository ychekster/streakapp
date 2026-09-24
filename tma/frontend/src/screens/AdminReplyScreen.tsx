/**
 * Ответ на отзыв — экран поверх отзыва (см. ComposeScreen): поле во весь экран и нижняя
 * кнопка Telegram «Отправить».
 *
 * Ответ присылает автору бот вместе с цитатой отзыва (POST /admin/reviews/{id}/reply).
 * Если автор заблокировал бота, экран так и скажет, а ответ не запомнится. Отправленный
 * ответ сразу виден в списке отзывов и на экране отзыва (`onReplied`).
 */

import { replyToReview } from "../api/admin";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { ComposeScreen } from "../components/ComposeScreen";
import { MESSAGE_MAX_LENGTH } from "../constants";
import type { AdminReview } from "../types/admin";

interface AdminReplyScreenProps {
  reviewId: number;
  /** Ответ отправлен: отзыв с ответом — для списка и экрана отзыва. */
  onReplied: (review: AdminReview) => void;
  onClose: () => void;
}

export function AdminReplyScreen({ reviewId, onReplied, onClose }: AdminReplyScreenProps) {
  const strings = useAdminStrings();

  async function send(text: string): Promise<string | null> {
    try {
      const result = await replyToReview(reviewId, text);
      onReplied(result.review);
      return result.delivered ? null : strings.undelivered[result.reason ?? "bot_blocked"];
    } catch (error) {
      return describeAdminError(strings, error, strings.replyFailed);
    }
  }

  return (
    <ComposeScreen
      title={strings.replyTitle}
      description={strings.replyDescription}
      placeholder={strings.replyPlaceholder}
      sendLabel={strings.send}
      maxLength={MESSAGE_MAX_LENGTH}
      onSend={send}
      onClose={onClose}
      done={{
        icon: "check",
        title: strings.replySentTitle,
        message: strings.replySentMessage,
        label: strings.done,
      }}
    />
  );
}
