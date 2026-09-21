/**
 * Диалог «Написать отзыв» (открывается из настроек) — алерт iOS с текстовым полем:
 * «Отправить» активна, когда в поле есть текст. После отправки диалог благодарит за
 * отзыв, «OK» закрывает его. Каждое открытие начинается с пустого поля.
 *
 * Пока это заготовка: отзыв никуда не уходит. Приём отзывов появится вместе с
 * админ-панелью — тогда send() будет отправлять текст на сервер.
 */

import { useState } from "react";

import { REVIEW_MAX_LENGTH } from "../constants";
import { useStrings } from "../preferences";
import { hapticNotification } from "../telegram/webapp";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./ReviewDialog.module.css";

interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ReviewDialog({ open, onClose }: ReviewDialogProps) {
  const strings = useStrings();
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  // Новое открытие — с пустого поля (закрытие доигрывает анимацию с тем же содержимым).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setSent(false);
    }
  }

  function send(): void {
    hapticNotification("success");
    setSent(true);
  }

  if (sent) {
    return (
      <ConfirmDialog
        open={open}
        title={strings.reviewThanksTitle}
        message={strings.reviewThanksMessage}
        confirmLabel={strings.reviewThanksDone}
        onConfirm={onClose}
      />
    );
  }

  return (
    <ConfirmDialog
      open={open}
      title={strings.reviewTitle}
      message={strings.reviewMessage}
      cancelLabel={strings.reviewCancel}
      confirmLabel={strings.reviewSend}
      confirmDisabled={text.trim() === ""}
      onCancel={onClose}
      onConfirm={send}
    >
      <textarea
        className={styles.field}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={strings.reviewPlaceholder}
        aria-label={strings.reviewPlaceholder}
        maxLength={REVIEW_MAX_LENGTH}
        rows={4}
      />
    </ConfirmDialog>
  );
}
