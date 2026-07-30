import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Filter, MoreHorizontal, Plus, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import {
  MultiSelectFilter,
  DateRangeFilter,
  resolveDateRangeBounds,
  type DateRangeValue,
} from "@/components/buildpos/FilterControls";
import { getModule } from "@/lib/buildpos/modules";
import { CurrencyText } from "@/lib/buildpos/currency";
import type { Severity } from "@/lib/buildpos/format";
import { getFlow, type Field, type Flow } from "@/lib/buildpos/flows";
import { FlowDialog } from "@/components/buildpos/FlowDialog";
import { CreatePricingRuleDialog } from "@/components/buildpos/CreatePricingRuleDialog";
import type { PricingRuleDto } from "@/lib/api/pos";
import { BundleFormDialog } from "@/components/buildpos/BundleFormDialog";
import type { BundleDto } from "@/lib/api/bundles";
import { ReturnPolicySettingsDialog } from "@/components/buildpos/pos/ReturnPolicySettingsDialog";
import {
  useReturnPolicyConfig,
  type ReturnPolicyConfigDto,
  type ReturnDto,
} from "@/lib/api/finance";
import { ApproveExchangeDialog } from "@/components/buildpos/pos/ApproveExchangeDialog";
import { NoReceiptReturnDialog } from "@/components/buildpos/pos/NoReceiptReturnDialog";
import { PrintLabelDialog } from "@/components/buildpos/pos/PrintLabelDialog";
import { PrintBarcodeDialog } from "@/components/buildpos/pos/PrintBarcodeDialog";
import { useModuleLiveData } from "@/lib/api/module-live-data";
import type { LiveKpi } from "@/lib/api/admin";
import { useFlowSubmitHandlers } from "@/lib/api/flow-submit-handlers";
import { useRowActions, type RowAction } from "@/lib/api/row-actions";
import {
  useRowDetails,
  type DetailSection,
  type DetailTable,
  type RowDetail,
} from "@/lib/api/row-details";
import { useBulkActions } from "@/lib/api/bulk-actions";
import { BulkActionSheet } from "@/components/buildpos/BulkActionSheet";
import { NamePromptDialog } from "@/components/buildpos/NamePromptDialog";
import { CardCustomizer } from "@/components/buildpos/CardCustomizer";
import { applyCardPreference, useCardPreferences } from "@/lib/buildpos/card-preferences";
import { cols } from "@/lib/buildpos/grid";

function tone(status: string): Severity {
  const k = status.toLowerCase();
  if (/critical|failed|overdue|rejected|expired|offline|breach|writtenoff|written off/.test(k))
    return "critical";
  if (
    /warn|pending|queued|idle|needs|quarantine|delayed|degraded|draft|low|expiring|monitor|partial|awaiting/.test(
      k,
    )
  )
    return "warning";
  // Negated words must be checked before the success regex substring-matches inside them
  // ("Inactive" contains "active", "Invalid" contains "valid").
  if (/inactive|in-active|disabled|deactivated|suspended|invalid/.test(k)) return "muted";
  if (
    /active|healthy|cleared|completed|reconciled|received|resolved|delivered|submitted|valid|ok|compliant|paid|approved/.test(
      k,
    )
  )
    return "success";
  if (
    /dispatched|posted|open|in transit|intransit|in progress|assigned|onpromo|on promo|scheduled/.test(
      k,
    )
  )
    return "info";
  return "muted";
}

// BRD §3.2.1/§3.2.4 defaults — only used before /api/finance/returns/policy-config has loaded.
const DEFAULT_RETURN_POLICY_CONFIG: ReturnPolicyConfigDto = {
  dualAuthCashThreshold: 500,
  standardWindowDays: 15,
  surplusWindowDays: 90,
};

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
  "Sync Date": "Last Sync",
  // "Item" is the reports' name for a product picker; every stock table calls the column "Product".
  Item: "Product",
};

