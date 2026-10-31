/**
 * Круговая диаграмма (экран статистики привычки, «Дни привычки»): кольцо из частей и
 * легенда рядом — подпись, сколько и доля (двумя колонками). Части без значения в кольце
 * и легенде не показываются. Цвет части — класс из Chart.module.css (`tone`: done,
 * partial, missed, frozen).
 */

import styles from "./Chart.module.css";

export interface PieSlice {
  key: string;
  label: string;
  value: number;
  tone: "done" | "partial" | "missed" | "frozen";
}

interface PieChartProps {
  slices: PieSlice[];
  /** Доступное описание графика. */
  label: string;
}

/** Размер кольца и толщина. */
const SIZE = 132;
const THICKNESS = 22;

export function PieChart({ slices, label }: PieChartProps) {
  const shown = slices.filter((slice) => slice.value > 0);
  const total = shown.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (SIZE - THICKNESS) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <figure className={styles.pie} aria-label={label}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        {/* Части — дугами одной окружности: начало — сверху, по часовой стрелке. */}
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {shown.map((slice) => {
            const length = (slice.value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const circle = (
              <circle
                key={slice.key}
                className={`${styles.slice} ${styles[slice.tone]}`}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={radius}
                strokeWidth={THICKNESS}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return circle;
          })}
        </g>
      </svg>
      <ul className={styles.legend}>
        {shown.map((slice) => (
          <li key={slice.key} className={styles.legendRow}>
            <span className={`${styles.swatch} ${styles[slice.tone]}`} aria-hidden="true" />
            <span className={styles.legendLabel}>{slice.label}</span>
            <span className={styles.legendValue}>{slice.value}</span>
            <span className={styles.legendShare}>
              {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
