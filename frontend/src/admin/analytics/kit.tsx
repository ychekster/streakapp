/**
 * Детали экрана аналитики:
 *  - Pills — капсулы выбора (период, раздел, вид);
 *  - Block — блок раздела: заголовок с ⓘ, содержимое, пояснение и «данные собираются с…»;
 *  - MetricCard — крупная цифра с изменением к прошлому периоду (↑/↓, зелёный — хорошо,
 *    красный — плохо; у «плохих» цифр наоборот), подсказкой ⓘ и мини-графиком; нажатие
 *    открывает людей за цифрой;
 *  - DataTable — таблица с сортировкой по столбцу, прокруткой вбок и выгрузкой;
 *  - BarList, HourColumns, WeekdayBars, MultiLineChart — распределения и графики.
 *
 * У каждой таблицы и графика — «Скопировать таблицу» и «Скачать CSV» (ExportBar).
 */

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useAdminFormat } from "../adminFormat";
import { useAdminStrings } from "../adminStrings";
import { useElementWidth } from "../../hooks/useElementWidth";
import { copyText, downloadCsv, toTsv, type TableData } from "./exportTable";
import styles from "./Analytics.module.css";

/* --- Капсулы --- */

interface PillsProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  tabs?: boolean;
}

export function Pills<T extends string>({ options, value, onChange, label, tabs = false }: PillsProps<T>) {
  return (
    <div className={`${styles.pills} ${tabs ? styles.tabs : ""}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.pill}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* --- ⓘ --- */

function InfoGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="6.2" r="1.05" fill="currentColor" />
    </svg>
  );
}

function InfoButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const strings = useAdminStrings();
  return (
    <span
      role="button"
      tabIndex={0}
      className={styles.info}
      aria-label={strings.an.info}
      aria-expanded={open}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }
      }}
    >
      <InfoGlyph />
    </span>
  );
}

/* --- Блок раздела --- */

interface BlockProps {
  title: string;
  info?: string;
  /** Справа от заголовка (переключатель, кнопка). */
  aside?: ReactNode;
  footnote?: ReactNode;
  /** «Данные собираются с …» — цифры блока есть только с этого момента. */
  tracking?: string | null;
  children: ReactNode;
}

export function Block({ title, info, aside, footnote, tracking, children }: BlockProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.block}>
      <h2 className={styles.blockHeading}>
        <span className={styles.blockTitle}>{title}</span>
        {info ? <InfoButton open={open} onToggle={() => setOpen((value) => !value)} /> : null}
        {aside ? <span className={styles.blockAside}>{aside}</span> : null}
      </h2>
      {open && info ? <p className={styles.infoText}>{info}</p> : null}
      {children}
      {footnote || tracking ? (
        <p className={styles.footnote}>
          {footnote}
          {tracking ? (
            <>
              {footnote ? " " : null}
              <span className={styles.tracking}>{tracking}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

/* --- Изменение к прошлому периоду --- */

export interface DeltaSpec {
  current: number | null;
  previous: number | null;
  /** count — изменение в %, rate — в процентных пунктах. */
  kind: "count" | "rate";
  /** «Плохая» цифра (блокировки, ушедшие): рост — красный. */
  inverse?: boolean;
  /** «к прошлым 30 дням», «к неделе назад». */
  label: string;
}

function Delta({ spec }: { spec: DeltaSpec }) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const { current, previous, kind, inverse = false, label } = spec;
  if (current === null || previous === null) {
    return null;
  }
  const diff = current - previous;
  let text: string;
  if (kind === "rate") {
    text = strings.an.points(diff);
  } else if (previous === 0) {
    text = diff === 0 ? "0%" : `+${format.count(diff)}`;
  } else {
    text = `${Math.abs(Math.round((diff / previous) * 100))}%`;
  }
  const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
  const tone = diff === 0 ? "" : (diff > 0) !== inverse ? styles.good : styles.bad;
  return (
    <p className={`${styles.delta} ${tone}`}>
      {arrow} {text} <span className={styles.deltaLabel}>{label}</span>
    </p>
  );
}

/* --- Карточка цифры --- */

interface MetricCardProps {
  label: string;
  value: string;
  info?: string;
  delta?: DeltaSpec;
  note?: ReactNode;
  spark?: (number | null)[];
  onPress?: () => void;
  wide?: boolean;
  style?: CSSProperties;
}

export function MetricCard({ label, value, info, delta, note, spark, onPress, wide = false, style }: MetricCardProps) {
  const [open, setOpen] = useState(false);
  const className = `${styles.metric} ${wide ? styles.wide : ""}`;
  const content = (
    <>
      <span className={styles.metricHead}>
        <span className={styles.metricLabel}>{label}</span>
        {info ? <InfoButton open={open} onToggle={() => setOpen((current) => !current)} /> : null}
      </span>
      {open && info ? <span className={styles.infoText}>{info}</span> : null}
      <span className={styles.metricValue}>{value}</span>
      {delta ? <Delta spec={delta} /> : null}
      {note ? <span className={styles.metricNote}>{note}</span> : null}
      {spark ? <Sparkline values={spark} /> : null}
      {onPress ? (
        <svg className={styles.chevron} viewBox="0 0 8 13" fill="none" aria-hidden="true">
          <path d="M1.5 1.5 6.5 6.5 1.5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <button type="button" className={className} style={style} onClick={onPress}>
        {content}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

/** Мини-график значений по порядку (недели, дни). */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const known = values.map((value) => value ?? 0);
  const top = Math.max(1, ...known);
  const count = known.length;
  const width = 100;
  const height = 36;
  const points = known.map((value, index) => [
    count <= 1 ? width / 2 : (index * width) / (count - 1),
    height - 3 - ((height - 6) * value) / top,
  ]);
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <svg className={styles.spark} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {count > 1 ? <path className={styles.sparkArea} d={`${line} L${width} ${height} L0 ${height} Z`} /> : null}
      <path className={styles.sparkLine} d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* --- Выгрузка --- */

export function ExportBar({ name, data }: { name: string; data: TableData }) {
  const strings = useAdminStrings();
  const [copied, setCopied] = useState(false);
  return (
    <span className={styles.export}>
      <button
        type="button"
        className={styles.exportButton}
        onClick={() => {
          void copyText(toTsv(data)).then((done) => {
            if (done) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }
          });
        }}
      >
        {copied ? strings.an.copied : strings.an.copyTable}
      </button>
      <button type="button" className={styles.exportButton} onClick={() => downloadCsv(name, data)}>
        CSV
      </button>
    </span>
  );
}

/** Карточка с заголовком и выгрузкой. */
export function TableCard({
  title,
  data,
  children,
}: {
  title?: string;
  data?: TableData;
  children: ReactNode;
}) {
  return (
    <div className={styles.card}>
      {title || data ? (
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>{title}</span>
          {data ? <ExportBar name={title ?? "table"} data={data} /> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/* --- Таблица с сортировкой --- */

export interface Column<R> {
  key: string;
  label: string;
  /** Значение для сортировки и выгрузки. */
  value: (row: R) => number | string | null;
  /** Как показать (по умолчанию — значение как есть). */
  display?: (row: R) => ReactNode;
}

interface DataTableProps<R> {
  title?: string;
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  initialSort?: string;
  onRowPress?: (row: R) => void;
  rowClassName?: (row: R) => string | undefined;
  /** Не сортировать (порядок строк важен — например, недели). */
  fixedOrder?: boolean;
  empty?: string;
}

export function DataTable<R>({
  title,
  columns,
  rows,
  rowKey,
  initialSort,
  onRowPress,
  rowClassName,
  fixedOrder = false,
  empty,
}: DataTableProps<R>) {
  const strings = useAdminStrings();
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(
    initialSort ? { key: initialSort, desc: true } : null,
  );
  const sorted = useMemo(() => {
    if (fixedOrder || !sort) {
      return rows;
    }
    const column = columns.find((item) => item.key === sort.key);
    if (!column) {
      return rows;
    }
    return [...rows].sort((a, b) => {
      const left = column.value(a);
      const right = column.value(b);
      if (left === right) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      const order = left < right ? -1 : 1;
      return sort.desc ? -order : order;
    });
  }, [rows, columns, sort, fixedOrder]);
  const data: TableData = {
    columns: columns.map((column) => column.label),
    rows: sorted.map((row) => columns.map((column) => column.value(row))),
  };

  return (
    <TableCard title={title} data={data}>
      {rows.length === 0 ? (
        <p className={styles.empty}>{empty ?? strings.an.noData}</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col">
                    {fixedOrder ? (
                      column.label
                    ) : (
                      <button
                        type="button"
                        className={`${styles.sortButton} ${sort?.key === column.key ? styles.sorted : ""}`}
                        onClick={() =>
                          setSort((current) =>
                            current?.key === column.key
                              ? { key: column.key, desc: !current.desc }
                              : { key: column.key, desc: true },
                          )
                        }
                      >
                        {column.label}
                        {sort?.key === column.key ? (sort.desc ? " ↓" : " ↑") : ""}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={[onRowPress ? styles.rowButton : "", rowClassName?.(row) ?? ""].join(" ")}
                  onClick={onRowPress ? () => onRowPress(row) : undefined}
                >
                  {columns.map((column, index) =>
                    index === 0 ? (
                      <th key={column.key} scope="row">
                        {column.display ? column.display(row) : column.value(row)}
                      </th>
                    ) : (
                      <td key={column.key}>{column.display ? column.display(row) : column.value(row)}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TableCard>
  );
}

/* --- Полосы --- */

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Доля для подписи справа (по умолчанию — от суммы). */
  share?: number | null;
}

interface BarListProps {
  title?: string;
  items: BarItem[];
  /** Как подписать значение (по умолчанию — число). */
  formatValue?: (value: number) => string;
  /** Показывать долю от суммы. */
  shares?: boolean;
  onPress?: (item: BarItem) => void;
  empty?: string;
}

export function BarList({ title, items, formatValue, shares = true, onPress, empty }: BarListProps) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const top = Math.max(1, ...items.map((item) => item.value));
  const show = formatValue ?? format.count;
  const data: TableData = {
    columns: [title ?? "", strings.an.peopleColumn],
    rows: items.map((item) => [item.label, item.value]),
  };
  return (
    <TableCard title={title} data={data}>
      {items.length === 0 ? (
        <p className={styles.empty}>{empty ?? strings.an.noData}</p>
      ) : (
        <ul className={styles.bars}>
          {items.map((item) => {
            const share = item.share !== undefined ? item.share : total ? item.value / total : null;
            const body = (
              <>
                <span className={styles.barLine}>
                  <span className={styles.barLabel}>{item.label}</span>
                  <span className={styles.barValue}>{show(item.value)}</span>
                  {shares ? (
                    <span className={styles.barShare}>{share === null ? "—" : format.percent(share)}</span>
                  ) : null}
                </span>
                <span className={styles.barTrack}>
                  <span className={styles.barFill} style={{ width: `${(item.value / top) * 100}%` }} />
                </span>
              </>
            );
            return (
              <li key={item.key}>
                {onPress ? (
                  <button type="button" className={styles.barRow} onClick={() => onPress(item)}>
                    {body}
                  </button>
                ) : (
                  <div className={styles.barRow}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </TableCard>
  );
}

/* --- Столбики по часам --- */

export function HourColumns({ title, values }: { title: string; values: number[] }) {
  const strings = useAdminStrings();
  const top = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  const data: TableData = {
    columns: [strings.tableValue, title],
    rows: values.map((value, hour) => [`${String(hour).padStart(2, "0")}:00`, value]),
  };
  return (
    <TableCard title={title} data={data}>
      <div className={styles.cardPadded}>
        <div className={styles.columns} role="img" aria-label={title}>
          {values.map((value, hour) => (
            <span
              key={hour}
              className={styles.column}
              data-muted={hour !== peak ? "" : undefined}
              style={{ height: `${Math.max(value ? 3 : 0, (value / top) * 100)}%` }}
              title={`${hour}:00 — ${value}`}
            />
          ))}
        </div>
        <div className={styles.columnLabels}>
          {["00", "06", "12", "18", "23"].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
    </TableCard>
  );
}

/* --- Доли по дням недели --- */

export function WeekdayBars({ title, values, labels }: { title: string; values: (number | null)[]; labels: string[] }) {
  const format = useAdminFormat();
  const known = values.filter((value): value is number => value !== null);
  const worst = known.length ? Math.min(...known) : null;
  const data: TableData = {
    columns: ["", title],
    rows: values.map((value, index) => [labels[index], value === null ? null : Math.round(value * 100)]),
  };
  return (
    <TableCard title={title} data={data}>
      <div className={`${styles.cardPadded} ${styles.weekdays}`}>
        {values.map((value, index) => (
          <div key={labels[index]}>
            <span className={styles.weekdayValue}>{value === null ? "—" : format.percent(value)}</span>
            <div className={styles.weekdayBar}>
              <span
                className={styles.weekdayFill}
                data-worst={value !== null && value === worst && known.length > 1 ? "" : undefined}
                style={{ height: `${(value ?? 0) * 100}%` }}
              />
            </div>
            <div className={styles.weekdayLabel}>{labels[index]}</div>
          </div>
        ))}
      </div>
    </TableCard>
  );
}

/* --- Несколько линий (кривая удержания) --- */

const LINE_COLORS = ["--chart-cat-1", "--chart-cat-2", "--chart-cat-3", "--palette-green", "--palette-pink"];

export interface LineSeries {
  key: string;
  label: string;
  points: (number | null)[];
}

export function MultiLineChart({ title, series, xLabel }: { title: string; series: LineSeries[]; xLabel: (index: number) => string }) {
  const format = useAdminFormat();
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const [selected, setSelected] = useState<number | null>(null);
  const height = 170;
  const top = 18;
  const bottom = 22;
  const plot = height - top - bottom;
  const count = Math.max(...series.map((item) => item.points.length), 1);
  const x = (index: number): number => (count <= 1 ? width / 2 : 6 + (index * (width - 12)) / (count - 1));
  const y = (value: number): number => top + plot * (1 - Math.min(1, value));
  const data: TableData = {
    columns: ["", ...series.map((item) => item.label)],
    rows: Array.from({ length: count }, (_, index) => [
      xLabel(index),
      ...series.map((item) => {
        const value = item.points[index];
        return value === null || value === undefined ? null : Math.round(value * 100);
      }),
    ]),
  };

  function pick(clientX: number, element: Element): void {
    const left = element.getBoundingClientRect().left;
    const index = Math.round(((clientX - left - 6) / Math.max(1, width - 12)) * (count - 1));
    setSelected(Math.min(count - 1, Math.max(0, index)));
  }

  return (
    <TableCard title={title} data={data}>
      <div className={styles.cardPadded}>
        <div ref={ref} style={{ height }}>
          {width > 0 ? (
            <svg width={width} height={height} aria-label={title} role="img">
              {[0, 0.5, 1].map((tick) => (
                <g key={tick}>
                  <line x1={0} x2={width} y1={Math.round(y(tick)) + 0.5} y2={Math.round(y(tick)) + 0.5} stroke="var(--chart-grid)" />
                  <text x={width} y={y(tick) - 3} textAnchor="end" fontSize="11" fill="var(--color-text-secondary)">
                    {format.percent(tick)}
                  </text>
                </g>
              ))}
              {[0, Math.floor((count - 1) / 2), count - 1].map((index, order) => (
                <text
                  key={order}
                  x={x(index)}
                  y={height - 6}
                  textAnchor={order === 0 ? "start" : order === 2 ? "end" : "middle"}
                  fontSize="11"
                  fill="var(--color-text-secondary)"
                >
                  {xLabel(index)}
                </text>
              ))}
              {series.map((item, order) => {
                const segments: string[] = [];
                let path = "";
                item.points.forEach((value, index) => {
                  if (value === null) {
                    if (path) segments.push(path);
                    path = "";
                    return;
                  }
                  path += `${path ? "L" : "M"}${x(index)} ${y(value)} `;
                });
                if (path) segments.push(path);
                return (
                  <g key={item.key} style={{ "--segment-rgb": `var(${LINE_COLORS[order % LINE_COLORS.length]})` } as CSSProperties}>
                    {segments.map((d, index) => (
                      <path key={index} className={styles.multiLine} d={d} />
                    ))}
                  </g>
                );
              })}
              {selected !== null ? (
                <line x1={x(selected)} x2={x(selected)} y1={top} y2={top + plot} stroke="var(--chart-crosshair)" />
              ) : null}
              <rect
                x={0}
                y={0}
                width={width}
                height={height}
                fill="transparent"
                style={{ touchAction: "pan-y" }}
                onPointerDown={(event) => pick(event.clientX, event.currentTarget)}
                onPointerMove={(event) => {
                  if (event.pointerType === "mouse" || event.buttons > 0) pick(event.clientX, event.currentTarget);
                }}
                onPointerLeave={() => setSelected(null)}
              />
            </svg>
          ) : null}
        </div>
        <div className={styles.legend}>
          {selected !== null ? <span className={styles.legendItem}>{xLabel(selected)}:</span> : null}
          {series.map((item, order) => {
            const value = selected !== null ? item.points[selected] : null;
            return (
              <span
                key={item.key}
                className={styles.legendItem}
                style={{ "--segment-rgb": `var(${LINE_COLORS[order % LINE_COLORS.length]})` } as CSSProperties}
              >
                <span className={styles.swatch} />
                {item.label}
                {selected !== null ? ` ${value === null || value === undefined ? "—" : format.percent(value)}` : ""}
              </span>
            );
          })}
        </div>
      </div>
    </TableCard>
  );
}

/** Строки «пара значений» (с напоминаниями и без и т.п.). */
export function PairsTable({
  head,
  rows,
}: {
  head: [string, string, string];
  rows: { label: string; left: string; right: string }[];
}) {
  return (
    <div className={styles.pairs}>
      <span className={styles.pairsHead} style={{ textAlign: "left" }}>
        {head[0]}
      </span>
      <span className={styles.pairsHead}>{head[1]}</span>
      <span className={styles.pairsHead}>{head[2]}</span>
      {rows.map((row) => (
        <PairRow key={row.label} {...row} />
      ))}
    </div>
  );
}

function PairRow({ label, left, right }: { label: string; left: string; right: string }) {
  return (
    <>
      <span>{label}</span>
      <span className={styles.pairsValue}>{left}</span>
      <span className={styles.pairsValue}>{right}</span>
    </>
  );
}
