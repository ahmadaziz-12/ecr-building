import { useMemo, useState } from "react";
import { ArrowLeft, LayoutGrid, Search, X } from "lucide-react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMPTY_FILTER_STATE,
  ReportFilterBar,
  toReportQuery,
  type ReportFilterState,
} from "./ReportFilterBar";
import { ReportTable, type ReportColumn, type ReportDetail } from "./ReportTable";
import {
  REPORTS,
  REPORT_BY_KEY,
  REPORT_GROUPS,
  type ReportDef,
  type ReportGroup,
  type ReportKey,
} from "./report-registry";
import {
  useBundleProductContributionReport,
  useBundlePromotionsReport,
  useBundleSalesReport,
  useBundleSuggestionsReport,
  useCashierPerformanceReport,
  useCategoryPerformanceReport,
  useContractorAgingReport,
  useCustomerReturnsReport,
  useDamagedItemsReport,
  useDiscountUtilizationReport,
  useEmployeeAuditReport,
  useEmployeeReport,
  useExpiryReport,
  useInventoryReport,
  useItemReport,
  useLowStockReport,
  usePalletUtilizationReport,
  usePaymentMethodsReport,
  useProfitMarginReport,
  usePurchaseOrderReport,
  useRefundMethodsReport,
  useReportFilterOptions,
  useRestockingFeesReport,
  useReturnsAnalysisReport,
  useSalesSummaryReport,
  useSlowMovingReport,
  useStockCountVarianceReport,
  useSupplierPerformanceReport,
  useSupplierReturnsReport,
  useTopProductsReport,
  useVatReport,
} from "@/lib/api/reports";

// Module 12 (BRD §7/§11): the operational reports console. The report catalogue, its filters and
// its columns are declared in report-registry.ts; this file is the shell — picker, shared filter
// bar, and the handful of aggregate reports whose shape is a summary rather than a row list.

const money = (n: number) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const int = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function initialState(key: ReportKey): ReportFilterState {
  const def = REPORT_BY_KEY[key];
  return {
    ...EMPTY_FILTER_STATE,
    range: def.dated ? { preset: "This Month" } : { preset: "" },
    selections: {},
    knobs: { ...(def.defaultKnobs ?? {}) },
  };
}

