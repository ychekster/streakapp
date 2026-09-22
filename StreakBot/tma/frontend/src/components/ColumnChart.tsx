/**
 * Столбчатый график одного ряда по немногим категориям (распределение числа привычек):
 * столбики не толще 24px со скруглённой вершиной от общей базовой линии, значение — над
 * каждым столбиком, подпись категории — под ним. Цвет — цвет секции (`--habit-rgb`).
 *
 * Нажатие на столбик (или Enter / пробел) выбирает его, повторное — снимает выбор:
 * остальные приглушаются, а родитель показывает выбранное в шапке карточки. Зона
 * нажатия — вся колонка, а не только столбик.
 */

import { useRef } from "react";

import { useElementWidth } from "../hooks/useElementWidth";
import {
  BAR_LABEL_BAND,
  BAR_MAX_WIDTH,
  BAR_MIN_GAP,
  PLOT_HEIGHT,
  PLOT_TOP,
  X_AXIS_BAND,
  barPath,
} from "./chartScale";
import styles from "./Chart.module.css";

interface ColumnChartProps {
  values: number[];
  labels: string[];
  formatValue: (value: number) => string;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** Доступное описание графика. */
  label: string;
  /** Доступная подпись столбика. */
  describe: (index: number) => string;
}

export function ColumnChart({
  values,
  labels,
  formatValue,
  selected,
  onSelect,
  label,
  describe,
}: ColumnChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const height = PLOT_TOP + BAR_LABEL_BAND + PLOT_HEIGHT + X_AXIS_BAND;
  const baseline = PLOT_TOP + BAR_LABEL_BAND + PLOT_HEIGHT;
  const slot = values.length ? width / values.length : 0;
  const barWidth = Math.max(0, Math.min(BAR_MAX_WIDTH, slot - BAR_MIN_GAP));
  const top = Math.max(1, ...values);

  return (
    <div ref={containerRef} className={styles.chart} style={{ height }} role="group" aria-label={label}>
      {width > 0 ? (
        <svg width={width} height={height}>
          <line className={styles.axis} x1={0} x2={width} y1={baseline + 0.5} y2={baseline + 0.5} />
          {values.map((value, index) => {
            const center = slot * index + slot / 2;
            const barTop = baseline - (PLOT_HEIGHT * value) / top;
            const dimmed = selected !== null && selected !== index;
            return (
              <g key={labels[index]} className={dimmed ? styles.dimmed : undefined}>
                {value > 0 ? (
                  <path
                    className={styles.bar}
                    d={barPath(center - barWidth / 2, barTop, barWidth, baseline)}
                  />
                ) : null}
                <text className={styles.capLabel} x={center} y={barTop - 6} textAnchor="middle">
                  {formatValue(value)}
                </text>
                <text
                  className={styles.tick}
                  x={center}
                  y={baseline + X_AXIS_BAND - 6}
                  textAnchor="middle"
                >
                  {labels[index]}
                </text>
                <rect
                  className={styles.hit}
                  x={slot * index}
                  y={0}
                  width={slot}
                  height={height}
                  tabIndex={0}
                  role="button"
                  aria-label={describe(index)}
                  aria-pressed={selected === index}
                  onClick={() => onSelect(selected === index ? null : index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(selected === index ? null : index);
                    }
                  }}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
