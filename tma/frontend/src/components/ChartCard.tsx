/**
 * Карточка графика аналитики: подпись, крупное значение и пояснение, под ними — график.
 * Пока на графике выбран день или столбик, значение и пояснение — о нём (родитель
 * передаёт их), иначе — итог.
 *
 * Кнопка справа сверху показывает те же данные таблицей вместо графика: так каждое
 * значение доступно без наведения и скринридеру.
 */

import { useState, type ReactNode } from "react";

import { ChartIcon, TableIcon } from "./AdminIcons";
import styles from "./Chart.module.css";

export interface ChartTable {
  columns: [string, string];
  rows: [string, string][];
}

interface ChartCardProps {
  title: string;
  value: string;
  note?: string;
  table: ChartTable;
  /** Подписи кнопки переключения вида. */
  showTableLabel: string;
  showChartLabel: string;
  children: ReactNode;
}

export function ChartCard({
  title,
  value,
  note,
  table,
  showTableLabel,
  showChartLabel,
  children,
}: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);

  return (
    <figure className={styles.card}>
      <div className={styles.header}>
        <figcaption className={styles.title}>{title}</figcaption>
        <button
          type="button"
          className={styles.toggle}
          aria-label={asTable ? showChartLabel : showTableLabel}
          aria-pressed={asTable}
          onClick={() => setAsTable((current) => !current)}
        >
          {asTable ? <ChartIcon /> : <TableIcon />}
        </button>
      </div>
      <p className={styles.value}>{value}</p>
      {note ? <p className={styles.note}>{note}</p> : null}
      <div className={styles.body}>
        {asTable ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{table.columns[0]}</th>
                <th scope="col">{table.columns[1]}</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map(([label, cell]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{cell}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          children
        )}
      </div>
    </figure>
  );
}
