/** Переключатель в стиле iOS (зелёный — включён). */

import styles from "./Switch.module.css";

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${styles.track} ${checked ? styles.on : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
