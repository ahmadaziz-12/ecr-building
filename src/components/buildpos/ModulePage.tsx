import { useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Filter, MoreHorizontal, Plus, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { getModule } from "@/lib/buildpos/modules";
import type { Severity } from "@/lib/buildpos/format";
import { getFlow, type Field, type Flow } from "@/lib/buildpos/flows";
import { FlowDialog } from "@/components/buildpos/FlowDialog";
import { useModuleLiveData } from "@/lib/api/module-live-data";
import { useFlowSubmitHandlers } from "@/lib/api/flow-submit-handlers";
import { useRowActions, type RowAction } from "@/lib/api/row-actions";
import { useRowDetails, type RowDetail } from "@/lib/api/row-details";

function tone(status: string): Severity {
  const k = status.toLowerCase();
  if (/critical|failed|overdue|rejected|expired|offline|breach|writtenoff|written off/.test(k)) return "critical";
  if (/warn|pending|queued|idle|needs|quarantine|delayed|degraded|draft|low|expiring|monitor|partial|awaiting/.test(k)) return "warning";
  if (/active|healthy|cleared|completed|reconciled|received|resolved|delivered|submitted|valid|ok|compliant|paid|approved/.test(k)) return "success";
  if (/dispatched|posted|open|in transit|intransit|in progress|assigned|onpromo|on promo/.test(k)) return "info";
  return "muted";
}

const toneKpi: Record<Severity, string> = {
  critical: "bg-critical/10 text-critical border-critical/20",
  warning: "bg-warning/15 text-[oklch(0.4_0.13_70)] border-warning/30",
  success: "bg-success/10 text-[oklch(0.35_0.1_155)] border-success/30",
  info: "bg-info/10 text-[oklch(0.35_0.12_235)] border-info/30",
  muted: "bg-black/5 text-foreground/70 border-black/10",
};

// Filter chip label -> the column header it really means, when the two don't read the same
// (e.g. "Availability" chip narrows the Status column on Stocks).
const FILTER_ALIASES: Record<string, string> = {
  Availability: "Status",
  "From Branch": "From",
  "To Branch": "To",
  "UOM Type": "Stock UOM",
  "VAT Rate": "VAT",
  "Days to Expiry": "Days Left",
};

function resolveFilterColumn(filterLabel: string, columns: string[]): number | null {
  const target = (FILTER_ALIASES[filterLabel] ?? filterLabel).toLowerCase();
  const exact = columns.findIndex((c) => c.toLowerCase() === target);
  if (exact >= 0) return exact;
  const partial = columns.findIndex((c) => c.toLowerCase().includes(target) || target.includes(c.toLowerCase()));
  return partial >= 0 ? partial : null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Refresh re-fetches the live queries backing each page instead of just spinning — mirrors the
// query keys each api/*.ts module already uses (see useCategories/useProducts/etc query keys).
const REFRESH_KEYS: Record<string, string[][]> = {
  "/stock/inventory": [["catalog", "products"]],
  "/admin/categories": [["catalog", "categories"]],
  "/stock/stocks": [["inventory", "stock-levels"]],
  "/stock/expiry": [["inventory", "stock-batches"]],
  "/stock/transfers": [["inventory", "transfers"]],
  "/stock/bundles": [["catalog", "bundles"]],
};

const PAGE_SIZE = 10;

type ActiveFlow = {
  flow: Flow;
  initialValues?: Record<string, string>;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  fieldOverrides?: Record<string, Partial<Field>>;
};

export function ModulePage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const m = getModule(pathname);
  const [activeFlow, setActiveFlow] = useState<ActiveFlow | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [detailRow, setDetailRow] = useState<{ id: number | undefined; row: (string | number)[] } | null>(null);

  const live = useModuleLiveData(pathname);
  const submitHandlers = useFlowSubmitHandlers();
  const queryClient = useQueryClient();

  function openFlow(
    title: string,
    initialValues: Record<string, string>,
    onSubmit: (values: Record<string, string>) => Promise<void>,
    fieldOverrides?: Record<string, Partial<Field>>,
  ) {
    const f = getFlow(title);
    if (!f) { toast.error(`No flow configured for "${title}".`); return; }
    setActiveFlow({ flow: f, initialValues, onSubmit, fieldOverrides });
  }

  const rowActionsFor = useRowActions(pathname, openFlow);
  const rowDetailFor = useRowDetails(pathname, detailRow?.id);

  // A cross-linked page load (e.g. a category's "View SKUs" -> /stock/inventory?category=Cement)
  // seeds the filter/search state instead of landing on an unfiltered table.
  useEffect(() => {
    const seeded: Record<string, string> = {};
    if (typeof search.category === "string") seeded.Category = search.category;
    if (typeof search.status === "string") seeded.Status = search.status;
    setColumnFilters(seeded);
    setSearchText(typeof search.sku === "string" ? search.sku : typeof search.code === "string" ? search.code : "");
    setActiveTab(0);
    setPage(1);
  }, [pathname, search.category, search.status, search.sku, search.code]);

  const flow = getFlow(m?.primaryAction);

  const columns = live?.columns ?? m?.columns ?? [];
  const statusCol = live?.statusCol ?? m?.statusCol;
  const kpis = live?.kpis ?? m?.kpis ?? [];
  const baseRows = live?.rows ?? m?.rows ?? [];
  const ids = live?.ids;

  const indexed = useMemo(() => baseRows.map((row, i) => ({ row, id: ids?.[i] })), [baseRows, ids]);

  const filtered = useMemo(() => {
    let rows = indexed;
    if (m?.tabs && activeTab > 0 && !/^all/i.test(m.tabs[activeTab] ?? "") && statusCol !== undefined) {
      const tabLabel = m.tabs[activeTab];
      rows = rows.filter(({ row }) => {
        const cell = norm(String(row[statusCol] ?? ""));
        const tab = norm(tabLabel);
        return cell.includes(tab) || tab.includes(cell);
      });
    }
    for (const [label, value] of Object.entries(columnFilters)) {
      if (!value) continue;
      const colIdx = resolveFilterColumn(label, columns);
      if (colIdx === null) continue;
      rows = rows.filter(({ row }) => String(row[colIdx] ?? "").toLowerCase().includes(value.toLowerCase()));
    }
    if (searchText.trim()) {
      const needle = searchText.trim().toLowerCase();
      rows = rows.filter(({ row }) => row.some((cell) => String(cell).toLowerCase().includes(needle)));
    }
    return rows;
  }, [indexed, m?.tabs, activeTab, statusCol, columnFilters, searchText, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  function clearFilters() {
    setColumnFilters({});
    setSearchText("");
    setActiveTab(0);
    setPage(1);
  }

  function handleRefresh() {
    const keys = REFRESH_KEYS[pathname];
    if (!keys) return;
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    toast.success("Refreshed");
  }

  function handleExport() {
    const csvRows = [columns, ...filtered.map(({ row }) => row.map((c) => String(c)))];
    const csv = csvRows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(m?.title ?? "export").toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleBarAction(label: string) {
    if (label === "Export") { handleExport(); return; }
    if (label === m?.primaryAction && flow) { openFlow(label, {}, submitHandlers[flow.key]); return; }
  }

  if (!m) {
    return (
      <SectionCard title="Module not configured" desc={`No catalog entry for ${pathname}.`}>
        <p className="text-sm text-muted-foreground">Add an entry in <code className="font-mono">src/lib/buildpos/modules.ts</code>.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">{m.group}</p>
          <h1 className="font-display text-2xl font-bold text-foreground">{m.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{m.desc}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-9 gap-1.5 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport} className="h-9 gap-1.5 text-muted-foreground hover:text-foreground">
            <Download className="h-4 w-4" /> Export
          </Button>
          {m.primaryAction && (
            <Button
              size="sm"
              onClick={() => flow && openFlow(m.primaryAction!, {}, submitHandlers[flow.key])}
              className="h-9 gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Plus className="h-4 w-4" /> {m.primaryAction}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {m.tabs && (
        <div className="flex flex-wrap gap-1 border-b border-black/5">
          {m.tabs.map((t, i) => (
            <button
              key={t}
              onClick={() => { setActiveTab(i); setPage(1); }}
              className={`relative px-3 py-2 text-sm font-medium transition ${
                i === activeTab ? "text-brand" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
              {i === activeTab && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
        <Filter className="ml-1 h-4 w-4 text-muted-foreground" />
        {m.filters.map((f) => {
          if (f === "Search") {
            return (
              <input
                key={f}
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
                placeholder="Search…"
                className="h-8 w-40 rounded-md border border-black/10 bg-canvas px-2.5 text-xs outline-none focus:border-brand/40"
              />
            );
          }
          const colIdx = resolveFilterColumn(f, columns);
          if (colIdx === null) {
            return (
              <span key={f} className="rounded-md border border-black/10 bg-canvas px-2.5 py-1 text-xs font-medium text-muted-foreground/70">
                {f}
              </span>
            );
          }
          const options = Array.from(new Set(baseRows.map((row) => String(row[colIdx] ?? "")))).filter(Boolean).sort();
          return (
            <select
              key={f}
              value={columnFilters[f] ?? ""}
              onChange={(e) => { setColumnFilters((s) => ({ ...s, [f]: e.target.value })); setPage(1); }}
              className="h-8 rounded-md border border-black/10 bg-canvas px-2 text-xs font-medium text-foreground hover:border-brand/40 focus:border-brand/40 focus:outline-none"
            >
              <option value="">{f}</option>
              {options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          );
        })}
        <Button size="sm" variant="ghost" onClick={clearFilters} className="ml-auto h-8 gap-1 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,10,50,0.04)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {k.label}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-foreground">{k.value}</p>
            <span
              className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneKpi[k.tone]}`}
            >
              {k.sub}
            </span>
          </div>
        ))}
      </div>

      {/* Main table */}
      <SectionCard
        title={m.tableTitle}
        desc={live ? `${filtered.length} of ${baseRows.length} records · live data` : `${filtered.length} of ${baseRows.length} records · showing filtered results`}
        action={
          m.actions && (
            <div className="flex flex-wrap gap-1.5">
              {m.actions.slice(0, 4).map((a) => (
                <button
                  key={a}
                  onClick={() => handleBarAction(a)}
                  className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-foreground hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                >
                  {a}
                </button>
              ))}
            </div>
          )
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {c}
                  </TableHead>
                ))}
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map(({ row, id }, i) => {
                const statusText = statusCol !== undefined ? String(row[statusCol] ?? "") : "";
                const actions = rowActionsFor(id, row, statusText);
                return (
                  <TableRow key={id ?? i} onClick={() => setDetailRow({ id, row })} className="cursor-pointer hover:bg-canvas">
                    {row.map((cell, j) => {
                      const isStatus = statusCol === j;
                      const isFirst = j === 0;
                      return (
                        <TableCell
                          key={j}
                          className={`whitespace-nowrap ${
                            isFirst ? "font-mono text-xs text-foreground" : "text-sm"
                          }`}
                        >
                          {isStatus ? (
                            <Pill tone={tone(String(cell))}>{String(cell)}</Pill>
                          ) : (
                            <span className={isFirst ? "" : "text-foreground/85"}>{cell}</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            disabled={actions.length === 0}
                            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:opacity-40"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        {actions.length > 0 && (
                          <DropdownMenuContent align="end">
                            {actions.map((a) => (
                              <DropdownMenuItem
                                key={a.label}
                                onClick={a.onClick}
                                className={a.tone === "critical" ? "text-critical focus:text-critical" : undefined}
                              >
                                {a.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        )}
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                    No records match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {filtered.length === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1}–{Math.min(clampedPage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage <= 1}
              className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40 disabled:opacity-40"
            >
              Prev
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1)
              .slice(Math.max(0, clampedPage - 3), Math.max(0, clampedPage - 3) + 5)
              .map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`rounded-md border px-2 py-1 ${p === clampedPage ? "border-brand/40 bg-brand/5 text-brand" : "border-black/10 hover:border-brand/40"}`}
                >
                  {p}
                </button>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={clampedPage >= pageCount}
              className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>
      <FlowDialog
        flow={activeFlow?.flow}
        open={!!activeFlow}
        onOpenChange={(v) => !v && setActiveFlow(null)}
        onSubmit={activeFlow?.onSubmit}
        initialValues={activeFlow?.initialValues}
        fieldOverrides={activeFlow?.fieldOverrides}
      />
      <RowDetailSheet
        detailRow={detailRow}
        onOpenChange={(v) => !v && setDetailRow(null)}
        detail={detailRow ? rowDetailFor(detailRow.id, detailRow.row) : null}
        columns={columns}
        statusCol={statusCol}
        actions={detailRow ? rowActionsFor(detailRow.id, detailRow.row, statusCol !== undefined ? String(detailRow.row[statusCol] ?? "") : "") : []}
        onAction={(fn) => { fn(); setDetailRow(null); }}
      />
    </div>
  );
}

function RowDetailSheet({
  detailRow,
  onOpenChange,
  detail,
  columns,
  statusCol,
  actions,
  onAction,
}: {
  detailRow: { id: number | undefined; row: (string | number)[] } | null;
  onOpenChange: (v: boolean) => void;
  detail: RowDetail | null;
  columns: string[];
  statusCol: number | undefined;
  actions: RowAction[];
  onAction: (fn: () => void) => void;
}) {
  const fallbackStatus = detailRow && statusCol !== undefined ? String(detailRow.row[statusCol] ?? "") : "";
  const statusText = detail?.statusText ?? fallbackStatus;

  return (
    <Sheet open={!!detailRow} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {detailRow && (
          <>
            <SheetHeader>
              <SheetTitle>{detail?.title ?? String(detailRow.row[0] ?? "Details")}</SheetTitle>
              {detail?.subtitle && <SheetDescription>{detail.subtitle}</SheetDescription>}
            </SheetHeader>
            <div className="mt-4 space-y-5">
              {statusText && (
                <Pill tone={tone(statusText)}>{statusText}</Pill>
              )}
              {detail ? (
                <>
                  {detail.sections.map((s) => (
                    <div key={s.heading}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.heading}</p>
                      <dl className="grid grid-cols-2 gap-2">
                        {s.fields.map((f) => (
                          <div key={f.label} className="rounded-lg bg-canvas px-3 py-2">
                            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</dt>
                            <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                  {detail.tables?.map((t) => (
                    <div key={t.heading}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.heading}</p>
                      <div className="overflow-x-auto rounded-lg border border-black/5">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              {t.columns.map((c) => (
                                <TableHead key={c} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {c}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {t.rows.map((r, i) => (
                              <TableRow key={i} className="hover:bg-transparent">
                                {r.map((cell, j) => (
                                  <TableCell key={j} className="whitespace-nowrap text-xs">{cell}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <dl className="grid grid-cols-2 gap-2">
                  {columns.map((c, j) => (
                    <div key={c} className="rounded-lg bg-canvas px-3 py-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{c}</dt>
                      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{String(detailRow.row[j] ?? "—")}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {actions.length > 0 && (
              <SheetFooter className="mt-6 flex-row flex-wrap gap-2">
                {actions.map((a) => (
                  <Button
                    key={a.label}
                    variant={a.tone === "critical" ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => onAction(a.onClick)}
                  >
                    {a.label}
                  </Button>
                ))}
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
