import { useMemo, useState } from "react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { SectionCard } from "@/components/buildpos/sections";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EMPTY_FILTER_STATE, ReportFilterBar, activeFilterCount, toReportQuery,
  type ReportFilterState,
} from "./ReportFilterBar";
import { ReportTable, type ReportColumn, type ReportDetail } from "./ReportTable";
import { REPORTS, REPORT_BY_KEY, REPORT_GROUPS, type ReportKey } from "./report-registry";
import {
  useCashierPerformanceReport, useCategoryPerformanceReport, useContractorAgingReport,
  useCustomerReturnsReport, useDamagedItemsReport, useDiscountUtilizationReport, useEmployeeAuditReport,
  useExpiryReport, useInventoryReport, useItemReport, useLowStockReport, usePaymentMethodsReport,
  useProfitMarginReport, usePurchaseOrderReport, useRefundMethodsReport, useReportFilterOptions,
  useRestockingFeesReport, useReturnsAnalysisReport, useSalesSummaryReport, useSlowMovingReport,
  useStockCountVarianceReport, useSupplierPerformanceReport, useSupplierReturnsReport,
  useTopProductsReport, useVatReport,
} from "@/lib/api/reports";

// Module 12 (BRD §7/§11): the operational reports console. The report catalogue, its filters and
// its columns are declared in report-registry.ts; this file is the shell — picker, shared filter
// bar, and the handful of aggregate reports whose shape is a summary rather than a row list.

