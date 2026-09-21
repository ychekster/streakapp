/**
 * Диалог по центру экрана в стиле алерта iOS 26: заголовок, пояснение и кнопки-таблетки
 * — «Отменить» и действие или одна кнопка на всю ширину (без `cancelLabel`). Между
 * пояснением и кнопками может стоять своё содержимое — например, поле ввода (как в
 * алерте iOS с текстовым полем). Экран под диалогом затемняется.
 *
 * Открытие и закрытие анимированы, поэтому диалог управляется флагом `open` и
 * остаётся в DOM, пока не доиграет анимация закрытия. Нажатие мимо диалога его не
 * закрывает (как у алертов iOS) — только кнопки. Пока диалог открыт, он стоит по центру
 * видимой части экрана: открытая клавиатура его не закрывает.
 */

import { useId, useState, type ReactNode } from "react";

import { useVisualViewport } from "../hooks/useVisualViewport";
import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Без неё — одна кнопка действия на всю ширину. */
  cancelLabel?: string;
  confirmLabel: string;
  /** Деструктивное действие: кнопка подтверждения — красная. */
  destructive?: boolean;
  /** Действие выполняется: кнопки неактивны. */
  busy?: boolean;
  /** Кнопка действия неактивна (напр., поле ввода ещё пустое). */
  confirmDisabled?: boolean;
  /** Содержимое между пояснением и кнопками (поле ввода). */
  children?: ReactNode;
  onCancel?: () => void;
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
  confirmDisabled = false,
  children,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const visibleArea = useVisualViewport(open);
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
      style={
        visibleArea
          ? { top: visibleArea.top, bottom: "auto", height: visibleArea.height }
          : undefined
      }
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
        {children}
        <div className={`${styles.actions} ${cancelLabel ? "" : styles.single}`}>
          {cancelLabel ? (
            <button type="button" className={styles.button} disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.button} ${destructive ? styles.destructive : ""}`}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
