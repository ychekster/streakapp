/**
 * Диалог «Написать отзыв» (открывается из настроек): поле для отзыва и «Отправить».
 * Отзыв уходит на сервер (POST /reviews) и появляется в разделе отзывов админ-панели;
 * после отправки диалог благодарит за отзыв, «OK» закрывает его. Если отправить не
 * вышло, причина видна в диалоге, а текст остаётся в поле.
 */

import { sendReview } from "../api/reviews";
import { REVIEW_MAX_LENGTH } from "../constants";
import { describeError } from "../errors";
import { useStrings } from "../preferences";
import { ComposeDialog } from "./ComposeDialog";

interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ReviewDialog({ open, onClose }: ReviewDialogProps) {
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
    <ComposeDialog
      open={open}
      title={strings.reviewTitle}
      message={strings.reviewMessage}
      placeholder={strings.reviewPlaceholder}
      cancelLabel={strings.reviewCancel}
      sendLabel={strings.reviewSend}
      maxLength={REVIEW_MAX_LENGTH}
      onSend={send}
      onClose={onClose}
      done={{
        title: strings.reviewThanksTitle,
        message: strings.reviewThanksMessage,
        label: strings.reviewThanksDone,
      }}
    />
  );
}
