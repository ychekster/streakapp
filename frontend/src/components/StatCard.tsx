/** Карточка показателя привычки: иконка в плашке справа сверху, крупное значение и подпись. */

import type { ReactNode } from "react";

import styles from "./StatCard.module.css";

interface StatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
}

export function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <div className={styles.card}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <p className={styles.value}>{value}</p>
      <p className={styles.label}>{label}</p>
    </div>
  );
}
