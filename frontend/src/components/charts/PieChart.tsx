/**
 * Круговая диаграмма (экран статистики привычки, «Итоги по дням»): крупное кольцо по
 * центру, в его середине — доля первой части крупно и её подпись (`centerLabel`), под
 * кольцом — плитки на всю ширину карточки: цвет, подпись, сколько и доля. Плиток три — в
 * ряд, четыре — сеткой 2×2, так по бокам не остаётся пустого места. Части без значения в
 * кольце не рисуются, но плитка у них есть (0). Цвет части — класс из Chart.module.css
 * (`tone`: done, partial, missed, frozen).
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
  /** Подпись под долей первой части в центре кольца. */
  centerLabel: string;
  /** Доступное описание графика. */
  label: string;
}

/** Размер кольца и толщина. */
const SIZE = 184;
const THICKNESS = 26;

export function PieChart({ slices, centerLabel, label }: PieChartProps) {
  const shown = slices.filter((slice) => slice.value > 0);
  const total = shown.reduce((sum, slice) => sum + slice.value, 0);
  const share = (value: number): number => (total > 0 ? Math.round((value / total) * 100) : 0);
  const radius = (SIZE - THICKNESS) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <figure className={styles.pie} aria-label={label}>
      <div className={styles.ring} style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle
            className={styles.ringTrack}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            strokeWidth={THICKNESS}
          />
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
        {slices.length ? (
          <div className={styles.ringCenter}>
            <span className={styles.ringValue}>{share(slices[0].value)}%</span>
            <span className={styles.ringLabel}>{centerLabel}</span>
          </div>
        ) : null}
      </div>
      <ul className={styles.legend} data-count={slices.length}>
        {slices.map((slice) => (
          <li key={slice.key} className={styles.legendTile}>
            <span className={styles.legendLabel}>
              <span className={`${styles.swatch} ${styles[slice.tone]}`} aria-hidden="true" />
              {slice.label}
            </span>
            <span className={styles.legendNumbers}>
              <span className={styles.legendValue}>{slice.value}</span>
              <span className={styles.legendShare}>{share(slice.value)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
