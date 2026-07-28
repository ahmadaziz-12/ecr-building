import type { XlsxCell } from "@/lib/buildpos/export-xlsx";
import type { Severity } from "@/lib/buildpos/format";

// What a report column IS, and how one cell of it renders in each destination: the screen, a CSV, an
// Excel sheet, a PDF. Lives apart from ReportTable so the aggregate reports — whose shape is several
// panels rather than one row list — can build exports through the same definitions instead of
// re-deriving formatting per panel, which is how the on-screen figure and the exported one drift.

export type CellFormat = "text" | "mono" | "money" | "qty" | "int" | "pct" | "date" | "datetime" | "status" | "days";

export type ReportColumn<T> = {
  key: string;
  label: string;
  /** Defaults to row[key]; supply for computed or nested values. */
  value?: (row: T) => string | number | null | undefined;
  format?: CellFormat;
  align?: "left" | "right" | "center";
  /** Hidden in the table but still exported — for long free-text fields. */
  exportOnly?: boolean;
};

export type ReportDetail<T> = {
  title: (row: T) => string;
  subtitle?: (row: T) => string;
  /** Header key/value pairs shown above the line table. */
  fields?: (row: T) => { label: string; value: string }[];
  itemsLabel?: string;
  items: (row: T) => unknown[];
  columns: ReportColumn<never>[];
};

const money = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const int = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function statusTone(status: string): Severity {
  const k = status.toLowerCase();
  if (/critical|failed|overdue|rejected|expired|shortage|cancelled|out/.test(k)) return "critical";
  if (/low|pending|warn|quarantine|delayed|draft|expiring|monitor|partial|awaiting|uncounted|overage/.test(k)) return "warning";
  if (/inactive|disabled|discontinued/.test(k)) return "muted";
  if (/healthy|completed|received|matched|approved|active|credit ?received|info/.test(k)) return "success";
  return "info";
}

export function formatCell(value: unknown, format: CellFormat = "text"): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (format) {
    case "money":
      return money(Number(value));
    case "qty":
      return qty(Number(value));
    case "int":
      return int(Number(value));
    case "pct":
      return `${Number(value).toFixed(1)}%`;
    case "days":
      return `${int(Number(value))}d`;
    case "date":
      return new Date(String(value)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    case "datetime":
      return new Date(String(value)).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    default:
      return String(value);
  }
}

export const NUMERIC_FORMATS: CellFormat[] = ["money", "qty", "int", "pct", "days"];

export function rawValue<T>(row: T, col: ReportColumn<T>): string | number | null | undefined {
  return col.value ? col.value(row) : (row as Record<string, unknown>)[col.key] as string | number | null | undefined;
}

export function alignOf<T>(col: ReportColumn<T>): "left" | "right" | "center" {
  return col.align ?? (NUMERIC_FORMATS.includes(col.format ?? "text") ? "right" : "left");
}

/**
 * Excel gets the underlying number for numeric columns rather than the display string, so a column of
 * amounts can be summed, sorted and pivoted in the workbook. Formatting it to "1,234.00 ر.س" first —
 * which is what the CSV export does — lands every one of them in Excel as text.
 */
export function xlsxCell(value: string | number | null | undefined, format: CellFormat = "text"): XlsxCell {
  if (value === null || value === undefined || value === "") return "";
  if (NUMERIC_FORMATS.includes(format)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : formatCell(value, format);
  }
  return formatCell(value, format);
}
