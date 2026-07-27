import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgePercent, Banknote, CalendarRange, Clock, Download, FileBarChart2, PackageSearch, Receipt,
  RotateCcw, Scale, TrendingUp,
} from "lucide-react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exportToCsv } from "@/components/buildpos/pos/shared";
import {
  useContractorAgingReport, useDiscountUtilizationReport, useRefundMethodsReport, useRestockingFeesReport,
  useReturnsAnalysisReport, useSalesSummaryReport, useSlowMovingReport, useTopProductsReport, useVatReport,
  type ReportDateRange,
} from "@/lib/api/reports";

// Module 12 (BRD §7): the operational reports console — one view per ReportsController endpoint,
// every view filterable and exportable. Replaces the static report-registry table that never
// surfaced any actual numbers.

const money = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const int = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

type ReportKey =
  | "sales-summary" | "top-products" | "discount-utilization"
  | "returns-analysis" | "refund-methods" | "restocking-fees"
  | "vat" | "slow-moving" | "contractor-aging";

const REPORTS: { key: ReportKey; label: string; desc: string; group: string; icon: typeof FileBarChart2; dated: boolean }[] = [
  { key: "sales-summary", label: "Sales Summary", desc: "Gross, discounts, VAT and net — by payment method and cashier.", group: "Sales", icon: TrendingUp, dated: true },
  { key: "top-products", label: "Top Products", desc: "Best sellers by revenue in the period.", group: "Sales", icon: FileBarChart2, dated: true },
  { key: "discount-utilization", label: "Discount Utilization", desc: "How much margin is being given away, and on how many orders.", group: "Sales", icon: BadgePercent, dated: true },
  { key: "returns-analysis", label: "Returns Analysis", desc: "Refunds, VAT reversals and restocking fees by return type.", group: "Returns", icon: RotateCcw, dated: true },
  { key: "refund-methods", label: "Refund Methods", desc: "How approved refunds were paid back out.", group: "Returns", icon: Banknote, dated: true },
  { key: "restocking-fees", label: "Restocking Fees", desc: "Fees withheld on surplus returns, month by month.", group: "Returns", icon: Receipt, dated: true },
  { key: "vat", label: "VAT Report", desc: "Output VAT by rate, reversals, and the net position.", group: "Tax & B2B", icon: Scale, dated: true },
  { key: "contractor-aging", label: "Contractor Aging", desc: "B2B credit exposure and how stale each account is.", group: "Tax & B2B", icon: Clock, dated: false },
  { key: "slow-moving", label: "Slow-Moving Stock", desc: "On-hand items with no sales in the chosen window.", group: "Inventory", icon: PackageSearch, dated: false },
];

const GROUPS = ["Sales", "Returns", "Tax & B2B", "Inventory"];

function firstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRESETS: { label: string; range: () => ReportDateRange }[] = [
  { label: "Today", range: () => ({ from: todayIso(), to: todayIso() }) },
  { label: "7 Days", range: () => ({ from: daysAgoIso(6), to: todayIso() }) },
  { label: "This Month", range: () => ({ from: firstOfMonth(), to: todayIso() }) },
  { label: "30 Days", range: () => ({ from: daysAgoIso(29), to: todayIso() }) },
  { label: "All Time", range: () => ({}) },
];

function LoadingRows({ cols }: { cols: number }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <TableRow key={i}>
          <TableCell colSpan={cols}>
            <div className="h-4 w-full animate-pulse rounded bg-black/5" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({ cols, label = "No data for the selected period." }: { cols: number; label?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-sm text-muted-foreground">{label}</TableCell>
    </TableRow>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => { onClick(); toast.success("Exported CSV"); }}>
      <Download className="h-3.5 w-3.5" /> Export
    </Button>
  );
}

