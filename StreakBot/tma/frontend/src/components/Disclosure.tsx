/** Значок › в правой части ряда ListItem, который открывает вложенный экран. */

import styles from "./Disclosure.module.css";

export function Disclosure() {
  return (
    <svg className={styles.chevron} viewBox="0 0 8 14" fill="none" aria-hidden="true">
      <path
        d="M1.5 1.5L6.5 7l-5 5.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
