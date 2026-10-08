/**
 * A destructive action as its own pill under the last card — «Удалить привычку» on the
 * habit screen, «Выйти из аккаунта» on the account screen.
 */

import styles from "./DestructiveButton.module.css";

interface DestructiveButtonProps {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}

export function DestructiveButton({ label, disabled, onPress }: DestructiveButtonProps) {
  return (
    <button type="button" className={styles.button} disabled={disabled} onClick={onPress}>
      {label}
    </button>
  );
}
