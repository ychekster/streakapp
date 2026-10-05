/**
 * «Скопировать таблицу» и «Скачать CSV» у таблиц и графиков аналитики: данные уходят в
 * буфер обмена табуляцией (вставляются в Google Таблицы и Excel по ячейкам) или файлом CSV.
 */

export interface TableData {
  columns: string[];
  rows: (string | number | null)[][];
}

function cell(value: string | number | null): string {
  return value === null ? "" : String(value);
}

/** Таблица текстом через табуляцию. */
export function toTsv({ columns, rows }: TableData): string {
  return [columns, ...rows]
    .map((row) => row.map((value) => cell(value).replace(/[\t\n]/g, " ")).join("\t"))
    .join("\n");
}

/** Таблица в CSV (разделитель — запятая, значения в кавычках при необходимости). */
export function toCsv({ columns, rows }: TableData): string {
  const quote = (value: string | number | null): string => {
    const text = cell(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns, ...rows].map((row) => row.map(quote).join(",")).join("\n");
}

/** Скопировать текст; false — браузер не дал. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Попробуем по-старому.
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

/** Скачать CSV-файл (в Excel откроется с кириллицей — с BOM). */
export function downloadCsv(name: string, data: TableData): void {
  const blob = new Blob(["﻿", toCsv(data)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "table"}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
