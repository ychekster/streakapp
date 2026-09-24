/**
 * Линейный график одного ряда по дням (аналитика админ-панели): линия 2px с лёгкой
 * заливкой под ней, точка на последнем значении, тонкие линии делений и подписи шкалы
 * справа. Цвет — цвет секции (`--habit-rgb` предка, см. habitColorStyle).
 *
 * Выбор дня — как в «Акциях» iOS: палец, ведущий по графику (или мышь), ставит
 * вертикальную линию на ближайший день и точку на его значении; выбранный день видит
 * родитель (`onSelect`) и показывает его значение в шапке карточки. Стрелки клавиатуры
 * делают то же. Вертикальная прокрутка страницы при этом работает (touch-action: pan-y).
 *
 * `null` — у дня нет значения (например, не на что считать долю выполнения): линия
 * прерывается. `partialLast` — последний день ещё идёт (сегодня): отрезок к нему
 * пунктиром.
 */

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { useElementWidth } from "../hooks/useElementWidth";
import {
  DOT_RADIUS,
  DOT_RING,
  LINE_WIDTH,
  PARTIAL_DASH,
  PLOT_HEIGHT,
  PLOT_TOP,
  X_AXIS_BAND,
  Y_AXIS_WIDTH,
  niceTicks,
} from "./chartScale";
import styles from "./Chart.module.css";

interface LineChartProps {
  values: (number | null)[];
  /** Подписи дней для оси X (первый, средний, последний). */
  labels: string[];
  /** Верх шкалы; без него — «красивое» округление максимума. */
  max?: number;
  /** Делений шкалы до верха. */
  tickCount?: number;
  /** Значения — счётчики (деления целые). */
  integer?: boolean;
  formatTick: (value: number) => string;
  partialLast?: boolean;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** Доступное описание графика. */
  label: string;
}

/** Отступ крайних точек от краёв: точка с кольцом не обрезается. */
const EDGE = DOT_RADIUS + DOT_RING;

export function LineChart({
  values,
  labels,
  max,
  tickCount = 3,
  integer = true,
  formatTick,
  partialLast = false,
  selected,
  onSelect,
  label,
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const height = PLOT_TOP + PLOT_HEIGHT + X_AXIS_BAND;
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH);
  const count = values.length;
  const known = values.filter((value): value is number => value !== null);
  const ticks = niceTicks(max ?? Math.max(0, ...known), tickCount, integer);
  const top = max ?? ticks[ticks.length - 1];
  const baseline = PLOT_TOP + PLOT_HEIGHT;

  const x = (index: number): number =>
    count <= 1 ? plotWidth / 2 : EDGE + (index * (plotWidth - 2 * EDGE)) / (count - 1);
  const y = (value: number): number => PLOT_TOP + PLOT_HEIGHT * (1 - Math.min(value, top) / top);

  // Непрерывные участки без пропусков; отрезок к неполному последнему дню — отдельно.
  const solidEnd = partialLast && count >= 2 && values[count - 1] !== null && values[count - 2] !== null
    ? count - 1
    : count;
  const runs: number[][] = [];
  let run: number[] = [];
  for (let index = 0; index < solidEnd; index += 1) {
    if (values[index] === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(index);
    }
  }
  if (run.length) runs.push(run);

  const point = (index: number): string => `${x(index)} ${y(values[index] as number)}`;
  const linePath = (indices: number[]): string =>
    indices.map((index, order) => `${order ? "L" : "M"}${point(index)}`).join(" ");
  const areaPath = (indices: number[]): string =>
    `${linePath(indices)} L${x(indices[indices.length - 1])} ${baseline} L${x(indices[0])} ${baseline} Z`;

  let last: number | null = null;
  for (let index = count - 1; index >= 0; index -= 1) {
    if (values[index] !== null) {
      last = index;
      break;
    }
  }
  const focus = selected ?? last;

  function indexAt(clientX: number, element: Element): number {
    const left = element.getBoundingClientRect().left;
    const step = count <= 1 ? 1 : (plotWidth - 2 * EDGE) / (count - 1);
    const index = Math.round((clientX - left - EDGE) / step);
    return Math.min(count - 1, Math.max(0, index));
  }

  function handlePointer(event: PointerEvent<SVGRectElement>): void {
    // Мышь выбирает наведением, палец — пока касается экрана.
    if (event.pointerType === "mouse" || event.buttons > 0 || event.type === "pointerdown") {
      onSelect(indexAt(event.clientX, event.currentTarget));
    }
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>): void {
    const from = selected ?? last ?? 0;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = from + (event.key === "ArrowLeft" ? -1 : 1);
      onSelect(Math.min(count - 1, Math.max(0, next)));
    } else if (event.key === "Escape") {
      onSelect(null);
    }
  }

  const axisLabels = count
    ? [
        { index: 0, anchor: "start" as const },
        { index: Math.floor((count - 1) / 2), anchor: "middle" as const },
        { index: count - 1, anchor: "end" as const },
      ].filter((item, order, all) => all.findIndex((other) => other.index === item.index) === order)
    : [];

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
          {axisLabels.map((item) => (
            <text
              key={item.index}
              className={styles.tick}
              x={item.anchor === "start" ? 0 : item.anchor === "end" ? plotWidth : x(item.index)}
              y={baseline + X_AXIS_BAND - 6}
              textAnchor={item.anchor}
            >
              {labels[item.index]}
            </text>
          ))}
          {runs.map((indices) => (
            <g key={indices[0]}>
              <path className={styles.area} d={areaPath(indices)} />
              <path className={styles.line} d={linePath(indices)} strokeWidth={LINE_WIDTH} />
            </g>
          ))}
          {solidEnd < count ? (
            <path
              className={styles.line}
              d={`M${point(count - 2)} L${point(count - 1)}`}
              strokeWidth={LINE_WIDTH}
              strokeDasharray={PARTIAL_DASH}
            />
          ) : null}
          {selected !== null ? (
            <line
              className={styles.crosshair}
              x1={x(selected)}
              x2={x(selected)}
              y1={PLOT_TOP}
              y2={baseline}
            />
          ) : null}
          {focus !== null && values[focus] !== null ? (
            <circle
              className={styles.dot}
              cx={x(focus)}
              cy={y(values[focus] as number)}
              r={DOT_RADIUS + DOT_RING / 2}
              strokeWidth={DOT_RING}
            />
          ) : null}
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