export function ReportsConsole() {
  const [active, setActive] = useState<ReportKey>("sales-summary");
  const [range, setRange] = useState<ReportDateRange>(() => ({ from: firstOfMonth(), to: todayIso() }));
  const [preset, setPreset] = useState("This Month");
  const [topTake, setTopTake] = useState(10);
  const [slowDays, setSlowDays] = useState(30);

  const activeDef = REPORTS.find((r) => r.key === active)!;

  // Only the active report's query is enabled — switching reports fetches on demand and caches.
  const salesSummary = useSalesSummaryReport(range, active === "sales-summary");
  const topProducts = useTopProductsReport(range, topTake, active === "top-products");
  const discountUtil = useDiscountUtilizationReport(range, active === "discount-utilization");
  const returnsAnalysis = useReturnsAnalysisReport(range, active === "returns-analysis");
  const refundMethods = useRefundMethodsReport(range, active === "refund-methods");
  const restockingFees = useRestockingFeesReport(range, active === "restocking-fees");
  const vat = useVatReport(range, active === "vat");
  const slowMoving = useSlowMovingReport(slowDays, active === "slow-moving");
  const contractorAging = useContractorAgingReport(active === "contractor-aging");

  const returnsTotals = useMemo(() => {
    const rows = returnsAnalysis.data ?? [];
    return {
      count: rows.reduce((s, r) => s + r.count, 0),
      gross: rows.reduce((s, r) => s + r.grossRefund, 0),
      vatReversed: rows.reduce((s, r) => s + r.vatReversed, 0),
      fees: rows.reduce((s, r) => s + r.restockingFees, 0),
      net: rows.reduce((s, r) => s + r.netCashback, 0),
    };
  }, [returnsAnalysis.data]);

  function applyPreset(label: string) {
    const found = PRESETS.find((p) => p.label === label);
    if (!found) return;
    setPreset(label);
    setRange(found.range());
  }

  function setRangePart(part: "from" | "to", value: string) {
    setPreset("");
    setRange((r) => ({ ...r, [part]: value || undefined }));
  }

  const rangeLabel = range.from || range.to ? `${range.from ?? "…"} → ${range.to ?? "…"}` : "All time";

  return (
    <div className="space-y-4">
      <PageHeader
        group="Insights"
        title="Reports"
        desc="Operational, financial, returns, VAT and inventory reports — live from the transaction data."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
        {/* Report picker */}
        <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
          {GROUPS.map((group) => (
            <div key={group} className="flex shrink-0 gap-2 xl:block xl:shrink">
              <p className="hidden px-1 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground first:pt-0 xl:block">{group}</p>
              {REPORTS.filter((r) => r.group === group).map((r) => {
                const Icon = r.icon;
                const isActive = r.key === active;
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
                    <span>
                      <span className={`block text-xs font-semibold ${isActive ? "text-brand" : "text-foreground"}`}>{r.label}</span>
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
          {/* Filter bar */}
          {activeDef.dated ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2.5">
              <CalendarRange className="ms-1 h-4 w-4 text-muted-foreground" />
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.label)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    preset === p.label ? "bg-brand text-brand-foreground" : "bg-canvas text-foreground/80 hover:bg-brand/10"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Input type="date" value={range.from ?? ""} onChange={(e) => setRangePart("from", e.target.value)} className="h-8 w-36 text-xs" />
                <span>to</span>
                <Input type="date" value={range.to ?? ""} onChange={(e) => setRangePart("to", e.target.value)} className="h-8 w-36 text-xs" />
              </div>
              {active === "top-products" && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="ms-1">Top</span>
                  <Input type="number" min={1} max={100} value={topTake} onChange={(e) => setTopTake(Math.max(1, Math.min(100, Number(e.target.value) || 10)))} className="h-8 w-16 text-xs" />
                </div>
              )}
            </div>
          ) : active === "slow-moving" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2.5">
              <Clock className="ms-1 h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">No sales in the last</span>
              {[30, 60, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSlowDays(d)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    slowDays === d ? "bg-brand text-brand-foreground" : "bg-canvas text-foreground/80 hover:bg-brand/10"
                  }`}
                >
                  {d} days
                </button>
              ))}
            </div>
          ) : null}

          {/* ————— Sales Summary ————— */}
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
                <SectionCard
                  title="By Payment Method"
                  desc={`${salesSummary.data?.byMethod.length ?? 0} methods`}
                  action={<ExportButton onClick={() => exportToCsv("sales-by-method.csv", ["Method", "Amount", "Transactions"], (salesSummary.data?.byMethod ?? []).map((r) => [r.method, r.amount, r.count]))} />}
                >
                  <Table>
                    <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Txns</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {salesSummary.isLoading && <LoadingRows cols={3} />}
                      {(salesSummary.data?.byMethod ?? []).map((r) => (
                        <TableRow key={r.method}>
                          <TableCell className="font-medium">{r.method}</TableCell>
                          <TableCell className="text-right">{money(r.amount)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{int(r.count)}</TableCell>
                        </TableRow>
                      ))}
                      {!salesSummary.isLoading && (salesSummary.data?.byMethod.length ?? 0) === 0 && <EmptyRow cols={3} />}
                    </TableBody>
                  </Table>
                </SectionCard>
                <SectionCard
                  title="By Cashier"
                  desc={`${salesSummary.data?.byCashier.length ?? 0} cashiers`}
                  action={<ExportButton onClick={() => exportToCsv("sales-by-cashier.csv", ["Cashier", "Amount", "Orders"], (salesSummary.data?.byCashier ?? []).map((r) => [r.cashier, r.amount, r.orders]))} />}
                >
                  <Table>
                    <TableHeader><TableRow><TableHead>Cashier</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Orders</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {salesSummary.isLoading && <LoadingRows cols={3} />}
                      {(salesSummary.data?.byCashier ?? []).map((r) => (
                        <TableRow key={r.cashier}>
                          <TableCell className="font-medium">{r.cashier}</TableCell>
                          <TableCell className="text-right">{money(r.amount)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{int(r.orders)}</TableCell>
                        </TableRow>
                      ))}
                      {!salesSummary.isLoading && (salesSummary.data?.byCashier.length ?? 0) === 0 && <EmptyRow cols={3} />}
                    </TableBody>
                  </Table>
                </SectionCard>
              </div>
            </>
          )}

          {/* ————— Top Products ————— */}
          {active === "top-products" && (
            <SectionCard
              title={`Top ${topTake} Products by Revenue`}
              desc={rangeLabel}
              action={<ExportButton onClick={() => exportToCsv("top-products.csv", ["#", "SKU", "Product", "Units", "Revenue"], (topProducts.data ?? []).map((r, i) => [i + 1, r.sku, r.name, r.units, r.revenue]))} />}
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-10">#</TableHead><TableHead>SKU</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="w-1/4">Share</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {topProducts.isLoading && <LoadingRows cols={6} />}
                    {(topProducts.data ?? []).map((r, i) => {
                      const max = topProducts.data?.[0]?.revenue || 1;
                      return (
                        <TableRow key={r.sku}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right">{qty(r.units)}</TableCell>
                          <TableCell className="text-right font-medium">{money(r.revenue)}</TableCell>
                          <TableCell>
                            <div className="h-2 rounded-full bg-black/5">
                              <div className="h-2 rounded-full bg-brand/70" style={{ width: `${Math.max(3, (r.revenue / max) * 100)}%` }} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!topProducts.isLoading && (topProducts.data?.length ?? 0) === 0 && <EmptyRow cols={6} />}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          {/* ————— Discount Utilization ————— */}
          {active === "discount-utilization" && (
            <>
              <KpiGrid
                items={[
                  { label: "Total Discounts", value: discountUtil.data ? money(discountUtil.data.totalDiscounts) : "…", sub: rangeLabel, tone: "warning" },
                  { label: "Discounted Orders", value: discountUtil.data ? int(discountUtil.data.discountedOrders) : "…", sub: `of ${discountUtil.data ? int(discountUtil.data.totalOrders) : "…"} orders`, tone: "info" },
                  { label: "Discount Rate", value: discountUtil.data ? `${discountUtil.data.discountRatePct.toFixed(1)}%` : "…", sub: "Orders carrying a discount", tone: discountUtil.data && discountUtil.data.discountRatePct > 30 ? "critical" : "muted" },
                ]}
              />
              <SectionCard title="Reading This Report" desc="BRD §6.2 — discount authorization tiers">
                <p className="px-1 text-sm leading-relaxed text-muted-foreground">
                  A rising discount rate means margin is leaking through manual discounts. Ceilings per role (Cashier 5% /
                  Senior 10% / Supervisor 15%) gate each discount at the register; anything above the ceiling required a
                  logged supervisor approval. Cross-check unusual spikes against the Approvals log for the same period.
                </p>
              </SectionCard>
            </>
          )}

          {/* ————— Returns Analysis ————— */}
          {active === "returns-analysis" && (
            <SectionCard
              title="Returns by Type"
              desc={rangeLabel}
              action={<ExportButton onClick={() => exportToCsv("returns-analysis.csv", ["Type", "Tickets", "Gross Refund", "VAT Reversed", "Restocking Fees", "Net Cashback"], (returnsAnalysis.data ?? []).map((r) => [r.type, r.count, r.grossRefund, r.vatReversed, r.restockingFees, r.netCashback]))} />}
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Tickets</TableHead><TableHead className="text-right">Gross Refund</TableHead><TableHead className="text-right">VAT Reversed</TableHead><TableHead className="text-right">Restocking Fees</TableHead><TableHead className="text-right">Net Cashback</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {returnsAnalysis.isLoading && <LoadingRows cols={6} />}
                    {(returnsAnalysis.data ?? []).map((r) => (
                      <TableRow key={r.type}>
                        <TableCell className="font-medium">{r.type}</TableCell>
                        <TableCell className="text-right">{int(r.count)}</TableCell>
                        <TableCell className="text-right">{money(r.grossRefund)}</TableCell>
                        <TableCell className="text-right">{money(r.vatReversed)}</TableCell>
                        <TableCell className="text-right">{money(r.restockingFees)}</TableCell>
                        <TableCell className="text-right font-medium">{money(r.netCashback)}</TableCell>
                      </TableRow>
                    ))}
                    {!returnsAnalysis.isLoading && (returnsAnalysis.data?.length ?? 0) > 0 && (
                      <TableRow className="bg-canvas font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{int(returnsTotals.count)}</TableCell>
                        <TableCell className="text-right">{money(returnsTotals.gross)}</TableCell>
                        <TableCell className="text-right">{money(returnsTotals.vatReversed)}</TableCell>
                        <TableCell className="text-right">{money(returnsTotals.fees)}</TableCell>
                        <TableCell className="text-right">{money(returnsTotals.net)}</TableCell>
                      </TableRow>
                    )}
                    {!returnsAnalysis.isLoading && (returnsAnalysis.data?.length ?? 0) === 0 && <EmptyRow cols={6} label="No returns in the selected period." />}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          {/* ————— Refund Methods ————— */}
          {active === "refund-methods" && (
            <SectionCard
              title="Refunds Paid Out, by Method"
              desc={rangeLabel}
              action={<ExportButton onClick={() => exportToCsv("refund-methods.csv", ["Method", "Refunds", "Amount"], (refundMethods.data ?? []).map((r) => [r.method, r.count, r.amount]))} />}
            >
              <Table>
                <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Refunds</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {refundMethods.isLoading && <LoadingRows cols={3} />}
                  {(refundMethods.data ?? []).map((r, i) => (
                    <TableRow key={r.method || `unspecified-${i}`}>
                      <TableCell className="font-medium">
                        {r.method || <span className="italic text-muted-foreground">Unspecified (legacy record)</span>}
                      </TableCell>
                      <TableCell className="text-right">{int(r.count)}</TableCell>
                      <TableCell className="text-right">{money(r.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {!refundMethods.isLoading && (refundMethods.data?.length ?? 0) === 0 && <EmptyRow cols={3} label="No approved refunds in the selected period." />}
                </TableBody>
              </Table>
            </SectionCard>
          )}

          {/* ————— Restocking Fees ————— */}
          {active === "restocking-fees" && (
            <SectionCard
              title="Restocking Fees Collected"
              desc={rangeLabel}
              action={<ExportButton onClick={() => exportToCsv("restocking-fees.csv", ["Month", "Surplus Returns", "Fees Collected"], (restockingFees.data ?? []).map((r) => [r.month, r.returns, r.feesCollected]))} />}
            >
              <Table>
                <TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Surplus Returns</TableHead><TableHead className="text-right">Fees Collected</TableHead></TableRow></TableHeader>
                <TableBody>
                  {restockingFees.isLoading && <LoadingRows cols={3} />}
                  {(restockingFees.data ?? []).map((r) => (
                    <TableRow key={r.month}>
                      <TableCell className="font-medium">{r.month}</TableCell>
                      <TableCell className="text-right">{int(r.returns)}</TableCell>
                      <TableCell className="text-right">{money(r.feesCollected)}</TableCell>
                    </TableRow>
                  ))}
                  {!restockingFees.isLoading && (restockingFees.data?.length ?? 0) === 0 && <EmptyRow cols={3} label="No restocking fees in the selected period." />}
                </TableBody>
              </Table>
            </SectionCard>
          )}

          {/* ————— VAT ————— */}
          {active === "vat" && (
            <>
              <KpiGrid
                items={[
                  { label: "VAT Collected", value: vat.data ? money(vat.data.totalCollected) : "…", sub: rangeLabel, tone: "info" },
                  { label: "VAT Reversed", value: vat.data ? money(vat.data.totalReversed) : "…", sub: "Returns / credit notes", tone: "warning" },
                  { label: "Net VAT Position", value: vat.data ? money(vat.data.netVat) : "…", sub: "Payable to ZATCA", tone: "success" },
                ]}
              />
              <SectionCard
                title="Output VAT by Rate"
                desc="Excludes voided orders; reversals from approved returns"
                action={<ExportButton onClick={() => exportToCsv("vat-report.csv", ["Rate %", "Taxable Amount", "VAT Collected"], (vat.data?.collected ?? []).map((r) => [r.rate, r.taxableAmount, r.vatCollected]))} />}
              >
                <Table>
                  <TableHeader><TableRow><TableHead>Rate</TableHead><TableHead className="text-right">Taxable Amount</TableHead><TableHead className="text-right">VAT Collected</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {vat.isLoading && <LoadingRows cols={3} />}
                    {(vat.data?.collected ?? []).map((r) => (
                      <TableRow key={r.rate}>
                        <TableCell className="font-medium">{r.rate}%</TableCell>
                        <TableCell className="text-right">{money(r.taxableAmount)}</TableCell>
                        <TableCell className="text-right">{money(r.vatCollected)}</TableCell>
                      </TableRow>
                    ))}
                    {!vat.isLoading && (vat.data?.collected.length ?? 0) === 0 && <EmptyRow cols={3} />}
                  </TableBody>
                </Table>
              </SectionCard>
            </>
          )}

          {/* ————— Slow-Moving ————— */}
          {active === "slow-moving" && (
            <SectionCard
              title={`No Sales in ${slowDays} Days`}
              desc={`${slowMoving.data?.length ?? 0} SKUs holding stock`}
              action={<ExportButton onClick={() => exportToCsv("slow-moving.csv", ["SKU", "Product", "On Hand", "Last Sold"], (slowMoving.data ?? []).map((r) => [r.sku, r.name, r.onHand, r.lastSoldAt ?? "Never"]))} />}
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Product</TableHead><TableHead className="text-right">On Hand</TableHead><TableHead>Last Sold</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {slowMoving.isLoading && <LoadingRows cols={4} />}
                    {(slowMoving.data ?? []).map((r) => (
                      <TableRow key={r.sku}>
                        <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right">{qty(r.onHand)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.lastSoldAt
                            ? new Date(r.lastSoldAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
                            : <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium">Never sold</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!slowMoving.isLoading && (slowMoving.data?.length ?? 0) === 0 && <EmptyRow cols={4} label="Nothing slow-moving — every stocked SKU sold recently." />}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          {/* ————— Contractor Aging ————— */}
          {active === "contractor-aging" && (
            <SectionCard
              title="B2B / Contractor Credit Exposure"
              desc={`${contractorAging.data?.length ?? 0} accounts with outstanding balances`}
              action={<ExportButton onClick={() => exportToCsv("contractor-aging.csv", ["Customer", "Credit Limit", "Outstanding", "Utilization %", "Days Since Purchase"], (contractorAging.data ?? []).map((r) => [r.customer, r.creditLimit, r.outstanding, r.creditLimit > 0 ? Math.round((r.outstanding / r.creditLimit) * 100) : 0, r.daysSinceLastPurchase]))} />}
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Credit Limit</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="w-1/5">Utilization</TableHead><TableHead className="text-right">Inactive</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {contractorAging.isLoading && <LoadingRows cols={5} />}
                    {(contractorAging.data ?? []).map((r) => {
                      const util = r.creditLimit > 0 ? (r.outstanding / r.creditLimit) * 100 : 0;
                      return (
                        <TableRow key={r.customer}>
                          <TableCell className="font-medium">{r.customer}</TableCell>
                          <TableCell className="text-right">{money(r.creditLimit)}</TableCell>
                          <TableCell className="text-right font-medium">{money(r.outstanding)}</TableCell>
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
                          <TableCell className="text-right text-muted-foreground">
                            {r.daysSinceLastPurchase > 60
                              ? <span className="rounded bg-critical/10 px-1.5 py-0.5 text-[11px] font-medium text-critical">{r.daysSinceLastPurchase}d</span>
                              : `${r.daysSinceLastPurchase}d`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!contractorAging.isLoading && (contractorAging.data?.length ?? 0) === 0 && <EmptyRow cols={5} label="No B2B accounts carry an outstanding balance." />}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
