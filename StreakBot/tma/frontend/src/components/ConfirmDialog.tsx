/**
 * Диалог подтверждения по центру экрана в стиле алерта iOS 26: заголовок, пояснение
 * и две кнопки-таблетки («Отменить» и действие). Экран под ним затемняется.
 *
 * Открытие и закрытие анимированы, поэтому диалог управляется флагом `open` и
 * остаётся в DOM, пока не доиграет анимация закрытия. Нажатие мимо диалога его не
 * закрывает (как у алертов iOS) — только кнопки.
 */

import { useId, useState } from "react";

import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  /** Деструктивное действие: кнопка подтверждения — красная. */
  destructive?: boolean;
  /** Действие выполняется: кнопки неактивны. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  cancelLabel,
  confirmLabel,
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  // Держим диалог в DOM после закрытия, пока играет анимация исчезновения.
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) {
    setRendered(true);
  }
  if (!rendered) {
    return null;
  }

  return (
    <div
      className={`${styles.backdrop} ${open ? "" : styles.closing}`}
      onAnimationEnd={(event) => {
        if (!open && event.target === event.currentTarget) {
          setRendered(false);
        }
      }}
    >
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <p id={messageId} className={styles.message}>
          {message}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.button} ${destructive ? styles.destructive : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