export function ReportsConsole() {
  // `null` is the catalogue. The console opens on a browsable grid of report cards rather than
  // dropping straight into one report behind a 24-entry list that ran far past the fold; picking a
  // card hands the whole page over to that report, and the switcher in its header hops between
  // reports without going back to the grid.
  const [active, setActive] = useState<ReportKey | null>(null);
  // One filter state, belonging to whichever report is open, and rebuilt from the report's defaults
  // every time one is opened. Carrying filters across reports (or across a trip back to the
  // catalogue) meant a report could silently open pre-narrowed to a branch and date window someone
  // set up on a different report ten minutes earlier, and read as "no data" when it had plenty.
  const [state, setState] = useState<ReportFilterState>(() => initialState("sales-summary"));

  // Nothing fetches while the catalogue is up — `on()` is false for every key — but the hooks below
  // still need a definition to build a query from, so the catalogue borrows the first report's.
  const activeKey: ReportKey = active ?? "sales-summary";
  const def = REPORT_BY_KEY[activeKey];
  const query = useMemo(() => toReportQuery(state, def.dated), [state, def.dated]);
  const on = (key: ReportKey) => active === key;

  function openReport(key: ReportKey) {
    setState(initialState(key));
    setActive(key);
  }

  const { data: options } = useReportFilterOptions();

  // Every report's hook is declared unconditionally (hooks rules) but gated by `enabled`, so only
  // the visible report fetches; switching reports serves the previous one from cache.
  const salesSummary = useSalesSummaryReport(query, on("sales-summary"));
  const topProducts = useTopProductsReport(query, on("top-products"));
  const discountUtil = useDiscountUtilizationReport(query, on("discount-utilization"));
  const cashierPerf = useCashierPerformanceReport(query, on("cashier-performance"));
  const profitMargin = useProfitMarginReport(query, on("profit-margin"));
  const categoryPerf = useCategoryPerformanceReport(query, on("category-performance"));
  const paymentMethods = usePaymentMethodsReport(query, on("payment-methods"));

  const returnsAnalysis = useReturnsAnalysisReport(query, on("returns-analysis"));
  const refundMethods = useRefundMethodsReport(query, on("refund-methods"));
  const restockingFees = useRestockingFeesReport(query, on("restocking-fees"));
  const customerReturns = useCustomerReturnsReport(query, on("customer-returns"));
  const damagedItems = useDamagedItemsReport(query, on("damaged-items"));

  const itemReport = useItemReport(query, on("item-report"));
  const inventoryReport = useInventoryReport(query, on("inventory-report"));
  const lowStock = useLowStockReport(query, on("low-stock"));
  const stockCountVariance = useStockCountVarianceReport(query, on("stock-count-variance"));
  const slowMoving = useSlowMovingReport(query, on("slow-moving"));
  const expiry = useExpiryReport(query, on("expiry-report"));

  const purchaseOrders = usePurchaseOrderReport(query, on("purchase-orders"));
  const supplierReturns = useSupplierReturnsReport(query, on("supplier-returns"));
  const supplierPerf = useSupplierPerformanceReport(query, on("supplier-performance"));

  const vat = useVatReport(query, on("vat"));
  const contractorAging = useContractorAgingReport(query, on("contractor-aging"));
  const employeeReport = useEmployeeReport(query, on("employee-report"));
  const employeeAudit = useEmployeeAuditReport(query, on("employee-audit"));

  const bundleSales = useBundleSalesReport(query, on("bundle-sales"));
  const bundleProductContribution = useBundleProductContributionReport(
    query,
    on("bundle-product-contribution"),
  );
  const bundleSuggestions = useBundleSuggestionsReport(query, on("bundle-suggestions"));
  const bundlePromotions = useBundlePromotionsReport(query, on("bundle-promotions"));
  const palletUtilization = usePalletUtilizationReport(query, on("pallet-utilization"));

  // Maps each list-shaped report to its result. The aggregate reports (sales summary, VAT,
  // discount utilization) return an object, not rows, and render their own block below.
  const TABLE_DATA: Partial<
    Record<ReportKey, { data: unknown[] | undefined; isLoading: boolean }>
  > = {
    "top-products": topProducts,
    "cashier-performance": cashierPerf,
    "profit-margin": profitMargin,
    "category-performance": categoryPerf,
    "payment-methods": paymentMethods,
    "returns-analysis": returnsAnalysis,
    "refund-methods": refundMethods,
    "restocking-fees": restockingFees,
    "customer-returns": customerReturns,
    "damaged-items": damagedItems,
    "item-report": itemReport,
    "inventory-report": inventoryReport,
    "low-stock": lowStock,
    "stock-count-variance": stockCountVariance,
    "slow-moving": slowMoving,
    "expiry-report": expiry,
    "purchase-orders": purchaseOrders,
    "supplier-returns": supplierReturns,
    "supplier-performance": supplierPerf,
    "contractor-aging": contractorAging,
    "employee-report": employeeReport,
    "employee-audit": employeeAudit,
    "bundle-sales": bundleSales,
    "bundle-product-contribution": bundleProductContribution,
    "bundle-suggestions": bundleSuggestions,
    "bundle-promotions": bundlePromotions,
    "pallet-utilization": palletUtilization,
  };

  function clearFilters() {
    setState(initialState(activeKey));
  }

  const rangeLabel =
    query.from || query.to
      ? `${query.from ?? "…"} → ${query.to ?? "…"}`
      : def.dated
        ? "All time"
        : "Live snapshot";

  const table = active ? TABLE_DATA[active] : undefined;
  const rows = (table?.data ?? []) as never[];

  // The catalogue is a page of its own rather than a column beside the report — a 24-entry list in
  // a sidebar is what made the picker run far past the fold on every single report.
  if (!active) return <ReportCatalog onOpen={openReport} />;

  return (
    <div className="space-y-4">
      <ReportHeader def={def} onBack={() => setActive(null)} onSwitch={openReport} />

      <div className="min-w-0 space-y-4">
        <ReportFilterBar
          dated={def.dated}
          filters={def.filters}
          knobs={def.knobs}
          options={options}
          state={state}
          onChange={setState}
          onClear={clearFilters}
        />

        {/* ————— Sales Summary (aggregate) ————— */}
        {active === "sales-summary" && (
          <>
            <KpiGrid
              items={[
                {
                  label: "Gross Sales",
                  value: salesSummary.data ? money(salesSummary.data.grossSales) : "…",
                  sub: rangeLabel,
                  tone: "success",
                },
                {
                  label: "Discounts",
                  value: salesSummary.data ? money(salesSummary.data.discounts) : "…",
                  sub: "Given away",
                  tone: "warning",
                },
                {
                  label: "VAT Collected",
                  value: salesSummary.data ? money(salesSummary.data.vat) : "…",
                  sub: "Output VAT",
                  tone: "info",
                },
                {
                  label: "Service Fees",
                  value: salesSummary.data ? money(salesSummary.data.fees) : "…",
                  sub: "Delivery & surcharges",
                  tone: "info",
                },
                {
                  label: "Net Takings",
                  value: salesSummary.data ? money(salesSummary.data.netSales) : "…",
                  sub: "Incl. VAT & fees",
                  tone: "success",
                },
                {
                  label: "COGS",
                  value: salesSummary.data ? money(salesSummary.data.cogs) : "…",
                  sub: "At cost price",
                  tone: "muted",
                },
                {
                  label: "Gross Profit",
                  value: salesSummary.data ? money(salesSummary.data.grossProfit) : "…",
                  sub: "Net revenue − COGS",
                  tone: "success",
                },
                {
                  label: "Margin",
                  value: salesSummary.data ? `${salesSummary.data.marginPct.toFixed(1)}%` : "…",
                  sub: "On ex-VAT revenue",
                  tone: salesSummary.data && salesSummary.data.marginPct < 10 ? "critical" : "info",
                },
                {
                  label: "Orders",
                  value: salesSummary.data ? int(salesSummary.data.orderCount) : "…",
                  sub: "Completed, non-voided",
                  tone: "muted",
                },
                {
                  label: "Items Sold",
                  value: salesSummary.data ? int(salesSummary.data.itemsSold) : "…",
                  sub: "Stock UOM units",
                  tone: "muted",
                },
                {
                  label: "Avg Basket",
                  value: salesSummary.data ? money(salesSummary.data.avgBasket) : "…",
                  sub: "Per order, incl. VAT",
                  tone: "info",
                },
                {
                  label: "Customers",
                  value: salesSummary.data ? int(salesSummary.data.uniqueCustomers) : "…",
                  sub: "Identified accounts",
                  tone: "muted",
                },
                {
                  label: "Returns",
                  value: salesSummary.data ? int(salesSummary.data.returnCount) : "…",
                  sub: "Approved in period",
                  tone: "warning",
                },
                {
                  label: "Refunds Paid",
                  value: salesSummary.data ? money(salesSummary.data.refundValue) : "…",
                  sub: "Net cashback out",
                  tone: "warning",
                },
                {
                  label: "Net After Returns",
                  value: salesSummary.data ? money(salesSummary.data.netAfterReturns) : "…",
                  sub: "Takings − refunds",
                  tone: "success",
                },
                {
                  label: "Voided Orders",
                  value: salesSummary.data ? int(salesSummary.data.voidedOrders) : "…",
                  sub: "Excluded from revenue",
                  tone:
                    salesSummary.data && salesSummary.data.voidedOrders > 0 ? "critical" : "muted",
                },
              ]}
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ReportTable
                title="By Payment Method"
                desc="Collected, refunded and net per rail"
                columns={[
                  { key: "method", label: "Method" },
                  { key: "count", label: "Txns", format: "int" },
                  { key: "amount", label: "Collected", format: "money" },
                  { key: "sharePct", label: "Share", format: "pct" },
                  { key: "refunded", label: "Refunded", format: "money" },
                  { key: "net", label: "Net", format: "money" },
                ]}
                rows={salesSummary.data?.byMethod ?? []}
                loading={salesSummary.isLoading}
                search={state.search}
                exportName="sales-by-method"
              />
              <ReportTable
                title="By Cashier"
                desc="Who rang what, and how much they discounted"
                columns={[
                  { key: "cashier", label: "Cashier" },
                  { key: "branch", label: "Branch" },
                  { key: "orders", label: "Orders", format: "int" },
                  { key: "amount", label: "Net Takings", format: "money" },
                  { key: "discounts", label: "Discounts", format: "money" },
                  { key: "avgBasket", label: "Avg Basket", format: "money" },
                  { key: "voids", label: "Voids", format: "int" },
                ]}
                rows={salesSummary.data?.byCashier ?? []}
                loading={salesSummary.isLoading}
                search={state.search}
                exportName="sales-by-cashier"
              />
              <ReportTable
                title="By Branch"
                desc="Revenue and margin per location"
                columns={[
                  { key: "branch", label: "Branch" },
                  { key: "orders", label: "Orders", format: "int" },
                  { key: "gross", label: "Gross", format: "money" },
                  { key: "discounts", label: "Discounts", format: "money" },
                  { key: "vat", label: "VAT", format: "money" },
                  { key: "net", label: "Net", format: "money" },
                  { key: "cogs", label: "COGS", format: "money" },
                  { key: "grossProfit", label: "Gross Profit", format: "money" },
                  { key: "marginPct", label: "Margin", format: "pct" },
                  { key: "avgBasket", label: "Avg Basket", format: "money" },
                ]}
                rows={salesSummary.data?.byBranch ?? []}
                loading={salesSummary.isLoading}
                search={state.search}
                exportName="sales-by-branch"
              />
              <ReportTable
                title="By Category"
                desc="Where the revenue and the margin actually came from"
                columns={[
                  { key: "category", label: "Category" },
                  { key: "units", label: "Units", format: "qty" },
                  { key: "revenue", label: "Revenue", format: "money" },
                  { key: "sharePct", label: "Share", format: "pct" },
                  { key: "cogs", label: "COGS", format: "money" },
                  { key: "grossProfit", label: "Gross Profit", format: "money" },
                  { key: "marginPct", label: "Margin", format: "pct" },
                ]}
                rows={salesSummary.data?.byCategory ?? []}
                loading={salesSummary.isLoading}
                search={state.search}
                exportName="sales-by-category"
              />
            </div>
            <ReportTable
              title="Day by Day"
              desc="Trend across the selected period"
              columns={[
                { key: "date", label: "Date", format: "date" },
                { key: "orders", label: "Orders", format: "int" },
                { key: "gross", label: "Gross", format: "money" },
                { key: "discounts", label: "Discounts", format: "money" },
                { key: "net", label: "Net Takings", format: "money" },
                { key: "grossProfit", label: "Gross Profit", format: "money" },
              ]}
              rows={salesSummary.data?.byDay ?? []}
              loading={salesSummary.isLoading}
              search={state.search}
              exportName="sales-by-day"
            />
          </>
        )}

        {/* ————— Discount Utilization (aggregate) ————— */}
        {active === "discount-utilization" && (
          <>
            <KpiGrid
              items={[
                {
                  label: "Total Discounts",
                  value: discountUtil.data ? money(discountUtil.data.totalDiscounts) : "…",
                  sub: rangeLabel,
                  tone: "warning",
                },
                {
                  label: "Discounted Orders",
                  value: discountUtil.data ? int(discountUtil.data.discountedOrders) : "…",
                  sub: `of ${discountUtil.data ? int(discountUtil.data.totalOrders) : "…"} orders`,
                  tone: "info",
                },
                {
                  label: "Discount Rate",
                  value: discountUtil.data
                    ? `${discountUtil.data.discountRatePct.toFixed(1)}%`
                    : "…",
                  sub: "Of gross sales",
                  tone:
                    discountUtil.data && discountUtil.data.discountRatePct > 30
                      ? "critical"
                      : "muted",
                },
              ]}
            />
            <SectionCard title="Reading This Report" desc="BRD §6.2 — discount authorization tiers">
              <p className="px-1 text-sm leading-relaxed text-muted-foreground">
                A rising discount rate means margin is leaking through manual discounts. Ceilings
                per role (Cashier 5% / Senior 10% / Supervisor 15%) gate each discount at the
                register; anything above the ceiling required a logged supervisor approval.
                Cross-check unusual spikes against the Employee Audit report for the same period,
                filtered to the Pos module.
              </p>
            </SectionCard>
          </>
        )}

        {/* ————— VAT (aggregate) ————— */}
        {active === "vat" && (
          <>
            <KpiGrid
              items={[
                {
                  label: "VAT Collected",
                  value: vat.data ? money(vat.data.totalCollected) : "…",
                  sub: rangeLabel,
                  tone: "info",
                },
                {
                  label: "VAT Reversed",
                  value: vat.data ? money(vat.data.totalReversed) : "…",
                  sub: "Returns / credit notes",
                  tone: "warning",
                },
                {
                  label: "Net VAT Position",
                  value: vat.data ? money(vat.data.netVat) : "…",
                  sub: "Payable to ZATCA",
                  tone: "success",
                },
              ]}
            />
            <ReportTable
              title="Output VAT by Rate"
              desc="Excludes voided orders; reversals from approved returns"
              columns={[
                { key: "rate", label: "Rate", format: "pct" },
                { key: "taxableAmount", label: "Taxable Amount", format: "money" },
                { key: "vatCollected", label: "VAT Collected", format: "money" },
              ]}
              rows={vat.data?.collected ?? []}
              loading={vat.isLoading}
              search={state.search}
              exportName="vat-report"
            />
          </>
        )}

        {/* ————— Every list-shaped report ————— */}
        {table && def.columns && (
          <>
            {KPI_BUILDERS[active] && rows.length > 0 && (
              <KpiGrid items={KPI_BUILDERS[active]!(rows)} />
            )}
            <ReportTable
              title={def.tableTitle ?? def.label}
              desc={`${rows.length} rows · ${rangeLabel}`}
              columns={def.columns as ReportColumn<never>[]}
              rows={rows}
              loading={table.isLoading}
              search={state.search}
              detail={def.detail as ReportDetail<never> | undefined}
              emptyLabel={def.emptyLabel}
              exportName={def.key}
            />
          </>
        )}

        {/* Contractor aging keeps its utilization bar, which no generic column can express. */}
        {active === "contractor-aging" && (contractorAging.data?.length ?? 0) > 0 && (
          <SectionCard title="Credit Utilization" desc="Outstanding against each account's limit">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Customer</TableHead>
                  <TableHead className="w-1/2">Utilization</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(contractorAging.data ?? []).map((r) => {
                  const util = r.creditLimit > 0 ? (r.outstanding / r.creditLimit) * 100 : 0;
                  return (
                    <TableRow key={r.customer}>
                      <TableCell className="font-medium">{r.customer}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-black/5">
                            <div
                              className={`h-2 rounded-full ${util > 90 ? "bg-critical/80" : util > 70 ? "bg-warning/80" : "bg-success/70"}`}
                              style={{ width: `${Math.min(100, Math.max(3, util))}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-[11px] text-muted-foreground">
                            {Math.round(util)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {money(r.outstanding)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

// ————————————————————————— Catalogue —————————————————————————

const GROUP_TONE: Record<ReportGroup, { tile: string; hover: string }> = {
  Sales: { tile: "bg-brand/10 text-brand", hover: "hover:border-brand/35" },
  Inventory: { tile: "bg-info/10 text-[oklch(0.35_0.12_235)]", hover: "hover:border-info/40" },
  Procurement: {
    tile: "bg-success/15 text-[oklch(0.35_0.1_155)]",
    hover: "hover:border-success/45",
  },
  "Returns & Quality": {
    tile: "bg-warning/20 text-[oklch(0.4_0.13_70)]",
    hover: "hover:border-warning/50",
  },
  "Tax & B2B": { tile: "bg-critical/10 text-critical", hover: "hover:border-critical/35" },
  "People & Audit": { tile: "bg-black/5 text-foreground/70", hover: "hover:border-black/20" },
};

/** The landing view: every report as a card, grouped by area, narrowed by free text and by group. */
function ReportCatalog({ onOpen }: { onOpen: (key: ReportKey) => void }) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<ReportGroup | "All">("All");

  const needle = search.trim().toLowerCase();
  const matches = REPORTS.filter(
    (r) =>
      (group === "All" || r.group === group) &&
      (!needle ||
        r.label.toLowerCase().includes(needle) ||
        r.desc.toLowerCase().includes(needle) ||
        r.group.toLowerCase().includes(needle)),
  );
  const shownGroups = REPORT_GROUPS.filter((g) => matches.some((r) => r.group === g));

  return (
    <div className="space-y-4">
      <PageHeader
        group="Insights"
        title="Reports"
        desc="Operational, inventory, procurement, returns, tax and audit reports — live from the transaction data, with drill-down to the individual items behind every row."
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports…"
            className="h-8 w-56 rounded-md border border-black/10 bg-canvas ps-8 pe-2.5 text-xs outline-none focus:border-brand/40"
          />
        </div>
        {(["All", ...REPORT_GROUPS] as const).map((g) => {
          const count = g === "All" ? REPORTS.length : REPORTS.filter((r) => r.group === g).length;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`h-8 rounded-md border px-2.5 text-xs font-medium transition ${
                group === g
                  ? "border-brand/40 bg-brand/5 text-brand"
                  : "border-black/10 bg-white text-foreground/80 hover:border-brand/40"
              }`}
            >
              {g} <span className="text-muted-foreground">{count}</span>
            </button>
          );
        })}
        {(needle !== "" || group !== "All") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setGroup("All");
            }}
            className="ms-auto h-8 gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>

      {shownGroups.map((g) => (
        <div key={g}>
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {g}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {matches
              .filter((r) => r.group === g)
              .map((r) => {
                const Icon = r.icon;
                const tone = GROUP_TONE[r.group];
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => onOpen(r.key)}
                    className={`flex h-full items-start gap-3 rounded-2xl border border-black/5 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:shadow-md ${tone.hover}`}
                  >
                    <span
                      className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${tone.tile}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{r.label}</span>
                      <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                        {r.desc}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      {matches.length === 0 && (
        <SectionCard>
          <p className="py-10 text-center text-sm text-muted-foreground">
            No report matches “{search}”.
          </p>
        </SectionCard>
      )}
    </div>
  );
}

/** The open report's header: what you're looking at, a jump-to-report switcher, and the way back. */
function ReportHeader({
  def,
  onBack,
  onSwitch,
}: {
  def: ReportDef;
  onBack: () => void;
  onSwitch: (key: ReportKey) => void;
}) {
  const Icon = def.icon;
  const tone = GROUP_TONE[def.group];
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`grid h-11 w-11 flex-none place-items-center rounded-xl ${tone.tile}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
            Insights · {def.group}
          </p>
          <h1 className="font-display text-2xl font-bold text-foreground">{def.label}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{def.desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select value={def.key} onValueChange={(v) => onSwitch(v as ReportKey)}>
          <SelectTrigger className="h-9 w-56 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {REPORT_GROUPS.map((g) => (
              <SelectGroup key={g}>
                <SelectLabel className="text-[10px] uppercase tracking-wider">{g}</SelectLabel>
                {REPORTS.filter((r) => r.group === g).map((r) => (
                  <SelectItem key={r.key} value={r.key} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <LayoutGrid className="h-4 w-4" /> All reports
        </Button>
      </div>
    </div>
  );
}

type Kpi = {
  label: string;
  value: string;
  sub?: string;
  tone?: "critical" | "warning" | "success" | "info" | "muted";
};

const sum = (rows: never[], key: string) =>
  rows.reduce((s, r) => s + (Number((r as Record<string, unknown>)[key]) || 0), 0);

// Roll-ups for the list reports where a total genuinely helps read the table. Reports without an
// entry here just render the table.
const KPI_BUILDERS: Partial<Record<ReportKey, (rows: never[]) => Kpi[]>> = {
  "top-products": (rows) => [
    { label: "SKUs Listed", value: int(rows.length), sub: "In the top N", tone: "info" },
    { label: "Units Sold", value: int(sum(rows, "units")), sub: "Stock UOM", tone: "info" },
    {
      label: "Revenue",
      value: money(sum(rows, "revenue")),
      sub: "Ex-VAT, after discount",
      tone: "success",
    },
    {
      label: "Gross Profit",
      value: money(sum(rows, "grossProfit")),
      sub: "Revenue − COGS",
      tone: "success",
    },
    {
      label: "Discounts",
      value: money(sum(rows, "discounts")),
      sub: "Off list price",
      tone: "warning",
    },
    {
      label: "Returned Units",
      value: int(sum(rows, "returnedUnits")),
      sub: "Came back in period",
      tone: "warning",
    },
    {
      label: "Share Covered",
      value: `${sum(rows, "sharePct").toFixed(1)}%`,
      sub: "Of filtered revenue",
      tone: "muted",
    },
    {
      label: "Out of Stock",
      value: int(rows.filter((r) => (r as { onHand: number }).onHand <= 0).length),
      sub: "Selling with no cover",
      tone: rows.some((r) => (r as { onHand: number }).onHand <= 0) ? "critical" : "muted",
    },
  ],
  "item-report": (rows) => [
    { label: "Items", value: int(rows.length), sub: "Matching filters", tone: "info" },
    { label: "Stock Value", value: money(sum(rows, "stockValue")), sub: "At cost", tone: "info" },
    { label: "Revenue", value: money(sum(rows, "revenue")), sub: "In period", tone: "success" },
    {
      label: "Gross Profit",
      value: money(sum(rows, "grossProfit")),
      sub: "Revenue − COGS",
      tone: "success",
    },
  ],
  "inventory-report": (rows) => [
    { label: "Stock Lines", value: int(rows.length), sub: "Product × location", tone: "info" },
    { label: "On Hand", value: int(sum(rows, "onHand")), sub: "Units", tone: "info" },
    {
      label: "Stock Value",
      value: money(sum(rows, "stockValue")),
      sub: "At cost",
      tone: "success",
    },
    {
      label: "Retail Value",
      value: money(sum(rows, "retailValue")),
      sub: "At selling price",
      tone: "info",
    },
  ],
  "low-stock": (rows) => [
    {
      label: "Lines Below Reorder",
      value: int(rows.length),
      sub: "Needs replenishment",
      tone: "warning",
    },
    {
      label: "Out of Stock",
      value: int(rows.filter((r) => (r as { status: string }).status === "Critical").length),
      sub: "Can't be sold",
      tone: "critical",
    },
    {
      label: "Units Short",
      value: int(sum(rows, "shortfall")),
      sub: "Below reorder level",
      tone: "warning",
    },
    {
      label: "Restock Cost",
      value: money(sum(rows, "restockValue")),
      sub: "Suggested order at cost",
      tone: "info",
    },
  ],
  "stock-count-variance": (rows) => [
    { label: "Counts", value: int(rows.length), sub: "In period", tone: "info" },
    {
      label: "Variance Lines",
      value: int(sum(rows, "varianceLines")),
      sub: "SKUs that drifted",
      tone: "warning",
    },
    {
      label: "Net Variance",
      value: money(sum(rows, "netVarianceValue")),
      sub: "Overage − shortage",
      tone: "info",
    },
    {
      label: "Shrinkage Exposure",
      value: money(sum(rows, "absVarianceValue")),
      sub: "Absolute variance",
      tone: "critical",
    },
  ],
  "purchase-orders": (rows) => [
    { label: "Purchase Orders", value: int(rows.length), sub: "In period", tone: "info" },
    {
      label: "Ordered Value",
      value: money(sum(rows, "total")),
      sub: "Incl. shipping",
      tone: "info",
    },
    {
      label: "Qty Pending",
      value: int(sum(rows, "qtyPending")),
      sub: "Not yet received",
      tone: "warning",
    },
    {
      label: "Late POs",
      value: int(rows.filter((r) => (r as { daysLate: number }).daysLate > 0).length),
      sub: "Past expected date",
      tone: "critical",
    },
  ],
  "supplier-returns": (rows) => [
    { label: "RTS Tickets", value: int(rows.length), sub: "In period", tone: "info" },
    { label: "Units Returned", value: int(sum(rows, "qty")), sub: "To suppliers", tone: "warning" },
    { label: "Return Value", value: money(sum(rows, "value")), sub: "At cost", tone: "warning" },
    {
      label: "Awaiting Credit",
      value: int(rows.filter((r) => !(r as { creditNoteRef: string | null }).creditNoteRef).length),
      sub: "No credit note yet",
      tone: "critical",
    },
  ],
  "customer-returns": (rows) => [
    { label: "Return Tickets", value: int(rows.length), sub: "In period", tone: "info" },
    {
      label: "Gross Refund",
      value: money(sum(rows, "grossRefund")),
      sub: "Ex-VAT",
      tone: "warning",
    },
    {
      label: "VAT Reversed",
      value: money(sum(rows, "vatReversal")),
      sub: "Credit notes issued",
      tone: "info",
    },
    {
      label: "Net Cashback",
      value: money(sum(rows, "netCashback")),
      sub: "Paid back out",
      tone: "critical",
    },
  ],
  "damaged-items": (rows) => [
    { label: "Damaged Lines", value: int(rows.length), sub: "In period", tone: "warning" },
    { label: "Units Lost", value: int(sum(rows, "qty")), sub: "Quarantined", tone: "warning" },
    { label: "Loss Value", value: money(sum(rows, "lossValue")), sub: "At cost", tone: "critical" },
    {
      label: "Pending Approval",
      value: int(rows.filter((r) => (r as { status: string }).status === "PendingApproval").length),
      sub: "Awaiting sign-off",
      tone: "warning",
    },
  ],
  "expiry-report": (rows) => [
    { label: "Batches", value: int(rows.length), sub: "Matching filters", tone: "info" },
    {
      label: "Expiring ≤ 30d",
      value: int(
        rows.filter((r) => {
          const d = (r as { daysLeft: number }).daysLeft;
          return d >= 0 && d <= 30;
        }).length,
      ),
      sub: "Move to promo",
      tone: "warning",
    },
    {
      label: "Expired",
      value: int(rows.filter((r) => (r as { daysLeft: number }).daysLeft < 0).length),
      sub: "Write-off pending",
      tone: "critical",
    },
    {
      label: "Value at Risk",
      value: money(
        sum(rows.filter((r) => (r as { daysLeft: number }).daysLeft <= 30) as never[], "value"),
      ),
      sub: "≤ 30 days left",
      tone: "critical",
    },
  ],
  "profit-margin": (rows) => [
    { label: "Revenue", value: money(sum(rows, "revenue")), sub: "In period", tone: "success" },
    { label: "COGS", value: money(sum(rows, "cogs")), sub: "At cost price", tone: "info" },
    {
      label: "Gross Profit",
      value: money(sum(rows, "grossProfit")),
      sub: "Revenue − COGS",
      tone: "success",
    },
    {
      label: "Net Profit",
      value: money(sum(rows, "netProfit")),
      sub: "After returns",
      tone: "info",
    },
  ],
  "employee-report": (rows) => [
    { label: "Staff", value: int(rows.length), sub: "Matching filters", tone: "info" },
    {
      label: "Net Sales Rung",
      value: money(sum(rows, "netSales")),
      sub: "Across all accounts",
      tone: "success",
    },
    {
      label: "Discounts Given",
      value: money(sum(rows, "discounts")),
      sub: "At the register",
      tone: "warning",
    },
    {
      label: "Voids",
      value: int(sum(rows, "voidedOrders")),
      sub: "Orders reversed",
      tone: sum(rows, "voidedOrders") > 0 ? "critical" : "muted",
    },
    {
      label: "Refunds Approved",
      value: int(sum(rows, "refundsApproved")),
      sub: money(sum(rows, "refundValue")),
      tone: "warning",
    },
    {
      label: "Cash Variance",
      value: money(sum(rows, "cashVariance")),
      sub: "Across closed shifts",
      tone: sum(rows, "cashVariance") !== 0 ? "critical" : "success",
    },
    {
      label: "Audit Events",
      value: int(sum(rows, "auditEvents")),
      sub: "Logged actions",
      tone: "info",
    },
    {
      label: "Critical Events",
      value: int(sum(rows, "criticalEvents")),
      sub: "Needs review",
      tone: sum(rows, "criticalEvents") > 0 ? "critical" : "muted",
    },
  ],
  "employee-audit": (rows) => [
    { label: "Events", value: int(rows.length), sub: "In period", tone: "info" },
    {
      label: "Critical",
      value: int(rows.filter((r) => (r as { severity: string }).severity === "Critical").length),
      sub: "Needs review",
      tone: "critical",
    },
    {
      label: "Warnings",
      value: int(rows.filter((r) => (r as { severity: string }).severity === "Warning").length),
      sub: "Flagged",
      tone: "warning",
    },
    {
      label: "Distinct Users",
      value: int(new Set(rows.map((r) => (r as { userName: string | null }).userName ?? "—")).size),
      sub: "Acted in period",
      tone: "muted",
    },
  ],
  "cashier-performance": (rows) => [
    { label: "Cashiers", value: int(rows.length), sub: "Active in period", tone: "info" },
    { label: "Orders", value: int(sum(rows, "orders")), sub: "Completed", tone: "info" },
    { label: "Net Takings", value: money(sum(rows, "net")), sub: "Incl. VAT", tone: "success" },
    {
      label: "Voids",
      value: int(sum(rows, "voidedOrders")),
      sub: "Reversed at register",
      tone: "warning",
    },
  ],
  "supplier-performance": (rows) => [
    { label: "Suppliers", value: int(rows.length), sub: "With activity", tone: "info" },
    {
      label: "Ordered Value",
      value: money(sum(rows, "orderedValue")),
      sub: "In period",
      tone: "info",
    },
    {
      label: "Received Value",
      value: money(sum(rows, "receivedValue")),
      sub: "Goods in",
      tone: "success",
    },
    {
      label: "Returned Value",
      value: money(sum(rows, "returnedValue")),
      sub: "Sent back",
      tone: "warning",
    },
  ],
  "payment-methods": (rows) => [
    { label: "Collected", value: money(sum(rows, "amount")), sub: "All methods", tone: "success" },
    {
      label: "Refunded",
      value: money(sum(rows, "refundAmount")),
      sub: "Paid back out",
      tone: "warning",
    },
    {
      label: "Net Settlement",
      value: money(sum(rows, "net")),
      sub: "Collected − refunded",
      tone: "info",
    },
    {
      label: "Transactions",
      value: int(sum(rows, "transactions")),
      sub: "Payment records",
      tone: "muted",
    },
  ],
  "returns-analysis": (rows) => [
    { label: "Tickets", value: int(sum(rows, "count")), sub: "All types", tone: "info" },
    {
      label: "Gross Refund",
      value: money(sum(rows, "grossRefund")),
      sub: "Ex-VAT",
      tone: "warning",
    },
    {
      label: "VAT Reversed",
      value: money(sum(rows, "vatReversed")),
      sub: "Credit notes",
      tone: "info",
    },
    {
      label: "Net Cashback",
      value: money(sum(rows, "netCashback")),
      sub: "After fees",
      tone: "critical",
    },
  ],
  "category-performance": (rows) => [
    { label: "Categories", value: int(rows.length), sub: "With activity", tone: "info" },
    { label: "Revenue", value: money(sum(rows, "revenue")), sub: "In period", tone: "success" },
    {
      label: "Gross Profit",
      value: money(sum(rows, "grossProfit")),
      sub: "Revenue − COGS",
      tone: "success",
    },
    {
      label: "Stock Value",
      value: money(sum(rows, "stockValue")),
      sub: "Branch stock at cost",
      tone: "info",
    },
  ],
  // Phase 5 (BRD §5.8) — Bundle Engine reports.
  "bundle-sales": (rows) => {
    const byRevenue = [...rows].sort(
      (a, b) =>
        (Number((b as { revenue: number }).revenue) || 0) -
        (Number((a as { revenue: number }).revenue) || 0),
    );
    const top = byRevenue[0] as { nameEn: string } | undefined;
    const worst = byRevenue[byRevenue.length - 1] as { nameEn: string } | undefined;
    return [
      { label: "Bundles Sold", value: int(rows.length), sub: "With sales in period", tone: "info" },
      {
        label: "Units Sold",
        value: int(sum(rows, "unitsSold")),
        sub: "Bundle instances",
        tone: "info",
      },
      {
        label: "Revenue",
        value: money(sum(rows, "revenue")),
        sub: "At bundle price",
        tone: "success",
      },
      {
        label: "Discount Given",
        value: money(sum(rows, "savings")),
        sub: "vs. individual pricing",
        tone: "warning",
      },
      {
        label: "Gross Profit",
        value: money(sum(rows, "grossProfit")),
        sub: "Revenue − COGS",
        tone: "success",
      },
      { label: "Top Bundle", value: top?.nameEn ?? "—", sub: "By revenue", tone: "success" },
      {
        label: "Worst Bundle",
        value: worst?.nameEn ?? "—",
        sub: "By revenue, still selling",
        tone: "muted",
      },
    ];
  },
  "bundle-product-contribution": (rows) => [
    { label: "Bundle/Product Pairs", value: int(rows.length), sub: "In period", tone: "info" },
    {
      label: "Units Sold",
      value: int(sum(rows, "qtySold")),
      sub: "As bundle constituents",
      tone: "info",
    },
    {
      label: "Revenue",
      value: money(sum(rows, "revenue")),
      sub: "Attributed share",
      tone: "success",
    },
  ],
  "bundle-suggestions": (rows) => {
    const suggested = sum(rows, "suggested");
    const accepted = sum(rows, "accepted");
    return [
      {
        label: "Bundles Suggested",
        value: int(rows.length),
        sub: "With impressions",
        tone: "info",
      },
      { label: "Total Suggested", value: int(suggested), sub: "Nudges shown", tone: "info" },
      { label: "Total Accepted", value: int(accepted), sub: "Added from a nudge", tone: "success" },
      {
        label: "Total Rejected",
        value: int(sum(rows, "rejected")),
        sub: "Dismissed",
        tone: "warning",
      },
      {
        label: "Overall Conversion",
        value: `${suggested === 0 ? 0 : ((accepted / suggested) * 100).toFixed(1)}%`,
        sub: "Accepted ÷ suggested",
        tone: "success",
      },
    ];
  },
  "bundle-promotions": (rows) => [
    { label: "Products with BOGO Sales", value: int(rows.length), sub: "In period", tone: "info" },
    {
      label: "Times Applied",
      value: int(sum(rows, "timesApplied")),
      sub: "Orders with a redemption",
      tone: "info",
    },
    {
      label: "Free Units Given",
      value: int(sum(rows, "freeUnits")),
      sub: "Buy X Get Y",
      tone: "warning",
    },
    {
      label: "Paid Units",
      value: int(sum(rows, "paidUnits")),
      sub: "Same transactions",
      tone: "success",
    },
  ],
  "pallet-utilization": (rows) => [
    { label: "Products", value: int(rows.length), sub: "With pallet sales", tone: "info" },
    {
      label: "Pallet Units",
      value: int(sum(rows, "palletUnitsSold")),
      sub: "At tier price",
      tone: "success",
    },
    {
      label: "Loose Units",
      value: int(sum(rows, "looseUnitsSold")),
      sub: "Remainder at normal price",
      tone: "info",
    },
  ],
};
