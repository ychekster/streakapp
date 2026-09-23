/**
 * Экран «Написать отзыв» (открывается из настроек): поле для отзыва во весь экран и
 * нижняя кнопка Telegram «Отправить» (см. ComposeScreen).
 *
 * Отзыв уходит на сервер (POST /reviews) и появляется в разделе отзывов админ-панели;
 * после отправки экран благодарит за отзыв, «Готово» возвращает в настройки. Если
 * отправить не вышло, причина видна под полем, а текст остаётся на месте.
 */

import { sendReview } from "../api/reviews";
import { ComposeScreen } from "../components/ComposeScreen";
import { REVIEW_MAX_LENGTH } from "../constants";
import { describeError } from "../errors";
import { useStrings } from "../preferences";

interface ReviewScreenProps {
  /** Вернуться в настройки. */
  onClose: () => void;
}

export function ReviewScreen({ onClose }: ReviewScreenProps) {
  const strings = useStrings();

  async function send(text: string): Promise<string | null> {
    try {
      await sendReview(text);
      return null;
    } catch (error) {
      return describeError(strings, error, strings.reviewFailed);
    }
  }

  return (
    <ComposeScreen
      title={strings.reviewTitle}
      description={strings.reviewDescription}
      placeholder={strings.reviewPlaceholder}
      sendLabel={strings.reviewSend}
      maxLength={REVIEW_MAX_LENGTH}
      onSend={send}
      onClose={onClose}
      done={{
        emoji: strings.reviewThanksEmoji,
        title: strings.reviewThanksTitle,
        message: strings.reviewThanksMessage,
        label: strings.reviewThanksDone,
      }}
    />
  );
}
