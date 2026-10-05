/**
 * Красный кружок с «!» — как значок у «Настроек» iOS, когда что-то требует внимания.
 * Web app: the account is still a guest — on the Settings tab and the «Аккаунт» row.
 */

import { useStrings } from "../preferences";
import styles from "./AttentionBadge.module.css";

export function AttentionBadge({ className }: { className?: string }) {
  const strings = useStrings();
  return (
    <span
      className={className ? `${styles.badge} ${className}` : styles.badge}
      role="img"
      aria-label={strings.settingsAttention}
    >
      !
    </span>
  );
}
