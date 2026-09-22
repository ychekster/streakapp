/**
 * Диалог с полем ввода и отправкой — алерт iOS с текстовым полем (см. ConfirmDialog):
 * «Написать отзыв», личное сообщение и ответ на отзыв из админ-панели, id нового
 * администратора.
 *
 * Кнопка отправки активна, когда в поле есть текст. Пока идёт отправка, кнопки неактивны;
 * если не вышло — причина встаёт вместо пояснения, а текст остаётся в поле. После успеха
 * диалог показывает подтверждение (`done`, «OK» закрывает) или сразу закрывается. Каждое
 * открытие начинается с пустого поля.
 */

import { useState } from "react";

import { hapticNotification } from "../telegram/webapp";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./ComposeDialog.module.css";

interface ComposeDialogProps {
  open: boolean;
  title: string;
  message: string;
  placeholder: string;
  cancelLabel: string;
  sendLabel: string;
  maxLength: number;
  /** Однострочное поле (с цифровой клавиатурой) вместо многострочного. */
  numeric?: boolean;
  /** Отправить текст (без пробелов по краям). null — отправлено; строка — почему нет. */
  onSend: (text: string) => Promise<string | null>;
  onClose: () => void;
  /** Подтверждение после отправки; без него диалог просто закрывается. */
  done?: { title: string; message: string; label: string };
}

export function ComposeDialog({
  open,
  title,
  message,
  placeholder,
  cancelLabel,
  sendLabel,
  maxLength,
  numeric = false,
  onSend,
  onClose,
  done,
}: ComposeDialogProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Новое открытие — с пустого поля (закрытие доигрывает анимацию с тем же содержимым).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setBusy(false);
      setError(null);
      setSent(false);
    }
  }

  async function send(): Promise<void> {
    setBusy(true);
    setError(null);
    const failure = await onSend(text.trim());
    setBusy(false);
    if (failure) {
      setError(failure);
      hapticNotification("error");
      return;
    }
    hapticNotification("success");
    if (done) {
      setSent(true);
    } else {
      onClose();
    }
  }

  if (sent && done) {
    return (
      <ConfirmDialog
        open={open}
        title={done.title}
        message={done.message}
        confirmLabel={done.label}
        onConfirm={onClose}
      />
    );
  }

  return (
    <ConfirmDialog
      open={open}
      title={title}
      message={error ?? message}
      cancelLabel={cancelLabel}
      confirmLabel={sendLabel}
      busy={busy}
      confirmDisabled={text.trim() === ""}
      onCancel={onClose}
      onConfirm={() => void send()}
    >
      {numeric ? (
        <input
          className={styles.field}
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(event) => setText(event.target.value.replace(/\D/g, ""))}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={maxLength}
          enterKeyHint="done"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <textarea
          className={styles.field}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={maxLength}
          rows={4}
        />
      )}
    </ConfirmDialog>
  );
}
