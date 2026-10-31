/**
 * Вертикальные столбики (экран статистики привычки, «По дням недели»): столбик на каждое
 * значение, подписи под ними, шкала справа — как у линейного графика (та же геометрия,
 * chartScale). Цвет — цвет секции (`--habit-rgb`).
 *
 * Выбор столбика — пальцем (или мышью), как у LineChart: остальные приглушаются, над
 * выбранным — его значение (`formatTick`). `null` — у значения нет данных: столбика нет.
 */

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { useElementWidth } from "../../hooks/useElementWidth";
import { PLOT_HEIGHT, PLOT_TOP, X_AXIS_BAND, Y_AXIS_WIDTH, niceTicks } from "./chartScale";
import styles from "./Chart.module.css";

interface BarChartProps {
  values: (number | null)[];
  /** Подпись под каждым столбиком. */
  labels: string[];
  /** Верх шкалы; без него — «красивое» округление максимума. */
  max?: number;
  tickCount?: number;
  formatTick: (value: number) => string;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** Доступное описание графика. */
  label: string;
}

/** Столбик — доля места под ним, но не шире BAR_MAX; верх скруглён. */
const BAR_SHARE = 0.56;
const BAR_MAX = 28;
const BAR_RADIUS = 4;

export function BarChart({
  values,
  labels,
  max,
  tickCount = 2,
  formatTick,
  selected,
  onSelect,
  label,
}: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const height = PLOT_TOP + PLOT_HEIGHT + X_AXIS_BAND;
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH);
  const count = values.length;
  const known = values.filter((value): value is number => value !== null);
  const ticks = niceTicks(max ?? Math.max(0, ...known), tickCount, true);
  const top = max ?? ticks[ticks.length - 1];
  const baseline = PLOT_TOP + PLOT_HEIGHT;
  const slot = count ? plotWidth / count : 0;
  const barWidth = Math.min(BAR_MAX, slot * BAR_SHARE);

  const y = (value: number): number => PLOT_TOP + PLOT_HEIGHT * (1 - Math.min(value, top) / top);

  function indexAt(clientX: number, element: Element): number {
    const left = element.getBoundingClientRect().left;
    return Math.min(count - 1, Math.max(0, Math.floor((clientX - left) / slot)));
  }

  function handlePointer(event: PointerEvent<SVGRectElement>): void {
    // Мышь выбирает наведением, палец — пока касается экрана.
    if (event.pointerType === "mouse" || event.buttons > 0 || event.type === "pointerdown") {
      onSelect(indexAt(event.clientX, event.currentTarget));
    }
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const from = selected ?? (event.key === "ArrowLeft" ? count : -1);
      const next = from + (event.key === "ArrowLeft" ? -1 : 1);
      onSelect(Math.min(count - 1, Math.max(0, next)));
    } else if (event.key === "Escape") {
      onSelect(null);
    }
  }

  return (
    <div
      ref={containerRef}
      className={styles.chart}
      style={{ height }}
      tabIndex={0}
      role="group"
      aria-label={label}
      onKeyDown={handleKey}
      onBlur={() => onSelect(null)}
    >
      {width > 0 ? (
        <svg width={width} height={height} aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className={tick === 0 ? styles.axis : styles.grid}
                x1={0}
                x2={plotWidth}
                y1={Math.round(y(tick)) + 0.5}
                y2={Math.round(y(tick)) + 0.5}
              />
              <text className={styles.tick} x={width} y={y(tick) + 4} textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {values.map((value, index) => {
            const center = slot * index + slot / 2;
            const barTop = value === null ? baseline : y(value);
            const barHeight = baseline - barTop;
            const radius = Math.min(BAR_RADIUS, barHeight, barWidth / 2);
            const left = center - barWidth / 2;
            const right = center + barWidth / 2;
            return (
              <g key={labels[index]}>
                {barHeight > 0 ? (
                  <path
                    className={styles.bar}
                    data-dim={selected !== null && selected !== index ? "" : undefined}
                    d={`M${left} ${baseline} V${barTop + radius} Q${left} ${barTop} ${left + radius} ${barTop} H${right - radius} Q${right} ${barTop} ${right} ${barTop + radius} V${baseline} Z`}
                  />
                ) : null}
                {selected === index && value !== null ? (
                  <text
                    className={styles.barValue}
                    x={center}
                    y={Math.max(barTop - 6, PLOT_TOP)}
                    textAnchor="middle"
                  >
                    {formatTick(value)}
                  </text>
                ) : null}
                <text
                  className={styles.tick}
                  x={center}
                  y={baseline + X_AXIS_BAND - 6}
                  textAnchor="middle"
                >
                  {labels[index]}
                </text>
              </g>
            );
          })}
          <rect
            className={styles.hit}
            x={0}
            y={0}
            width={plotWidth}
            height={height}
            onPointerDown={handlePointer}
            onPointerMove={handlePointer}
            onPointerUp={(event) => event.pointerType !== "mouse" && onSelect(null)}
            onPointerCancel={() => onSelect(null)}
            onPointerLeave={() => onSelect(null)}
          />
        </svg>
      ) : null}
    </div>
  );
}
