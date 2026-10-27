/** Карточка показателя привычки: иконка в плашке справа сверху, крупное значение и подпись.
 *  `inline` — низкая: значение с подписью слева, иконка напротив, справа. */

import type { ReactNode } from "react";

import styles from "./StatCard.module.css";

interface StatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  inline?: boolean;
}

export function StatCard({ icon, value, label, inline = false }: StatCardProps) {
  const iconBadge = (
    <span className={styles.icon} aria-hidden="true">
      {icon}
    </span>
  );
  if (inline) {
    return (
      <div className={`${styles.card} ${styles.inline}`}>
        <div className={styles.text}>
          <p className={styles.value}>{value}</p>
          <p className={styles.label}>{label}</p>
        </div>
        {iconBadge}
      </div>
    );
  }
  return (
    <div className={styles.card}>
      {iconBadge}
      <p className={styles.value}>{value}</p>
      <p className={styles.label}>{label}</p>
    </div>
  );
}
