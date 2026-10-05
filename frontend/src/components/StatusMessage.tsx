/**
 * Центрированное сообщение-состояние: пустой список, загрузка, ошибка, отправленный
 * отзыв или запуск вне Telegram. Необязательная кнопка действия (например, «Повторить»).
 *
 * Сверху — серый круглый значок состояния (StatusIcons), под ним жирный заголовок и
 * подпись почти того же размера: между ними своего отступа нет, их разделяет только
 * межстрочный интервал (вид снят со скриншота-эталона пустого экрана «Привычки»).
 */

import { StatusIcon, type StatusIconName } from "./StatusIcons";
import styles from "./StatusMessage.module.css";

interface StatusMessageProps {
  icon: StatusIconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function StatusMessage({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: StatusMessageProps) {
  return (
    <div className={styles.container}>
      <StatusIcon name={icon} />
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