const money = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
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
  const [active, setActive] = useState<ReportKey>("sales-summary");
  // Filters are remembered per report: switching to Low Stock and back shouldn't silently drop the
  // branch/date window you'd set up on Sales Summary.
  const [states, setStates] = useState<Partial<Record<ReportKey, ReportFilterState>>>({});

  const def = REPORT_BY_KEY[active];
  const state = states[active] ?? initialState(active);
  const query = useMemo(() => toReportQuery(state, def.dated), [state, def.dated]);
  const on = (key: ReportKey) => active === key;

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
  const employeeAudit = useEmployeeAuditReport(query, on("employee-audit"));

  // Maps each list-shaped report to its result. The aggregate reports (sales summary, VAT,
  // discount utilization) return an object, not rows, and render their own block below.
  const TABLE_DATA: Partial<Record<ReportKey, { data: unknown[] | undefined; isLoading: boolean }>> = {
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
    "employee-audit": employeeAudit,
  };

  function setState(next: ReportFilterState) {
    setStates((s) => ({ ...s, [active]: next }));
  }

  function clearFilters() {
    setStates((s) => ({ ...s, [active]: initialState(active) }));
  }

  const rangeLabel = query.from || query.to
    ? `${query.from ?? "…"} → ${query.to ?? "…"}`
    : def.dated ? "All time" : "Live snapshot";

  const table = TABLE_DATA[active];
  const rows = (table?.data ?? []) as never[];

  return (
    <div className="space-y-4">
      <PageHeader
        group="Insights"
        title="Reports"
        desc="Operational, inventory, procurement, returns, tax and audit reports — live from the transaction data, with drill-down to the individual items behind every row."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
        {/* Report picker */}
        <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
          {REPORT_GROUPS.map((group) => (
            <div key={group} className="flex shrink-0 gap-2 xl:block xl:shrink">
              <p className="hidden px-1 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground first:pt-0 xl:block">
                {group}
              </p>
              {REPORTS.filter((r) => r.group === group).map((r) => {
                const Icon = r.icon;
                const isActive = r.key === active;
                const count = states[r.key] ? activeFilterCount(states[r.key]!, r.dated) : 0;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setActive(r.key)}
                    className={`flex shrink-0 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition xl:mb-1.5 xl:w-full ${
                      isActive
                        ? "border-brand/40 bg-brand/5 shadow-sm"
                        : "border-black/5 bg-white hover:border-brand/25 hover:bg-brand/[0.03]"
                    }`}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? "text-brand" : "text-muted-foreground"}`} />
                    <span className="min-w-0">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold ${isActive ? "text-brand" : "text-foreground"}`}>
                        {r.label}
                        {count > 0 && !isActive && (
                          <span className="rounded-full bg-brand/10 px-1.5 text-[10px] font-medium text-brand">{count}</span>
                        )}
                      </span>
                      <span className="hidden text-[11px] leading-snug text-muted-foreground xl:block">{r.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Active report */}
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
                  { label: "Gross Sales", value: salesSummary.data ? money(salesSummary.data.grossSales) : "…", sub: rangeLabel, tone: "success" },
                  { label: "Discounts", value: salesSummary.data ? money(salesSummary.data.discounts) : "…", sub: "Given away", tone: "warning" },
                  { label: "VAT Collected", value: salesSummary.data ? money(salesSummary.data.vat) : "…", sub: "Output VAT", tone: "info" },
                  { label: "Net Takings", value: salesSummary.data ? money(salesSummary.data.netSales) : "…", sub: "Incl. VAT & fees", tone: "success" },
                  { label: "Orders", value: salesSummary.data ? int(salesSummary.data.orderCount) : "…", sub: "Completed, non-voided", tone: "muted" },
                ]}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ReportTable
                  title="By Payment Method"
                  columns={[
                    { key: "method", label: "Method" },
                    { key: "amount", label: "Amount", format: "money" },
                    { key: "count", label: "Txns", format: "int" },
                  ]}
                  rows={salesSummary.data?.byMethod ?? []}
                  loading={salesSummary.isLoading}
                  search={state.search}
                  exportName="sales-by-method"
                />
                <ReportTable
                  title="By Cashier"
                  columns={[
                    { key: "cashier", label: "Cashier" },
                    { key: "amount", label: "Amount", format: "money" },
                    { key: "orders", label: "Orders", format: "int" },
                  ]}
                  rows={salesSummary.data?.byCashier ?? []}
                  loading={salesSummary.isLoading}
                  search={state.search}
                  exportName="sales-by-cashier"
                />
              </div>
            </>
          )}

          {/* ————— Discount Utilization (aggregate) ————— */}
          {active === "discount-utilization" && (
            <>
              <KpiGrid
                items={[
                  { label: "Total Discounts", value: discountUtil.data ? money(discountUtil.data.totalDiscounts) : "…", sub: rangeLabel, tone: "warning" },
                  { label: "Discounted Orders", value: discountUtil.data ? int(discountUtil.data.discountedOrders) : "…", sub: `of ${discountUtil.data ? int(discountUtil.data.totalOrders) : "…"} orders`, tone: "info" },
                  { label: "Discount Rate", value: discountUtil.data ? `${discountUtil.data.discountRatePct.toFixed(1)}%` : "…", sub: "Of gross sales", tone: discountUtil.data && discountUtil.data.discountRatePct > 30 ? "critical" : "muted" },
                ]}
              />
              <SectionCard title="Reading This Report" desc="BRD §6.2 — discount authorization tiers">
                <p className="px-1 text-sm leading-relaxed text-muted-foreground">
                  A rising discount rate means margin is leaking through manual discounts. Ceilings per role (Cashier 5% /
                  Senior 10% / Supervisor 15%) gate each discount at the register; anything above the ceiling required a
                  logged supervisor approval. Cross-check unusual spikes against the Employee Audit report for the same
                  period, filtered to the Pos module.
                </p>
              </SectionCard>
            </>
          )}

          {/* ————— VAT (aggregate) ————— */}
          {active === "vat" && (
            <>
              <KpiGrid
                items={[
                  { label: "VAT Collected", value: vat.data ? money(vat.data.totalCollected) : "…", sub: rangeLabel, tone: "info" },
                  { label: "VAT Reversed", value: vat.data ? money(vat.data.totalReversed) : "…", sub: "Returns / credit notes", tone: "warning" },
                  { label: "Net VAT Position", value: vat.data ? money(vat.data.netVat) : "…", sub: "Payable to ZATCA", tone: "success" },
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
              {KPI_BUILDERS[active] && rows.length > 0 && <KpiGrid items={KPI_BUILDERS[active]!(rows)} />}
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
                            <span className="w-9 text-right text-[11px] text-muted-foreground">{Math.round(util)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{money(r.outstanding)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

type Kpi = { label: string; value: string; sub?: string; tone?: "critical" | "warning" | "success" | "info" | "muted" };

const sum = (rows: never[], key: string) =>
  rows.reduce((s, r) => s + (Number((r as Record<string, unknown>)[key]) || 0), 0);

// Roll-ups for the list reports where a total genuinely helps read the table. Reports without an
// entry here just render the table.
const KPI_BUILDERS: Partial<Record<ReportKey, (rows: never[]) => Kpi[]>> = {
  "item-report": (rows) => [
    { label: "Items", value: int(rows.length), sub: "Matching filters", tone: "info" },
    { label: "Stock Value", value: money(sum(rows, "stockValue")), sub: "At cost", tone: "info" },
    { label: "Revenue", value: money(sum(rows, "revenue")), sub: "In period", tone: "success" },
    { label: "Gross Profit", value: money(sum(rows, "grossProfit")), sub: "Revenue − COGS", tone: "success" },
  ],
  "inventory-report": (rows) => [
    { label: "Stock Lines", value: int(rows.length), sub: "Product × location", tone: "info" },
    { label: "On Hand", value: int(sum(rows, "onHand")), sub: "Units", tone: "info" },
    { label: "Stock Value", value: money(sum(rows, "stockValue")), sub: "At cost", tone: "success" },
    { label: "Retail Value", value: money(sum(rows, "retailValue")), sub: "At selling price", tone: "info" },
  ],
  "low-stock": (rows) => [
    { label: "Lines Below Reorder", value: int(rows.length), sub: "Needs replenishment", tone: "warning" },
    { label: "Out of Stock", value: int(rows.filter((r) => (r as { status: string }).status === "Critical").length), sub: "Can't be sold", tone: "critical" },
    { label: "Units Short", value: int(sum(rows, "shortfall")), sub: "Below reorder level", tone: "warning" },
    { label: "Restock Cost", value: money(sum(rows, "restockValue")), sub: "Suggested order at cost", tone: "info" },
  ],
  "stock-count-variance": (rows) => [
    { label: "Counts", value: int(rows.length), sub: "In period", tone: "info" },
    { label: "Variance Lines", value: int(sum(rows, "varianceLines")), sub: "SKUs that drifted", tone: "warning" },
    { label: "Net Variance", value: money(sum(rows, "netVarianceValue")), sub: "Overage − shortage", tone: "info" },
    { label: "Shrinkage Exposure", value: money(sum(rows, "absVarianceValue")), sub: "Absolute variance", tone: "critical" },
  ],
  "purchase-orders": (rows) => [
    { label: "Purchase Orders", value: int(rows.length), sub: "In period", tone: "info" },
    { label: "Ordered Value", value: money(sum(rows, "total")), sub: "Incl. shipping", tone: "info" },
    { label: "Qty Pending", value: int(sum(rows, "qtyPending")), sub: "Not yet received", tone: "warning" },
    { label: "Late POs", value: int(rows.filter((r) => (r as { daysLate: number }).daysLate > 0).length), sub: "Past expected date", tone: "critical" },
  ],
  "supplier-returns": (rows) => [
    { label: "RTS Tickets", value: int(rows.length), sub: "In period", tone: "info" },
    { label: "Units Returned", value: int(sum(rows, "qty")), sub: "To suppliers", tone: "warning" },
    { label: "Return Value", value: money(sum(rows, "value")), sub: "At cost", tone: "warning" },
    { label: "Awaiting Credit", value: int(rows.filter((r) => !(r as { creditNoteRef: string | null }).creditNoteRef).length), sub: "No credit note yet", tone: "critical" },
  ],
  "customer-returns": (rows) => [
    { label: "Return Tickets", value: int(rows.length), sub: "In period", tone: "info" },
    { label: "Gross Refund", value: money(sum(rows, "grossRefund")), sub: "Ex-VAT", tone: "warning" },
    { label: "VAT Reversed", value: money(sum(rows, "vatReversal")), sub: "Credit notes issued", tone: "info" },
    { label: "Net Cashback", value: money(sum(rows, "netCashback")), sub: "Paid back out", tone: "critical" },
  ],
  "damaged-items": (rows) => [
    { label: "Damaged Lines", value: int(rows.length), sub: "In period", tone: "warning" },
    { label: "Units Lost", value: int(sum(rows, "qty")), sub: "Quarantined", tone: "warning" },
    { label: "Loss Value", value: money(sum(rows, "lossValue")), sub: "At cost", tone: "critical" },
    { label: "Pending Approval", value: int(rows.filter((r) => (r as { status: string }).status === "PendingApproval").length), sub: "Awaiting sign-off", tone: "warning" },
  ],
  "expiry-report": (rows) => [
    { label: "Batches", value: int(rows.length), sub: "Matching filters", tone: "info" },
    { label: "Expiring ≤ 30d", value: int(rows.filter((r) => { const d = (r as { daysLeft: number }).daysLeft; return d >= 0 && d <= 30; }).length), sub: "Move to promo", tone: "warning" },
    { label: "Expired", value: int(rows.filter((r) => (r as { daysLeft: number }).daysLeft < 0).length), sub: "Write-off pending", tone: "critical" },
    { label: "Value at Risk", value: money(sum(rows.filter((r) => (r as { daysLeft: number }).daysLeft <= 30) as never[], "value")), sub: "≤ 30 days left", tone: "critical" },
  ],
  "profit-margin": (rows) => [
    { label: "Revenue", value: money(sum(rows, "revenue")), sub: "In period", tone: "success" },
    { label: "COGS", value: money(sum(rows, "cogs")), sub: "At cost price", tone: "info" },
    { label: "Gross Profit", value: money(sum(rows, "grossProfit")), sub: "Revenue − COGS", tone: "success" },
    { label: "Net Profit", value: money(sum(rows, "netProfit")), sub: "After returns", tone: "info" },
  ],
  "employee-audit": (rows) => [
    { label: "Events", value: int(rows.length), sub: "In period", tone: "info" },
    { label: "Critical", value: int(rows.filter((r) => (r as { severity: string }).severity === "Critical").length), sub: "Needs review", tone: "critical" },
    { label: "Warnings", value: int(rows.filter((r) => (r as { severity: string }).severity === "Warning").length), sub: "Flagged", tone: "warning" },
    { label: "Distinct Users", value: int(new Set(rows.map((r) => (r as { userName: string | null }).userName ?? "—")).size), sub: "Acted in period", tone: "muted" },
  ],
  "cashier-performance": (rows) => [
    { label: "Cashiers", value: int(rows.length), sub: "Active in period", tone: "info" },
    { label: "Orders", value: int(sum(rows, "orders")), sub: "Completed", tone: "info" },
    { label: "Net Takings", value: money(sum(rows, "net")), sub: "Incl. VAT", tone: "success" },
    { label: "Voids", value: int(sum(rows, "voidedOrders")), sub: "Reversed at register", tone: "warning" },
  ],
  "supplier-performance": (rows) => [
    { label: "Suppliers", value: int(rows.length), sub: "With activity", tone: "info" },
    { label: "Ordered Value", value: money(sum(rows, "orderedValue")), sub: "In period", tone: "info" },
    { label: "Received Value", value: money(sum(rows, "receivedValue")), sub: "Goods in", tone: "success" },
    { label: "Returned Value", value: money(sum(rows, "returnedValue")), sub: "Sent back", tone: "warning" },
  ],
  "payment-methods": (rows) => [
    { label: "Collected", value: money(sum(rows, "amount")), sub: "All methods", tone: "success" },
    { label: "Refunded", value: money(sum(rows, "refundAmount")), sub: "Paid back out", tone: "warning" },
    { label: "Net Settlement", value: money(sum(rows, "net")), sub: "Collected − refunded", tone: "info" },
    { label: "Transactions", value: int(sum(rows, "transactions")), sub: "Payment records", tone: "muted" },
  ],
  "returns-analysis": (rows) => [
    { label: "Tickets", value: int(sum(rows, "count")), sub: "All types", tone: "info" },
    { label: "Gross Refund", value: money(sum(rows, "grossRefund")), sub: "Ex-VAT", tone: "warning" },
    { label: "VAT Reversed", value: money(sum(rows, "vatReversed")), sub: "Credit notes", tone: "info" },
    { label: "Net Cashback", value: money(sum(rows, "netCashback")), sub: "After fees", tone: "critical" },
  ],
  "category-performance": (rows) => [
    { label: "Categories", value: int(rows.length), sub: "With activity", tone: "info" },
    { label: "Revenue", value: money(sum(rows, "revenue")), sub: "In period", tone: "success" },
    { label: "Gross Profit", value: money(sum(rows, "grossProfit")), sub: "Revenue − COGS", tone: "success" },
    { label: "Stock Value", value: money(sum(rows, "stockValue")), sub: "Branch stock at cost", tone: "info" },
  ],
};
