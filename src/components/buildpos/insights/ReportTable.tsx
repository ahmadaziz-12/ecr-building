import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { exportToCsv } from "@/components/buildpos/pos/shared";
import type { Severity } from "@/lib/buildpos/format";

// The one table every list-shaped report renders through: sorting, client-side row search,
// pagination, CSV export of exactly what's on screen, and click-a-row drill-down into the line
// items that make the row up. Reports declare columns; none of them re-implement any of this.

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

function statusTone(status: string): Severity {
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

const NUMERIC_FORMATS: CellFormat[] = ["money", "qty", "int", "pct", "days"];

function rawValue<T>(row: T, col: ReportColumn<T>): string | number | null | undefined {
  return col.value ? col.value(row) : (row as Record<string, unknown>)[col.key] as string | number | null | undefined;
}

const PAGE_SIZE = 25;

export function ReportTable<T>({
  title,
  desc,
  columns,
  rows,
  loading,
  search,
  detail,
  emptyLabel = "No data for the current filters.",
  exportName,
  footer,
}: {
  title: string;
  desc?: string;
  columns: ReportColumn<T>[];
  rows: T[];
  loading?: boolean;
  /** Free-text row filter from the shared filter bar; matched against every rendered cell. */
  search?: string;
  detail?: ReportDetail<T>;
  emptyLabel?: string;
  exportName: string;
  footer?: ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);
  const [openRow, setOpenRow] = useState<T | null>(null);

  const visible = columns.filter((c) => !c.exportOnly);

  const searched = useMemo(() => {
    const needle = search?.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      columns.some((c) => String(rawValue(row, c) ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, columns, search]);

  const sorted = useMemo(() => {
    if (!sort) return searched;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return searched;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...searched].sort((a, b) => {
      const av = rawValue(a, col);
      const bv = rawValue(b, col);
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [searched, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);
  const pageRows = sorted.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  function toggleSort(key: string) {
    setPage(1);
    setSort((s) => (s?.key !== key ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null));
  }

  // Exports what the user is actually looking at — search and sort applied, pagination ignored.
  function handleExport() {
    exportToCsv(
      `${exportName}.csv`,
      columns.map((c) => c.label),
      sorted.map((row) => columns.map((c) => formatCell(rawValue(row, c), c.format))),
    );
    toast.success(`Exported ${sorted.length} rows`);
  }

  return (
    <>
      <SectionCard
        title={title}
        desc={desc ?? `${sorted.length}${sorted.length !== rows.length ? ` of ${rows.length}` : ""} rows`}
        action={
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleExport} disabled={sorted.length === 0}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {visible.map((c) => {
                  const align = c.align ?? (NUMERIC_FORMATS.includes(c.format ?? "text") ? "right" : "left");
                  const isSorted = sort?.key === c.key;
                  return (
                    <TableHead
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`cursor-pointer select-none whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider ${
                        isSorted ? "text-brand" : "text-muted-foreground"
                      } ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}
                    >
                      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
                        {c.label}
                        {isSorted
                          ? sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          : <ChevronsUpDown className="h-3 w-3 opacity-25" />}
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && [0, 1, 2, 3, 4].map((i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell colSpan={visible.length}>
                    <div className="h-4 w-full animate-pulse rounded bg-black/5" />
                  </TableCell>
                </TableRow>
              ))}
              {!loading && pageRows.map((row, i) => (
                <TableRow
                  key={i}
                  onClick={detail ? () => setOpenRow(row) : undefined}
                  className={detail ? "cursor-pointer hover:bg-canvas" : "hover:bg-canvas"}
                >
                  {visible.map((c) => {
                    const align = c.align ?? (NUMERIC_FORMATS.includes(c.format ?? "text") ? "right" : "left");
                    const value = rawValue(row, c);
                    return (
                      <TableCell
                        key={c.key}
                        className={`whitespace-nowrap text-sm ${
                          align === "right" ? "text-right" : align === "center" ? "text-center" : ""
                        } ${c.format === "mono" ? "font-mono text-xs" : ""}`}
                      >
                        {c.format === "status"
                          ? <Pill tone={statusTone(String(value ?? ""))}>{String(value ?? "—")}</Pill>
                          : <span className="text-foreground/85">{formatCell(value, c.format)}</span>}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {!loading && pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={visible.length} className="py-10 text-center text-sm text-muted-foreground">
                    {emptyLabel}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {footer}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {sorted.length === 0 ? 0 : (clamped - 1) * PAGE_SIZE + 1}–{Math.min(clamped * PAGE_SIZE, sorted.length)} of {sorted.length}
            {detail && sorted.length > 0 && <span className="ms-2 text-muted-foreground/70">· click a row for item detail</span>}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, clamped - 1))}
                disabled={clamped <= 1}
                className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40 disabled:opacity-40"
              >
                Prev
              </button>
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .slice(Math.max(0, clamped - 3), Math.max(0, clamped - 3) + 5)
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`rounded-md border px-2 py-1 ${p === clamped ? "border-brand/40 bg-brand/5 text-brand" : "border-black/10 hover:border-brand/40"}`}
                  >
                    {p}
                  </button>
                ))}
              <button
                onClick={() => setPage(Math.min(pageCount, clamped + 1))}
                disabled={clamped >= pageCount}
                className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </SectionCard>

      {detail && (
        <ReportDetailSheet row={openRow} detail={detail} onClose={() => setOpenRow(null)} exportName={exportName} />
      )}
    </>
  );
}

function ReportDetailSheet<T>({
  row,
  detail,
  onClose,
  exportName,
}: {
  row: T | null;
  detail: ReportDetail<T>;
  onClose: () => void;
  exportName: string;
}) {
  const items = row ? detail.items(row) : [];
  const fields = row ? detail.fields?.(row) ?? [] : [];

  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{detail.title(row)}</SheetTitle>
              {detail.subtitle && <SheetDescription>{detail.subtitle(row)}</SheetDescription>}
            </SheetHeader>

            <div className="mt-4 space-y-5">
              {fields.length > 0 && (
                <dl className="grid grid-cols-2 gap-2">
                  {fields.map((f) => (
                    <div key={f.label} className="rounded-lg bg-canvas px-3 py-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</dt>
                      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{f.value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {detail.itemsLabel ?? "Items"} ({items.length})
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    disabled={items.length === 0}
                    onClick={() => {
                      exportToCsv(
                        `${exportName}-detail.csv`,
                        detail.columns.map((c) => c.label),
                        items.map((item) =>
                          detail.columns.map((c) =>
                            formatCell(
                              c.value ? c.value(item as never) : (item as Record<string, unknown>)[c.key],
                              c.format,
                            ),
                          ),
                        ),
                      );
                      toast.success("Exported line items");
                    }}
                  >
                    <Download className="h-3 w-3" /> Export
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-black/5">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {detail.columns.map((c) => (
                          <TableHead
                            key={c.key}
                            className={`whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${
                              NUMERIC_FORMATS.includes(c.format ?? "text") ? "text-right" : ""
                            }`}
                          >
                            {c.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, i) => (
                        <TableRow key={i} className="hover:bg-transparent">
                          {detail.columns.map((c) => {
                            const value = c.value ? c.value(item as never) : (item as Record<string, unknown>)[c.key];
                            return (
                              <TableCell
                                key={c.key}
                                className={`whitespace-nowrap text-xs ${
                                  NUMERIC_FORMATS.includes(c.format ?? "text") ? "text-right" : ""
                                } ${c.format === "mono" ? "font-mono" : ""}`}
                              >
                                {c.format === "status"
                                  ? <Pill tone={statusTone(String(value ?? ""))}>{String(value ?? "—")}</Pill>
                                  : formatCell(value, c.format)}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                      {items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={detail.columns.length} className="py-6 text-center text-xs text-muted-foreground">
                            No line items match the current filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
