/**
 * Доли целого одной полосой (аудитория в аналитике): сегменты по порядку, между ними —
 * зазор цвета карточки, края полосы скруглены. Под полосой — легенда: у каждой доли
 * значок её цвета, подпись, число и процент (текст — цветами текста, не цветом доли), так
 * что каждое значение видно без наведения.
 *
 * Цвет доли — токен каналов R, G, B (`--chart-cat-*`, variables.css): порядок и цвета
 * проверены на различимость при нарушениях цветового зрения в обеих темах.
 */

import type { CSSProperties } from "react";

import styles from "./Chart.module.css";

export interface StackedSegment {
  label: string;
  value: number;
  /** Имя CSS-переменной цвета, напр. «--chart-cat-1». */
  color: string;
}

interface StackedBarProps {
  segments: StackedSegment[];
  formatValue: (value: number) => string;
  formatShare: (share: number) => string;
  /** Доступное описание полосы. */
  label: string;
}

function colorStyle(color: string): CSSProperties {
  return { "--segment-rgb": `var(${color})` } as CSSProperties;
}

export function StackedBar({ segments, formatValue, formatShare, label }: StackedBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0);

  return (
    <div className={styles.stacked}>
      <div className={styles.stackedBar} role="img" aria-label={label}>
        {visible.map((segment) => (
          <span
            key={segment.label}
            className={styles.segment}
            style={{ ...colorStyle(segment.color), flexGrow: segment.value }}
          />
        ))}
      </div>
      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li key={segment.label} className={styles.legendRow} style={colorStyle(segment.color)}>
            <span className={styles.swatch} aria-hidden="true" />
            <span className={styles.legendLabel}>{segment.label}</span>
            <span className={styles.legendValue}>{formatValue(segment.value)}</span>
            <span className={styles.legendShare}>
              {total ? formatShare(segment.value / total) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