function resolveFilterColumn(filterLabel: string, columns: string[]): number | null {
  const target = (FILTER_ALIASES[filterLabel] ?? filterLabel).toLowerCase();
  const exact = columns.findIndex((c) => c.toLowerCase() === target);
  if (exact >= 0) return exact;
  const partial = columns.findIndex(
    (c) => c.toLowerCase().includes(target) || target.includes(c.toLowerCase()),
  );
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
  "/stock/branch-stock": [["inventory", "branch-stock-levels"]],
  "/stock/movements": [["inventory", "stock-movements"]],
  "/stock/expiry": [["inventory", "stock-batches"]],
  "/stock/transfers": [["inventory", "transfers"]],
  "/stock/bundles": [["catalog", "bundles"]],
  "/insights/bi": [["insights", "bi"]],
};

const PAGE_SIZE = 10;

type ActiveFlow = {
  flow: Flow;
  initialValues?: Record<string, string>;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  fieldOverrides?: Record<string, Partial<Field>>;
};

type SavedView = {
  name: string;
  columnFilters: Record<string, string[]>;
  dateRangeFilters: Record<string, DateRangeValue>;
  activeTab: number;
  searchText: string;
};

export function ModulePage({
  onOpenKioskPairing,
}: { onOpenKioskPairing?: (terminalId: number) => void } = {}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const navigate = useNavigate();
  const m = getModule(pathname);
  const [activeFlow, setActiveFlow] = useState<ActiveFlow | null>(null);
  // Finance > Pricing's "Create Pricing Rule" gets a bespoke, type-aware dialog instead of the
  // generic free-text FlowDialog — Trade Tier/Quantity/Coupon rules need structured fields (branch,
  // SKU, quantity threshold) the generic flow's plain-text Condition/Action strings can't drive.
  const [pricingRuleDialogOpen, setPricingRuleDialogOpen] = useState(false);
  // Set by the "Edit" row action below to reopen the same dialog pre-filled for an existing rule
  // instead of a blank Create form — null means the dialog (if open) is in create mode.
  const [editingPricingRule, setEditingPricingRule] = useState<PricingRuleDto | null>(null);
  // Stock > Bundles' "Create Bundle" gets a bespoke dialog too — a real product-search line builder
  // and bundle-type picker the generic flow's free-text "SKU x Qty" tags field can't drive. Same
  // pattern as Pricing Rules above.
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<BundleDto | null>(null);
  // Finance > Customer Returns' "Return Policy" gets a bespoke settings dialog for the dual-auth
  // cash threshold + return windows — same pattern as Pricing's rule dialog above.
  const [returnPolicyDialogOpen, setReturnPolicyDialogOpen] = useState(false);
  // BRD §3.2.1: approving an Exchange-type return needs a real payment step (the net difference
  // between the return's credit and the replacement item(s)) — set by the "Complete Exchange" row
  // action instead of the generic text-field "Approve Return" flow every other return type uses.
  const [approvingExchangeReturn, setApprovingExchangeReturn] = useState<ReturnDto | null>(null);
  // BRD §3.2.2 (no-receipt returns): "New Return" used to open a mock free-text flow (a plain "SKU ·
  // Qty · Refund Amount" tags field with no real backing) — replaced with a real customer/product
  // picker that actually creates a return with no original order.
  const [noReceiptDialogOpen, setNoReceiptDialogOpen] = useState(false);
  // Product Catalog's "Print Barcode"/"Print Label" row actions open these instead of firing a
  // default-template print blind — see PrintBarcodeDialog.tsx / PrintLabelDialog.tsx.
  const [printingBarcodeProduct, setPrintingBarcodeProduct] = useState<{ id: number; sku: string; name: string; barcode: string | null } | null>(null);
  const [printingLabelProduct, setPrintingLabelProduct] = useState<{ id: number; sku: string; name: string; sellingPrice: number } | null>(null);
  const { data: returnPolicyConfig } = useReturnPolicyConfig(pathname === "/finance/returns");
  const [activeTab, setActiveTab] = useState(0);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [dateRangeFilters, setDateRangeFilters] = useState<Record<string, DateRangeValue>>({});
  const [searchText, setSearchText] = useState("");
  // Label of the summary card currently acting as a filter (see the KPI grid below) — null when the
  // table is showing everything.
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [detailRow, setDetailRow] = useState<{
    id: number | undefined;
    row: (string | number)[];
  } | null>(null);
  const [activeBulkLabel, setActiveBulkLabel] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveViewOpen, setSaveViewOpen] = useState(false);

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
    if (!f) {
      toast.error(`No flow configured for "${title}".`);
      return;
    }
    setActiveFlow({ flow: f, initialValues, onSubmit, fieldOverrides });
  }

  const rowActionsFor = useRowActions(
    pathname,
    openFlow,
    onOpenKioskPairing,
    setEditingPricingRule,
    setApprovingExchangeReturn,
    setEditingBundle,
    setPrintingBarcodeProduct,
    setPrintingLabelProduct,
  );
  const rowDetailFor = useRowDetails(pathname, detailRow?.id);
  const showDetail = (id: number, row: (string | number)[]) => setDetailRow({ id, row });
  const bulkActions = useBulkActions(pathname, openFlow, showDetail);

  // A cross-linked page load (e.g. a category's "View SKUs" -> /stock/inventory?category=Cement)
  // seeds the filter/search state instead of landing on an unfiltered table.
  useEffect(() => {
    const seeded: Record<string, string[]> = {};
    if (typeof search.category === "string") seeded.Category = [search.category];
    if (typeof search.status === "string") seeded.Status = [search.status];
    if (typeof search.module === "string") seeded.Module = [search.module];
    setColumnFilters(seeded);
    setSearchText(
      typeof search.sku === "string"
        ? search.sku
        : typeof search.code === "string"
          ? search.code
          : "",
    );
    setActiveTab(0);
    setActiveKpi(null);
    setPage(1);
  }, [pathname, search.category, search.status, search.module, search.sku, search.code]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`buildpos:views:${pathname}`);
      setSavedViews(raw ? (JSON.parse(raw) as SavedView[]) : []);
    } catch {
      setSavedViews([]);
    }
  }, [pathname]);

  function handleSaveView(name: string) {
    const next = [
      ...savedViews.filter((v) => v.name !== name),
      { name, columnFilters, dateRangeFilters, activeTab, searchText },
    ];
    setSavedViews(next);
    localStorage.setItem(`buildpos:views:${pathname}`, JSON.stringify(next));
    toast.success(`View "${name}" saved.`);
  }

  function handleLoadView(name: string) {
    const view = savedViews.find((v) => v.name === name);
    if (!view) return;
    setColumnFilters(view.columnFilters);
    setDateRangeFilters(view.dateRangeFilters ?? {});
    setActiveTab(view.activeTab);
    setSearchText(view.searchText);
    setPage(1);
  }

  const flow = getFlow(m?.primaryAction);

  const columns = live?.columns ?? m?.columns ?? [];
  const statusCol = live?.statusCol ?? m?.statusCol;
  // A live page whose mapper supplies no kpis renders NO kpi grid — falling back to the static
  // catalog numbers would show fake figures next to real rows. Pure-demo pages keep theirs.
  // Static catalog KPIs share LiveKpi's shape minus the optional `filter` — only live mappers can
  // supply a predicate, since a demo page's rows aren't the rows the number was counted from.
  const kpis: LiveKpi[] = live ? (live.kpis ?? []) : (m?.kpis ?? []);
  // Which summary cards this user wants on this page, and in what order — scoped per route so the
  // arrangement on Product Catalog is independent of the one on Categories.
  const kpiLabels = useMemo(() => kpis.map((k) => k.label), [kpis]);
  const cardPrefs = useCardPreferences(`module.${pathname}`, kpiLabels);
  const visibleKpis = useMemo(
    () => applyCardPreference(kpis, (k) => k.label, cardPrefs.order, cardPrefs.hidden),
    [kpis, cardPrefs.order, cardPrefs.hidden],
  );
  const baseRows = live?.rows ?? m?.rows ?? [];
  const ids = live?.ids;

  const indexed = useMemo(() => baseRows.map((row, i) => ({ row, id: ids?.[i] })), [baseRows, ids]);

  const filtered = useMemo(() => {
    let rows = indexed;
    // Tabs match against tabFilterCols when set (e.g. /finance/returns tabs are return TYPES,
    // not statuses); a row matches if ANY listed column matches. Defaults to the status column.
    const tabCols = m?.tabFilterCols ?? (statusCol !== undefined ? [statusCol] : []);
    if (m?.tabs && activeTab > 0 && !/^all/i.test(m.tabs[activeTab] ?? "") && tabCols.length > 0) {
      const tab = norm(m.tabs[activeTab]);
      rows = rows.filter(({ row }) =>
        tabCols.some((col) => {
          const cell = norm(String(row[col] ?? ""));
          return cell !== "" && (cell.includes(tab) || tab.includes(cell));
        }),
      );
    }
    for (const [label, values] of Object.entries(columnFilters)) {
      if (!values || values.length === 0) continue;
      const colIdx = resolveFilterColumn(label, columns);
      if (colIdx === null) continue;
      rows = rows.filter(({ row }) => values.includes(String(row[colIdx] ?? "")));
    }
    for (const [label, range] of Object.entries(dateRangeFilters)) {
      const bounds = resolveDateRangeBounds(range);
      if (!bounds) continue;
      const colIdx = resolveFilterColumn(label, columns);
      if (colIdx === null) continue;
      rows = rows.filter(({ row }) => {
        const ms = Date.parse(String(row[colIdx] ?? ""));
        return Number.isNaN(ms) ? true : ms >= bounds.from.getTime() && ms <= bounds.to.getTime();
      });
    }
    if (searchText.trim()) {
      const needle = searchText.trim().toLowerCase();
      rows = rows.filter(({ row }) =>
        row.some((cell) => String(cell).toLowerCase().includes(needle)),
      );
    }
    // A clicked summary card narrows to exactly the rows that card counted. Matched by label
    // against the live KPI list so a stale selection (the mapper changed, the page changed) just
    // stops applying instead of blanking the table.
    const kpiFilter = activeKpi ? kpis.find((k) => k.label === activeKpi)?.filter : undefined;
    if (kpiFilter) rows = rows.filter(({ row }) => kpiFilter(row));
    return rows;
  }, [
    indexed,
    m?.tabs,
    m?.tabFilterCols,
    activeTab,
    statusCol,
    columnFilters,
    dateRangeFilters,
    searchText,
    columns,
    activeKpi,
    kpis,
  ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  // Some pages (e.g. read-only ledgers like Stock Movements) have no row actions wired at all —
  // an always-disabled "..." menu on every row is dead UI, so the column only renders when at
  // least one visible row actually has something to do.
  const hasRowActions = pageRows.some(({ id, row }) => {
    const statusText = statusCol !== undefined ? String(row[statusCol] ?? "") : "";
    return rowActionsFor(id, row, statusText).length > 0;
  });

  function clearFilters() {
    setColumnFilters({});
    setDateRangeFilters({});
    setSearchText("");
    setActiveTab(0);
    setActiveKpi(null);
    setPage(1);
  }

  function handleRefresh() {
    const keys = REFRESH_KEYS[pathname];
    // Routes without a registered key set invalidate everything so Refresh always refetches
    // instead of silently no-opping.
    if (keys) keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    else queryClient.invalidateQueries();
    toast.success("Refreshed");
  }

  function handleExport() {
    const csvRows = [columns, ...filtered.map(({ row }) => row.map((c) => String(c)))];
    const csv = csvRows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(m?.title ?? "export").toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleBarAction(label: string) {
    if (label === "Export") {
      handleExport();
      return;
    }
    if (label === "Refresh") {
      handleRefresh();
      return;
    }
    if (label === "Save View") {
      setSaveViewOpen(true);
      return;
    }
    // "Audit" always means the same thing everywhere it appears: jump to this record's real,
    // already-filterable audit trail instead of duplicating that view inline.
    if (label === "Audit" && pathname !== "/admin/audit-logs") {
      navigate({ to: "/admin/audit-logs", search: { module: "Admin" } });
      return;
    }
    // Plans has no real payment gateway (see Admin Overview's own health check) — "Upgrade" and
    // "Contact Sales" honestly route to a real lead instead of faking a charge.
    if (label === "Upgrade" || label === "Contact Sales") {
      window.location.href = `mailto:sales@buildpos.example?subject=${encodeURIComponent(`${label} request`)}&body=${encodeURIComponent("Hi team,\n\nWe'd like to talk about our BuildPOS subscription plan.\n\nThanks")}`;
      return;
    }
    if (label === "Download Invoice") {
      handleExport();
      return;
    }
    if (pathname === "/finance/pricing" && label === "Create Pricing Rule") {
      setPricingRuleDialogOpen(true);
      return;
    }
    if (pathname === "/stock/bundles" && label === "Create Bundle") {
      setBundleDialogOpen(true);
      return;
    }
    if (pathname === "/finance/returns" && label === "Return Policy") {
      setReturnPolicyDialogOpen(true);
      return;
    }
    if (pathname === "/finance/returns" && label === "New Return") {
      setNoReceiptDialogOpen(true);
      return;
    }
    if (label === m?.primaryAction && flow) {
      openFlow(label, {}, submitHandlers[flow.key]);
      return;
    }
    // A row-scoped action (Approve, Dispatch, Activate…) with no single row selected here opens a
    // picker over the live-eligible records instead of silently no-opping.
    if (bulkActions?.[label]) {
      setActiveBulkLabel(label);
      return;
    }
    // Any other declared action (e.g. "Bin Setup") opens its own flow if one is defined —
    // previously only the primary action ever did anything, silently no-opping every other button.
    const f = getFlow(label);
    if (f) {
      openFlow(label, {}, submitHandlers[f.key]);
      return;
    }
    toast.error(`"${label}" isn't wired up yet.`);
  }

  if (!m) {
    return (
      <SectionCard title="Module not configured" desc={`No catalog entry for ${pathname}.`}>
        <p className="text-sm text-muted-foreground">
          Add an entry in <code className="font-mono">src/lib/buildpos/modules.ts</code>.
        </p>
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
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Download className="h-4 w-4" /> Export
          </Button>
          {m.primaryAction && (
            <Button
              size="sm"
              onClick={() => handleBarAction(m.primaryAction!)}
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
              onClick={() => {
                setActiveTab(i);
                setPage(1);
              }}
              className={`relative px-3 py-2 text-sm font-medium transition ${
                i === activeTab ? "text-brand" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
              {i === activeTab && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Filters — Search reads first and widest (the filter someone reaches for first), the
          rest of the fields sit smaller alongside it, and Date Range always trails last. */}
      <div className="ui-filter-row rounded-xl border border-black/5 bg-white p-2 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
        <Filter className="ml-1 h-4 w-4 flex-none text-muted-foreground" />
        {[...m.filters]
          .sort((a, b) => (a === "Search" ? -1 : b === "Search" ? 1 : 0))
          .map((f) => {
            if (f === "Search") {
              return (
                <input
                  key={f}
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search…"
                  className="ui-control ui-filter-item max-w-[18rem] flex-[2_1_12rem] rounded-md border border-black/10 bg-canvas px-3 text-sm font-medium outline-none focus:border-brand/40"
                />
              );
            }
            const colIdx = resolveFilterColumn(f, columns);
            // A filter that maps to no column can't narrow anything. It used to render as a
            // non-interactive chip that looked like a control and silently did nothing — the class
            // of bug behind "the date filter on Supplier Returns doesn't work". Render nothing
            // instead, so the bar only ever shows filters that actually filter.
            if (colIdx === null) return null;
            const options = Array.from(new Set(baseRows.map((row) => String(row[colIdx] ?? ""))))
              .filter(Boolean)
              .sort();
            return (
              <MultiSelectFilter
                key={f}
                label={f}
                allLabel={`All ${f}`}
                options={options}
                selected={columnFilters[f] ?? []}
                onChange={(next) => {
                  setColumnFilters((s) => ({ ...s, [f]: next }));
                  setPage(1);
                }}
                triggerClassName="ui-filter-item w-full min-w-0 max-w-[14rem]"
              />
            );
          })}
        {m.dateRangeFilters?.map((f) =>
          resolveFilterColumn(f, columns) === null ? null : (
            <DateRangeFilter
              key={f}
              label={f}
              value={dateRangeFilters[f] ?? { preset: "" }}
              onChange={(v) => {
                setDateRangeFilters((s) => ({ ...s, [f]: v }));
                setPage(1);
              }}
              triggerClassName="ui-filter-item w-full min-w-0"
            />
          ),
        )}
        {savedViews.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && handleLoadView(e.target.value)}
            className="ui-control ui-filter-item rounded-md border border-black/10 bg-canvas px-2 text-xs font-medium text-foreground hover:border-brand/40 focus:border-brand/40 focus:outline-none"
          >
            <option value="">Saved views…</option>
            {savedViews.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={clearFilters}
          className="ui-control ml-auto flex-none gap-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>

      {/* KPI grid. A KPI whose mapper supplied a `filter` predicate is a real control: clicking it
          narrows the table below to exactly the rows it counted, and clicking it again clears.
          KPIs with no predicate (totals like "Categories") stay plain, non-interactive readouts. */}
      {kpis.length > 0 && (
        <div className="flex justify-end">
          <CardCustomizer
            labels={Object.fromEntries(kpis.map((k) => [k.label, k.label]))}
            prefs={cardPrefs}
          />
        </div>
      )}
      {kpis.length > 0 && (
        <div className={`ui-card-grid ${cols(visibleKpis.length)}`}>
          {visibleKpis.map((k) => {
            const interactive = typeof k.filter === "function";
            const isActive = activeKpi === k.label;
            const body = (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {k.label}
                </p>
                <p className="mt-1 font-display text-xl font-bold text-foreground">
                  <CurrencyText value={k.value} />
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneKpi[k.tone]}`}
                >
                  <CurrencyText value={k.sub} />
                </span>
                {interactive && (
                  <span className="mt-2 block text-[10px] font-medium text-brand">
                    {isActive ? "Filtering · click to clear" : "Click to filter"}
                  </span>
                )}
              </>
            );
            if (!interactive) {
              return (
                <div
                  key={k.label}
                  className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,10,50,0.04)]"
                >
                  {body}
                </div>
              );
            }
            return (
              <button
                key={k.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setActiveKpi(isActive ? null : k.label);
                  setPage(1);
                }}
                className={`rounded-2xl border p-3.5 text-left shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md ${
                  isActive
                    ? "border-brand bg-brand/5 ring-1 ring-brand/30"
                    : "border-black/5 bg-white"
                }`}
              >
                {body}
              </button>
            );
          })}
        </div>
      )}

      {/* Progress stats (Devices-style health/sync/connectivity bars) */}
      {live?.progressStats && live.progressStats.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {live.progressStats.map((p) => (
            <div
              key={p.label}
              className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,10,50,0.04)]"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {p.label}
                </p>
                <span className="text-xs font-semibold text-foreground">{p.pct}%</span>
              </div>
              <Progress value={p.pct} className="mt-2 h-1.5" />
            </div>
          ))}
        </div>
      )}

      {/* Main content: card grid or table */}
      {m.layout === "cards" ? (
        <SectionCard
          title={m.tableTitle}
          desc={
            live
              ? `${filtered.length} of ${baseRows.length} records · live data`
              : `${filtered.length} of ${baseRows.length} records · showing filtered results`
          }
          action={
            m.actions && (
              <div className="flex flex-wrap gap-1.5">
                {m.actions.map((a) => (
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
          <div className={`ui-card-grid ${cols(pageRows.length)}`}>
            {pageRows.map(({ row, id }, i) => {
              const statusText = statusCol !== undefined ? String(row[statusCol] ?? "") : "";
              const actions = rowActionsFor(id, row, statusText);
              const cfg = m.cardConfig;
              const title = cfg ? String(row[cfg.titleCol] ?? "") : String(row[0] ?? "");
              const subtitle =
                cfg?.subtitleCol !== undefined ? String(row[cfg.subtitleCol] ?? "") : undefined;
              return (
                <Card
                  key={id ?? i}
                  onClick={() => setDetailRow({ id, row })}
                  className="cursor-pointer p-4 transition hover:border-brand/30 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-bold text-foreground">
                        {title}
                      </p>
                      {subtitle && (
                        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                      )}
                    </div>
                    {statusText && <Pill tone={tone(statusText)}>{statusText}</Pill>}
                  </div>
                  {cfg?.statCols && cfg.statCols.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {cfg.statCols.map((s) => (
                        <div key={s.label} className="rounded-lg bg-canvas px-2.5 py-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {s.label}
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            <CurrencyText value={String(row[s.col] ?? "")} />
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {actions.length > 0 && (
                    <div
                      className="mt-3 flex flex-wrap gap-1.5 border-t border-black/5 pt-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {actions.map((a) => (
                        <button
                          key={a.label}
                          onClick={a.onClick}
                          className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                            a.tone === "critical"
                              ? "border-critical/30 text-critical hover:bg-critical/5"
                              : "border-black/10 text-foreground hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                          }`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
            {pageRows.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                No records match the current filters.
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {filtered.length === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1}–
              {Math.min(clampedPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, clampedPage - 1))}
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
                onClick={() => setPage(Math.min(pageCount, clampedPage + 1))}
                disabled={clampedPage >= pageCount}
                className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard
          title={m.tableTitle}
          desc={
            live
              ? `${filtered.length} of ${baseRows.length} records · live data`
              : `${filtered.length} of ${baseRows.length} records · showing filtered results`
          }
          action={
            m.actions && (
              <div className="flex flex-wrap gap-1.5">
                {m.actions.map((a) => (
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
                    <TableHead
                      key={c}
                      className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      <CurrencyText value={c} />
                    </TableHead>
                  ))}
                  {hasRowActions && <TableHead className="w-8" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map(({ row, id }, i) => {
                  const statusText = statusCol !== undefined ? String(row[statusCol] ?? "") : "";
                  const actions = rowActionsFor(id, row, statusText);
                  return (
                    <TableRow
                      key={id ?? i}
                      onClick={() => setDetailRow({ id, row })}
                      className="cursor-pointer hover:bg-canvas"
                    >
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
                              <span className={isFirst ? "" : "text-foreground/85"}>
                                <CurrencyText value={String(cell)} />
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                      {hasRowActions && (
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
                                    className={
                                      a.tone === "critical"
                                        ? "text-critical focus:text-critical"
                                        : undefined
                                    }
                                  >
                                    {a.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            )}
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {pageRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + (hasRowActions ? 1 : 0)}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No records match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {filtered.length === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1}–
              {Math.min(clampedPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, clampedPage - 1))}
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
                onClick={() => setPage(Math.min(pageCount, clampedPage + 1))}
                disabled={clampedPage >= pageCount}
                className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </SectionCard>
      )}
      <FlowDialog
        flow={activeFlow?.flow}
        open={!!activeFlow}
        onOpenChange={(v) => !v && setActiveFlow(null)}
        onSubmit={activeFlow?.onSubmit}
        initialValues={activeFlow?.initialValues}
        fieldOverrides={activeFlow?.fieldOverrides}
      />
      <CreatePricingRuleDialog
        open={pricingRuleDialogOpen || !!editingPricingRule}
        onOpenChange={(v) => {
          if (!v) {
            setPricingRuleDialogOpen(false);
            setEditingPricingRule(null);
          }
        }}
        editingRule={editingPricingRule}
      />
      <BundleFormDialog
        open={bundleDialogOpen || !!editingBundle}
        onOpenChange={(v) => {
          if (!v) {
            setBundleDialogOpen(false);
            setEditingBundle(null);
          }
        }}
        editingBundle={editingBundle}
      />
      <PrintBarcodeDialog
        open={!!printingBarcodeProduct}
        onOpenChange={(v) => { if (!v) setPrintingBarcodeProduct(null); }}
        product={printingBarcodeProduct}
      />
      <PrintLabelDialog
        open={!!printingLabelProduct}
        onOpenChange={(v) => { if (!v) setPrintingLabelProduct(null); }}
        product={printingLabelProduct}
      />
      <ReturnPolicySettingsDialog
        open={returnPolicyDialogOpen}
        onOpenChange={setReturnPolicyDialogOpen}
        config={returnPolicyConfig ?? DEFAULT_RETURN_POLICY_CONFIG}
      />
      <ApproveExchangeDialog
        returnRecord={approvingExchangeReturn}
        onClose={() => setApprovingExchangeReturn(null)}
      />
      <NoReceiptReturnDialog
        open={noReceiptDialogOpen}
        onClose={() => setNoReceiptDialogOpen(false)}
      />
      <BulkActionSheet
        config={activeBulkLabel ? (bulkActions?.[activeBulkLabel] ?? null) : null}
        onOpenChange={(v) => !v && setActiveBulkLabel(null)}
      />
      <RowDetailSheet
        detailRow={detailRow}
        onOpenChange={(v) => !v && setDetailRow(null)}
        detail={detailRow ? rowDetailFor(detailRow.id, detailRow.row) : null}
        columns={columns}
        statusCol={statusCol}
        actions={
          detailRow
            ? rowActionsFor(
                detailRow.id,
                detailRow.row,
                statusCol !== undefined ? String(detailRow.row[statusCol] ?? "") : "",
              )
            : []
        }
        onAction={(fn) => {
          fn();
          setDetailRow(null);
        }}
      />
      <NamePromptDialog
        open={saveViewOpen}
        onOpenChange={setSaveViewOpen}
        title="Save this view"
        label="View name"
        placeholder="e.g. Low stock — Riyadh"
        onConfirm={handleSaveView}
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
  const fallbackStatus =
    detailRow && statusCol !== undefined ? String(detailRow.row[statusCol] ?? "") : "";
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
              {statusText && <Pill tone={tone(statusText)}>{statusText}</Pill>}
              {detail?.tabs && detail.tabs.length > 0 ? (
                <Tabs defaultValue={detail.tabs[0].label}>
                  <TabsList>
                    {detail.tabs.map((t) => (
                      <TabsTrigger key={t.label} value={t.label}>
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {detail.tabs.map((t) => (
                    <TabsContent key={t.label} value={t.label} className="space-y-5">
                      <DetailSections sections={t.sections} tables={t.tables} />
                    </TabsContent>
                  ))}
                </Tabs>
              ) : detail ? (
                <DetailSections sections={detail.sections} tables={detail.tables} />
              ) : (
                <dl className="grid grid-cols-2 gap-2">
                  {columns.map((c, j) => (
                    <div key={c} className="rounded-lg bg-canvas px-3 py-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <CurrencyText value={c} />
                      </dt>
                      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
                        <CurrencyText value={String(detailRow.row[j] ?? "—")} />
                      </dd>
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

function DetailSections({
  sections,
  tables,
}: {
  sections: DetailSection[];
  tables?: DetailTable[];
}) {
  return (
    <>
      {sections.map((s) => (
        <div key={s.heading}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {s.heading}
          </p>
          <dl className="grid grid-cols-2 gap-2">
            {s.fields.map((f) => (
              <div key={f.label} className="rounded-lg bg-canvas px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
                  <CurrencyText value={f.value} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {tables?.map((t) => (
        <div key={t.heading}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t.heading}
          </p>
          <div className="overflow-x-auto rounded-lg border border-black/5">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {t.columns.map((c) => (
                    <TableHead
                      key={c}
                      className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      <CurrencyText value={c} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.rows.map((r, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {r.map((cell, j) => (
                      <TableCell key={j} className="whitespace-nowrap text-xs">
                        <CurrencyText value={String(cell)} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </>
  );
}
