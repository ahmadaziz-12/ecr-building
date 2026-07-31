import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LayoutDashboard,
  TrendingUp,
  Boxes,
  Truck,
  UserSquare2,
  Wallet,
  Shield,
} from "lucide-react";
import {
  FilterBar,
  OverviewKpis,
  HourlySummary,
  TopCategoriesCompact,
  DispatchPipelinePreview,
  CashierWorkspaceSummary,
  SalesPerfKpis,
  RecentOrdersTable,
  InventoryKpiGrid,
  InventoryHealth,
  DeliveryPipelineBoard,
  CashierKpiGrid,
  TerminalDetailTable,
  PaymentBreakdownTiles,
  ReturnBreakdownTiles,
  AlertsByGroup,
  SalesPerformance,
  BranchPerformance,
} from "@/components/buildpos/sections";
import { CardCustomizer } from "@/components/buildpos/CardCustomizer";
import { applyCardPreference, useCardPreferences } from "@/lib/buildpos/card-preferences";
import { useFilters } from "@/lib/buildpos/filter-context";
import { resolveDateRangeBounds } from "@/components/buildpos/FilterControls";
import { formatSAR, type Severity } from "@/lib/buildpos/format";
import { useAuth } from "@/lib/api/auth";
import { useOrders, useCashierShifts, useParkedSales, useCustomers } from "@/lib/api/pos";
import {
  useStockLevels,
  useStockBatches,
  useBranchStockBatches,
  useStockTransfers,
  useWarehouses,
} from "@/lib/api/inventory";
import { useProducts } from "@/lib/api/catalog";
import { useDeliveryOrdersApi } from "@/lib/api/delivery";
import { useZatcaInvoices } from "@/lib/api/zatca";
import { useReturns } from "@/lib/api/finance";
import { useBranches, useTerminals, useDevices } from "@/lib/api/admin";
import { useNotifications } from "@/lib/api/notifications";
import { useEmployeesApi } from "@/lib/api/hr";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Building Materials Operations — BuildPOS" },
      {
        name: "description",
        content:
          "BuildPOS Command Center — sales, inventory, dispatch, cashiers, payments and ZATCA compliance for KSA building-material retailers.",
      },
      { property: "og:title", content: "Building Materials Operations — BuildPOS" },
      {
        property: "og:description",
        content:
          "Live dashboard for construction retail: cement, steel, tiles, paint, plumbing, electrical across every branch.",
      },
    ],
  }),
  component: OverviewPage,
});

// Real delivery-order stage strings (backend enum) collapsed into the dashboard's 6 display lanes.
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function stageBucket(stage: string): string {
  if (stage === "Pending") return "Pending";
  if (stage === "Assigned") return "Assigned";
  if (stage === "Loading" || stage === "ReadyToDispatch") return "Loading";
  if (stage === "Dispatched" || stage === "PartiallyDelivered") return "Dispatched";
  if (stage === "Delivered") return "Delivered";
  return "Failed / Returned";
}

function categoryIconFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cement")) return "layers";
  if (n.includes("steel")) return "bar";
  if (n.includes("tile")) return "grid";
  if (n.includes("paint")) return "paint";
  if (n.includes("plumb")) return "pipe";
  if (n.includes("electric")) return "zap";
  if (n.includes("tool") || n.includes("hardware")) return "hammer";
  if (n.includes("glass")) return "square";
  return "layers";
}

const PAYMENT_META: Record<string, { tone: Severity; icon: string }> = {
  Cash: { tone: "success", icon: "receipt" },
  Mada: { tone: "info", icon: "cart" },
  Card: { tone: "info", icon: "cart" },
  ApplePay: { tone: "info", icon: "receipt" },
  StcPay: { tone: "info", icon: "receipt" },
  Transfer: { tone: "warning", icon: "receipt" },
  AccountCredit: { tone: "warning", icon: "receipt" },
};

/**
 * Wires one row of dashboard KPI cards to the shared card-customization preference: what to render,
 * and the props the "Customise cards" control needs. Keyed by each card's stable `key`, labelled by
 * its human title.
 */
function useKpiCards<T extends { key: string; title: string }>(scope: string, items: T[]) {
  const signature = items.map((i) => `${i.key}:${i.title}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const keys = useMemo(() => items.map((i) => i.key), [signature]);
  const labels = useMemo(
    () => Object.fromEntries(items.map((i) => [i.key, i.title])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );
  const prefs = useCardPreferences(scope, keys);
  const visible = useMemo(
    () => applyCardPreference(items, (i) => i.key, prefs.order, prefs.hidden),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, items, prefs.order, prefs.hidden],
  );
  return { labels, prefs, visible };
}

/** Header strip above a customizable card row. */
function CardRowHeader({
  title,
  cards,
}: {
  title: string;
  cards: { labels: Record<string, string>; prefs: ReturnType<typeof useCardPreferences> };
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <CardCustomizer labels={cards.labels} prefs={cards.prefs} />
    </div>
  );
}

const ALL_CARDS_HIDDEN = (
  <p className="rounded-2xl border border-dashed border-black/10 bg-white py-8 text-center text-sm text-muted-foreground">
    Every card is hidden. Use "Customise cards" to bring some back.
  </p>
);

function OverviewPage() {
  const { activeTab, setActiveTab, values: filterValues, dateRange } = useFilters();
  const navigate = useNavigate();
  const { hasAccess, user } = useAuth();

  const { data: orders } = useOrders(hasAccess("/operate/orders"));
  const { data: products } = useProducts(hasAccess("/stock/inventory"));
  const { data: stockLevels } = useStockLevels(hasAccess("/stock/stocks"));
  const { data: warehouses } = useWarehouses(hasAccess("/stock/warehouses"));
  const { data: stockBatches } = useStockBatches(hasAccess("/stock/expiry"));
  const { data: branchStockBatches } = useBranchStockBatches(hasAccess("/stock/expiry"));
  const { data: stockTransfers } = useStockTransfers(hasAccess("/stock/transfers"));
  const { data: deliveryOrders } = useDeliveryOrdersApi(hasAccess("/delivery/orders"));
  const { data: cashierShifts } = useCashierShifts(hasAccess("/operate/cashier-shift"));
  const { data: zatcaInvoices } = useZatcaInvoices(undefined, hasAccess("/admin/zatca-invoices"));
  const { data: returnsData } = useReturns(hasAccess("/finance/returns"));
  const { data: branches } = useBranches(hasAccess("/network/branches"));
  const { data: terminals } = useTerminals(hasAccess("/network/terminals"));
  const { data: devices } = useDevices(hasAccess("/network/devices"));
  const { data: notifications } = useNotifications();
  const { data: customers } = useCustomers(hasAccess("/operate/customers"));
  const { data: employees } = useEmployeesApi();
  // Only 2 branches exist in this deployment — ParkedSalesController requires a branchId per
  // call, so summing the two known branches is the only way to get a cross-branch total (a
  // third call per new branch would be needed if the network grows).
  const { data: parkedBranch1 } = useParkedSales(1, hasAccess("/operate/pos-checkout"));
  const { data: parkedBranch2 } = useParkedSales(2, hasAccess("/operate/pos-checkout"));

  // Every FilterBar group is multi-select (an empty selection means "no filter" — see
  // MultiSelectFilter) and options come from live data, so these narrow every KPI/chart/table by
  // filtering at the source rather than comparing against labels that never occur.
  const selectedBranchIds = (filterValues.Branch ?? []).length
    ? new Set(
        (branches ?? []).filter((b) => filterValues.Branch.includes(b.nameEn)).map((b) => b.id),
      )
    : null;
  const selectedTerminalIds = (filterValues.Terminal ?? []).length
    ? new Set(
        (terminals ?? []).filter((t) => filterValues.Terminal.includes(t.code)).map((t) => t.id),
      )
    : null;
  const selectedCashiers = (filterValues.Cashier ?? []).length
    ? new Set(filterValues.Cashier)
    : null;
  const selectedStatuses = (filterValues.Status ?? []).length ? new Set(filterValues.Status) : null;
  const dateBounds = useMemo(() => resolveDateRangeBounds(dateRange), [dateRange]);
  const inDateBounds = (iso: string) => {
    if (!dateBounds) return true;
    const t = new Date(iso).getTime();
    return t >= dateBounds.from.getTime() && t <= dateBounds.to.getTime();
  };

  const customerMap = useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);
  const customerTierOf = (customerId: number | null): string => {
    if (customerId === null) return "Walk-in";
    const c = customerMap.get(customerId);
    if (!c) return "Walk-in";
    if (c.loyaltyEnrolled) return "Loyalty Member";
    return c.type === "WalkIn" ? "Walk-in" : "Retail";
  };
  const selectedCustomerTiers = (filterValues.Customer ?? []).length
    ? new Set(filterValues.Customer)
    : null;
  const selectedContractors = (filterValues["Contractor Account"] ?? []).length
    ? new Set(filterValues["Contractor Account"])
    : null;
  const selectedPaymentMethods = (filterValues["Payment Method"] ?? []).length
    ? new Set(filterValues["Payment Method"])
    : null;
  const selectedReturnTypes = (filterValues["Return Type"] ?? []).length
    ? new Set(filterValues["Return Type"])
    : null;
  const selectedStockStatuses = (filterValues["Stock Status"] ?? []).length
    ? new Set(filterValues["Stock Status"])
    : null;
  const selectedDeliveryStatuses = (filterValues["Delivery Status"] ?? []).length
    ? new Set(filterValues["Delivery Status"])
    : null;
  const selectedInvoiceStatuses = (filterValues["Invoice Status"] ?? []).length
    ? new Set(filterValues["Invoice Status"])
    : null;
  const selectedSuppliers = (filterValues.Supplier ?? []).length
    ? new Set(filterValues.Supplier)
    : null;

  const terminalsList = terminals ?? [];
  // Best-effort join only — Order/CashierShift carry cashierName (string), not an employee FK, so
  // this matches by full name and silently misses cashiers whose seeded name diverges from HR.
  const departmentByName = useMemo(
    () => new Map((employees ?? []).map((e) => [`${e.firstName} ${e.lastName}`, e.departmentName])),
    [employees],
  );
  const selectedDepartments = (filterValues["Employee Department"] ?? []).length
    ? new Set(filterValues["Employee Department"])
    : null;
  // "Needs Review" (display label) has no space in the real CashierShiftStatus enum.
  const selectedShiftStatuses = (filterValues["Shift Status"] ?? []).length
    ? new Set(filterValues["Shift Status"].map((s) => (s === "Needs Review" ? "NeedsReview" : s)))
    : null;

  const orderList = useMemo(
    () =>
      (orders ?? [])
        .filter((o) => !selectedBranchIds || selectedBranchIds.has(o.branchId))
        .filter(
          (o) =>
            !selectedTerminalIds ||
            (o.terminalId !== null && selectedTerminalIds.has(o.terminalId)),
        )
        .filter((o) => !selectedCashiers || selectedCashiers.has(o.cashierName))
        .filter((o) => !selectedStatuses || selectedStatuses.has(o.status))
        .filter(
          (o) => !selectedCustomerTiers || selectedCustomerTiers.has(customerTierOf(o.customerId)),
        )
        .filter((o) => {
          if (!selectedContractors) return true;
          const c = o.customerId === null ? undefined : customerMap.get(o.customerId);
          return c ? selectedContractors.has(c.nameEn) : false;
        })
        .filter(
          (o) =>
            !selectedPaymentMethods || o.payments.some((p) => selectedPaymentMethods.has(p.method)),
        )
        .filter(
          (o) =>
            !selectedDepartments ||
            selectedDepartments.has(departmentByName.get(o.cashierName) ?? ""),
        )
        .filter((o) => inDateBounds(o.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      orders,
      selectedBranchIds,
      selectedTerminalIds,
      selectedCashiers,
      selectedStatuses,
      selectedCustomerTiers,
      selectedContractors,
      selectedPaymentMethods,
      selectedDepartments,
      customerMap,
      departmentByName,
      dateBounds,
    ],
  );
  // Revenue = every order that wasn't voided — the same rule the Reports console applies
  // (ReportsController.CompletedOrders). Filtering on status === "Completed" instead silently
  // dropped Dispatched/Delivered/Returned orders, so the dashboard and the Sales Summary report
  // disagreed on gross sales the moment a sale moved past the register.
  const revenueOrders = useMemo(() => orderList.filter((o) => o.status !== "Voided"), [orderList]);
  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const stockLevelsList = useMemo(
    () =>
      (stockLevels ?? []).filter((s) => {
        if (!selectedStockStatuses) return true;
        if (selectedStockStatuses.has("Out of Stock") && s.available === 0) return true;
        // "Quarantine" is a stock-batch state, not a StockLevel status — never matches here.
        return selectedStockStatuses.has(s.status);
      }),
    [stockLevels, selectedStockStatuses],
  );
  const deliveryList = useMemo(
    () =>
      (deliveryOrders ?? [])
        .filter(
          (d) => !selectedDeliveryStatuses || selectedDeliveryStatuses.has(stageBucket(d.stage)),
        )
        .filter((d) => inDateBounds(d.promisedDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deliveryOrders, selectedDeliveryStatuses, dateBounds],
  );
  const zatcaList = useMemo(
    () =>
      (zatcaInvoices ?? [])
        .filter((i) => !selectedInvoiceStatuses || selectedInvoiceStatuses.has(i.status))
        .filter((i) => inDateBounds(i.issueDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zatcaInvoices, selectedInvoiceStatuses, dateBounds],
  );
  const zatcaByOrderId = useMemo(() => new Map(zatcaList.map((i) => [i.orderId, i])), [zatcaList]);
  // Returns honour the same branch/cashier/date filters as the order-derived KPIs plus Return Type
  // — left global, the refund tile stayed frozen while every sales figure next to it moved with
  // the filter bar, and it could never reconcile against the Customer Returns report for the same
  // period.
  const returnsList = useMemo(
    () =>
      (returnsData ?? [])
        .filter(
          (r) => !selectedBranchIds || (r.branchId !== null && selectedBranchIds.has(r.branchId)),
        )
        .filter(
          (r) =>
            !selectedCashiers || (r.cashierName !== null && selectedCashiers.has(r.cashierName)),
        )
        .filter((r) => !selectedReturnTypes || selectedReturnTypes.has(r.type))
        .filter((r) => inDateBounds(r.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [returnsData, selectedBranchIds, selectedCashiers, selectedReturnTypes, dateBounds],
  );
  const cashierShiftsList = useMemo(
    () =>
      (cashierShifts ?? [])
        .filter((s) => !selectedTerminalIds || selectedTerminalIds.has(s.terminalId))
        .filter((s) => !selectedCashiers || selectedCashiers.has(s.cashierName))
        .filter((s) => !selectedShiftStatuses || selectedShiftStatuses.has(s.status))
        .filter(
          (s) =>
            !selectedDepartments ||
            selectedDepartments.has(departmentByName.get(s.cashierName) ?? ""),
        )
        .filter((s) => inDateBounds(s.openedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      cashierShifts,
      selectedTerminalIds,
      selectedCashiers,
      selectedShiftStatuses,
      selectedDepartments,
      departmentByName,
      dateBounds,
    ],
  );
  const parkedSalesAll = [...(parkedBranch1 ?? []), ...(parkedBranch2 ?? [])];

  const grossSales = revenueOrders.reduce((s, o) => s + o.subTotal, 0);
  const discountsTotal = revenueOrders.reduce((s, o) => s + o.discountTotal, 0);
  const grandTotalSum = revenueOrders.reduce((s, o) => s + o.grandTotal, 0);
  const txCount = revenueOrders.length;
  // Two decimals, matching Sales Summary's avgBasket. Rounding to whole riyals here made the two
  // screens disagree by up to half a riyal on the same set of orders.
  const avgBasket = txCount ? Math.round((grandTotalSum / txCount) * 100) / 100 : 0;

  const lowStockCount = stockLevelsList.filter((s) => s.status === "Low").length;
  const criticalStockCount = stockLevelsList.filter((s) => s.status === "Critical").length;
  const availableUnits = stockLevelsList.reduce((s, x) => s + x.available, 0);
  const reservedUnits = stockLevelsList.reduce((s, x) => s + x.reserved, 0);
  const stockValue = stockLevelsList.reduce((s, x) => s + x.value, 0);
  // Batches sitting at a branch (post-transfer/receive) expire just as much as warehouse-backroom
  // ones — omitting them here would undercount exactly the stock closest to actually being sold.
  const allBatches = [...(stockBatches ?? []), ...(branchStockBatches ?? [])];
  const quarantineBatches = allBatches.filter((b) => b.status === "Quarantine");
  const quarantineQty = quarantineBatches.reduce((s, b) => s + b.qty, 0);
  const expiringBatches = allBatches.filter((b) => b.daysLeft >= 0 && b.daysLeft <= 30);
  const pendingTransfers = (stockTransfers ?? []).filter(
    (t) => t.status !== "Received" && t.status !== "Cancelled",
  );

  const activeDeliveries = deliveryList.filter(
    (d) => !["Delivered", "Failed", "Cancelled", "ReturnedToBranch"].includes(d.stage),
  );
  const overdueDeliveries = deliveryList.filter((d) => d.overdue);

  const openShiftsList = cashierShiftsList.filter((s) => s.status === "Open");
  const shiftsNeedingReview = cashierShiftsList.filter(
    (s) => s.variance != null && Math.abs(s.variance) > 0,
  );
  const worstVarianceShift = [...cashierShiftsList].sort(
    (a, b) => Math.abs(b.variance ?? 0) - Math.abs(a.variance ?? 0),
  )[0];
  const offlineTerminalsList = terminalsList.filter((t) => t.status !== "Online");

  // KPI wording is deliberately the same vocabulary the Reports console uses, because these are
  // the same measures: "Net Takings" here is Sales Summary's Net Takings (Σ GrandTotal), and
  // "Gross Sales" is its Gross Sales (Σ SubTotal, ex-VAT, before discounts). Previously the tile
  // showing Σ GrandTotal was called "Total Material Sales" and a *different* figure was called
  // "Net Sales", so the two screens appeared to contradict each other.
  const overviewKpisReal = [
    {
      key: "sales",
      title: "Net Takings",
      value: formatSAR(grandTotalSum),
      sub: `${txCount} transactions · incl. VAT`,
      tone: "success" as Severity,
      icon: "trending",
    },
    {
      key: "net",
      title: "Gross Sales",
      value: formatSAR(grossSales),
      sub: `Ex-VAT · less ${formatSAR(discountsTotal)} discounts`,
      tone: "info" as Severity,
      icon: "receipt",
    },
    {
      key: "tx",
      title: "Transactions",
      value: String(txCount),
      sub: `Avg basket ${formatSAR(avgBasket)}`,
      tone: "info" as Severity,
      icon: "cart",
    },
    {
      key: "low",
      title: "Low Stock Materials",
      value: `${lowStockCount + criticalStockCount} SKUs`,
      sub: `${criticalStockCount} out of stock · warehouse`,
      tone: (criticalStockCount > 0
        ? "critical"
        : lowStockCount > 0
          ? "warning"
          : "success") as Severity,
      icon: "package",
    },
    {
      key: "del",
      title: "Active Deliveries",
      value: String(activeDeliveries.length),
      sub: `${overdueDeliveries.length} overdue`,
      tone: (overdueDeliveries.length > 0 ? "critical" : "info") as Severity,
      icon: "truck",
    },
    {
      key: "shift",
      title: "Open Shifts",
      value: String(openShiftsList.length),
      sub: shiftsNeedingReview.length
        ? `${shiftsNeedingReview.length} need review`
        : "All reconciled",
      tone: (shiftsNeedingReview.length ? "warning" : "info") as Severity,
      icon: "users",
    },
  ];

  const hourlyReal = useMemo(() => {
    const buckets = new Map<string, { gross: number; net: number; returns: number; vat: number }>();
    for (const o of revenueOrders) {
      const label = `${String(new Date(o.createdAt).getHours()).padStart(2, "0")}:00`;
      const cur = buckets.get(label) ?? { gross: 0, net: 0, returns: 0, vat: 0 };
      cur.gross += o.subTotal;
      cur.net += o.grandTotal - o.vatTotal;
      cur.vat += o.vatTotal;
      buckets.set(label, cur);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, v]) => ({ time, ...v }));
  }, [revenueOrders]);

  const dispatchPipelineReal = useMemo(() => {
    const toneFor: Record<string, Severity> = {
      Pending: "warning",
      Assigned: "info",
      Loading: "info",
      Dispatched: "info",
      Delivered: "success",
      "Failed / Returned": "critical",
    };
    return ["Pending", "Assigned", "Loading", "Dispatched", "Delivered", "Failed / Returned"].map(
      (key) => ({
        key,
        count: deliveryList.filter((d) => stageBucket(d.stage) === key).length,
        tone: toneFor[key],
      }),
    );
  }, [deliveryList]);

  const deliveryDetailReal = useMemo(
    () =>
      deliveryList.map((d) => ({
        no: d.deliveryNo,
        order: d.orderId ? `ORD-${d.orderId}` : "—",
        customer: d.customerName,
        materials: d.lines.map((l) => l.productName).join(", ") || "—",
        qty: `${d.lines.reduce((s, l) => s + l.deliveryQty, 0)} units`,
        weight: `${d.weightTons} t`,
        area: d.area,
        promised: `${new Date(d.promisedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}, ${d.promisedTime}`,
        driver: d.driverName ?? "Unassigned",
        vehicle: d.vehicleRegistration ?? "Unassigned",
        status: stageBucket(d.stage),
        amount: formatSAR(d.amount),
        priority: d.priority,
      })),
    [deliveryList],
  );

  const cashierTilesReal: { l: string; v: string; tone: Severity }[] = [
    {
      l: "Active terminals",
      v: `${terminalsList.length - offlineTerminalsList.length} of ${terminalsList.length}`,
      tone: offlineTerminalsList.length ? "warning" : "success",
    },
    { l: "Open shifts", v: String(openShiftsList.length), tone: "info" },
    {
      l: "Parked sales",
      v: String(parkedSalesAll.length),
      tone: parkedSalesAll.length ? "warning" : "success",
    },
    {
      l: "Needs review",
      v: String(shiftsNeedingReview.length),
      tone: shiftsNeedingReview.length ? "warning" : "success",
    },
    {
      l: "Offline terminals",
      v: offlineTerminalsList.length ? offlineTerminalsList.map((t) => t.code).join(", ") : "None",
      tone: offlineTerminalsList.length ? "critical" : "success",
    },
    {
      l: "Cash variance",
      v: worstVarianceShift?.variance ? formatSAR(worstVarianceShift.variance) : "SAR 0",
      tone: worstVarianceShift?.variance ? "critical" : "success",
    },
  ];
  const cashierQuickActions = [
    { label: "Start Sale", onClick: () => navigate({ to: "/operate/pos-checkout" }) },
    { label: "Stock Check", onClick: () => navigate({ to: "/stock/stocks" }) },
    {
      label: "Open Cashier Workspace",
      onClick: () => navigate({ to: "/operate/cashier-workspace" }),
    },
    { label: "Cashier Shifts", onClick: () => navigate({ to: "/operate/cashier-shift" }) },
  ];

  const categoryAggReal = useMemo(() => {
    const map = new Map<string, { sales: number; units: number; uom: string }>();
    const catHealth = new Map<string, string>();
    const rank: Record<string, number> = { Healthy: 0, Low: 1, Critical: 2 };
    for (const o of revenueOrders) {
      for (const l of o.lines) {
        const p = productMap.get(l.productId);
        const cat = p?.categoryName ?? "Uncategorized";
        const cur = map.get(cat) ?? { sales: 0, units: 0, uom: p?.stockUom ?? "Units" };
        cur.sales += l.lineTotal;
        cur.units += l.qty;
        map.set(cat, cur);
      }
    }
    for (const s of stockLevelsList) {
      const p = productMap.get(s.productId);
      const cat = p?.categoryName ?? "Uncategorized";
      const cur = catHealth.get(cat);
      if (!cur || rank[s.status] > rank[cur]) catHealth.set(cat, s.status);
    }
    return [...map.entries()]
      .map(([name, v]) => ({
        name,
        sales: v.sales,
        units: `${v.units} ${v.uom}`,
        ret: "—",
        health: (catHealth.get(name) === "Critical"
          ? "Critical"
          : catHealth.get(name) === "Low"
            ? "Low"
            : "Healthy") as "Healthy" | "Low" | "Critical",
        icon: categoryIconFor(name),
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [revenueOrders, productMap, stockLevelsList]);

  const topProductByCategoryReal = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const o of revenueOrders) {
      for (const l of o.lines) {
        const p = productMap.get(l.productId);
        const cat = p?.categoryName ?? "Uncategorized";
        const cur = map.get(cat);
        if (!cur || l.lineTotal > cur.total)
          map.set(cat, { name: l.productName, total: l.lineTotal });
      }
    }
    return Object.fromEntries([...map.entries()].map(([k, v]) => [k, v.name]));
  }, [revenueOrders, productMap]);

  const contractorOrdersList = revenueOrders.filter((o) => o.type === "Contractor");
  const contractorSalesTotal = contractorOrdersList.reduce((s, o) => s + o.grandTotal, 0);
  const contractorPct = grandTotalSum
    ? Math.round((contractorSalesTotal / grandTotalSum) * 100)
    : 0;
  const returnsTotal = returnsList.reduce((s, r) => s + r.totalAmount, 0);

  const salesPerfKpisReal = [
    {
      key: "gross",
      title: "Gross Sales",
      value: formatSAR(grossSales),
      sub: "Ex-VAT, before discounts",
      tone: "success" as Severity,
      icon: "trending",
    },
    {
      key: "net",
      title: "Net Takings",
      value: formatSAR(grandTotalSum),
      sub: "Incl. VAT & fees",
      tone: "info" as Severity,
      icon: "receipt",
    },
    {
      key: "discounts",
      title: "Discounts",
      value: formatSAR(discountsTotal),
      sub: grossSales ? `${((discountsTotal / grossSales) * 100).toFixed(1)}% of gross` : "—",
      tone: "info" as Severity,
      icon: "chart",
    },
    {
      key: "returns",
      title: "Refunds Paid",
      value: formatSAR(returnsTotal),
      sub: `${returnsList.length} return tickets`,
      tone: (returnsTotal > 0 ? "warning" : "success") as Severity,
      icon: "history",
    },
    {
      key: "basket",
      title: "Average Basket",
      value: formatSAR(avgBasket),
      sub: "Retail + contractor",
      tone: "info" as Severity,
      icon: "cart",
    },
    {
      key: "contractor",
      title: "Contractor Sales",
      value: formatSAR(contractorSalesTotal),
      sub: `${contractorPct}% of net takings`,
      tone: "success" as Severity,
      icon: "users",
    },
  ];

  const recentOrdersReal = useMemo(
    () =>
      [...orderList]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map((o) => ({
          id: o.orderNo,
          customer: o.customerName,
          type: o.type,
          value: formatSAR(o.grandTotal),
          status: o.status,
          payment: o.payments.map((p) => p.method).join(" + ") || "—",
          invoice: zatcaByOrderId.get(o.id)?.type ?? "Pending",
        })),
    [orderList, zatcaByOrderId],
  );

  const branchPerformanceReal = useMemo(() => {
    const ordersByBranch = new Map<number, typeof revenueOrders>();
    for (const o of revenueOrders)
      ordersByBranch.set(o.branchId, [...(ordersByBranch.get(o.branchId) ?? []), o]);
    const shiftsByTerminal = new Map(terminalsList.map((t) => [t.id, t.branchId]));
    const warehouseBranchMap = new Map((warehouses ?? []).map((w) => [w.id, w.branchId]));
    return (branches ?? []).map((b) => {
      const bOrders = ordersByBranch.get(b.id) ?? [];
      const sales = bOrders.reduce((s, o) => s + o.grandTotal, 0);
      const tx = bOrders.length;
      const basket = tx ? Math.round(sales / tx) : 0;
      const low = stockLevelsList.filter(
        (s) =>
          warehouseBranchMap.get(s.warehouseId) === b.id &&
          (s.status === "Low" || s.status === "Critical"),
      ).length;
      const branchOpenShifts = (cashierShifts ?? []).filter(
        (s) => shiftsByTerminal.get(s.terminalId) === b.id && s.status === "Open",
      ).length;
      return {
        branch: b.nameEn,
        sales: formatSAR(sales),
        tx,
        returns: "—",
        basket: formatSAR(basket),
        low,
        shifts: branchOpenShifts,
      };
    });
  }, [branches, revenueOrders, terminalsList, cashierShifts, stockLevelsList, warehouses]);

  const inventoryKpisReal = [
    {
      key: "avail",
      title: "Available Stock",
      value: availableUnits.toLocaleString(),
      sub: "units on hand",
      tone: "success" as Severity,
      icon: "package",
    },
    {
      key: "res",
      title: "Reserved Stock",
      value: reservedUnits.toLocaleString(),
      sub: "units held",
      tone: "info" as Severity,
      icon: "layers",
    },
    {
      key: "low",
      title: "Low Stock",
      value: String(lowStockCount),
      sub: "SKUs below reorder",
      tone: (lowStockCount ? "warning" : "success") as Severity,
      icon: "alert",
    },
    {
      key: "oos",
      title: "Out of Stock",
      value: String(criticalStockCount),
      sub: "SKUs unavailable",
      tone: (criticalStockCount ? "critical" : "success") as Severity,
      icon: "alert",
    },
    {
      key: "quar",
      title: "Quarantine",
      value: quarantineQty.toLocaleString(),
      sub: "units on hold",
      tone: (quarantineQty ? "warning" : "success") as Severity,
      icon: "shield",
    },
    {
      key: "trf",
      title: "Pending Transfers",
      value: String(pendingTransfers.length),
      sub: "between warehouses",
      tone: "info" as Severity,
      icon: "truck",
    },
  ];

  const inventoryRowsReal = useMemo(
    () =>
      stockLevelsList
        .filter((s) => s.status !== "Healthy")
        .filter(
          (s) =>
            !selectedSuppliers ||
            selectedSuppliers.has(productMap.get(s.productId)?.supplierName ?? ""),
        )
        .map((s) => ({
          sku: s.sku,
          name: s.productName,
          cat: s.categoryName,
          branch: s.warehouseName,
          qty: `${s.available} units`,
          reorder: `${s.reorderLevel} units`,
          supplier: productMap.get(s.productId)?.supplierName ?? "—",
          status: s.status as Severity,
        })),
    [stockLevelsList, productMap, selectedSuppliers],
  );

  const inventorySummaryReal = [
    { label: "Available Stock", value: `${availableUnits.toLocaleString()} Items` },
    { label: "Reserved Stock", value: `${reservedUnits.toLocaleString()} Items` },
    { label: "Low Stock SKUs", value: `${lowStockCount} SKUs` },
    { label: "Out of Stock", value: `${criticalStockCount} SKUs` },
    { label: "Quarantine / Damaged", value: `${quarantineQty} Items` },
    { label: "Stock Value", value: formatSAR(stockValue) },
    { label: "Pending Transfers", value: `${pendingTransfers.length} Transfers` },
    { label: "Expiring ≤ 30 days", value: `${expiringBatches.length} Items` },
  ];

  const cashierKpisReal = [
    {
      key: "act",
      title: "Active Terminals",
      value: String(terminalsList.length - offlineTerminalsList.length),
      sub: `of ${terminalsList.length} total`,
      tone: "success" as Severity,
      icon: "monitor",
    },
    {
      key: "off",
      title: "Offline Terminals",
      value: String(offlineTerminalsList.length),
      sub: offlineTerminalsList.map((t) => t.code).join(", ") || "None",
      tone: (offlineTerminalsList.length ? "critical" : "success") as Severity,
      icon: "alert",
    },
    {
      key: "op",
      title: "Open Shifts",
      value: String(openShiftsList.length),
      sub: "in progress",
      tone: "info" as Severity,
      icon: "users",
    },
    {
      key: "park",
      title: "Parked Sales",
      value: String(parkedSalesAll.length),
      sub: "awaiting resume",
      tone: (parkedSalesAll.length ? "warning" : "success") as Severity,
      icon: "history",
    },
    {
      key: "apr",
      title: "Needs Review",
      value: String(shiftsNeedingReview.length),
      sub: "cash variance",
      tone: (shiftsNeedingReview.length ? "warning" : "success") as Severity,
      icon: "shield",
    },
    {
      key: "var",
      title: "Cash Variance",
      value: worstVarianceShift?.variance ? formatSAR(worstVarianceShift.variance) : "SAR 0",
      sub: worstVarianceShift ? `SH-${worstVarianceShift.id}` : "—",
      tone: (worstVarianceShift?.variance ? "critical" : "success") as Severity,
      icon: "receipt",
    },
  ];

  const terminalDetailReal = useMemo(
    () =>
      cashierShiftsList.map((s) => {
        const term = terminalsList.find((t) => t.id === s.terminalId);
        const ordersForShift = orderList.filter(
          (o) =>
            o.terminalId === s.terminalId &&
            new Date(o.createdAt) >= new Date(s.openedAt) &&
            (!s.closedAt || new Date(o.createdAt) <= new Date(s.closedAt)),
        );
        const printer = (devices ?? []).find(
          (d) => d.terminalId === s.terminalId && d.type === "ReceiptPrinter",
        );
        const card = (devices ?? []).find(
          (d) => d.terminalId === s.terminalId && d.type === "CardReader",
        );
        return {
          term: term?.code ?? s.terminalName,
          cashier: s.cashierName,
          shift: `SH-${s.id}`,
          started: new Date(s.openedAt).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          tx: ordersForShift.length,
          sales: formatSAR(s.cashSales),
          expected: formatSAR(s.expectedCash),
          sync: term?.lastSyncAt ? "Recently" : "—",
          printer: printer?.status ?? "—",
          card: card?.status ?? "—",
          status:
            s.status !== "Open"
              ? s.status
              : s.variance && Math.abs(s.variance) > 0
                ? "Review Required"
                : "Active",
        };
      }),
    [cashierShiftsList, terminalsList, orderList, devices],
  );

  const paymentBreakdownReal = useMemo(() => {
    const map = new Map<string, { amount: number; tx: number }>();
    for (const o of revenueOrders) {
      for (const p of o.payments) {
        const cur = map.get(p.method) ?? { amount: 0, tx: 0 };
        cur.amount += p.amount;
        cur.tx += 1;
        map.set(p.method, cur);
      }
    }
    return [...map.entries()]
      .map(([method, v]) => ({
        method,
        amount: formatSAR(v.amount),
        tx: v.tx,
        tone: PAYMENT_META[method]?.tone ?? "info",
        icon: PAYMENT_META[method]?.icon ?? "receipt",
      }))
      .sort((a, b) => b.tx - a.tx);
  }, [revenueOrders]);

  const returnBreakdownReal = useMemo(() => {
    const standard = returnsList.filter((r) => r.type === "Standard");
    const damaged = returnsList.filter((r) => r.type === "Damaged");
    const surplus = returnsList.filter((r) => r.type === "Surplus");
    const exchange = returnsList.filter((r) => r.type === "Exchange");
    const pending = returnsList.filter((r) => r.status === "PendingApproval");
    const quarantineReturns = returnsList.filter((r) => r.status === "Quarantine");
    return [
      {
        label: "Standard Returns",
        value: formatSAR(standard.reduce((s, r) => s + r.totalAmount, 0)),
      },
      { label: "Damaged Claims", value: `${damaged.length} items` },
      { label: "Surplus / Excess", value: `${surplus.length} items` },
      { label: "Exchanges", value: String(exchange.length) },
      { label: "Pending Approvals", value: String(pending.length) },
      { label: "Quarantine", value: `${quarantineReturns.length} items` },
    ];
  }, [returnsList]);

  const alertsReal = useMemo(
    () =>
      (notifications ?? []).map((n) => ({
        severity: (n.severity === "Critical"
          ? "critical"
          : n.severity === "Warning"
            ? "warning"
            : "info") as Severity,
        module: n.type,
        msg: n.message,
        age: timeAgo(n.asOf),
        action: "View",
        link: n.link,
      })),
    [notifications],
  );

  // BRD §10.1: cross-register reporting/analytics (X-Reports and above) is a Supervisor+ concern.
  // posCeilings.canViewXReport is exactly that ladder line (false for Cashier/Senior Cashier, true
  // from Supervisor up — see PosTier presets in DbSeeder.cs) — gating on it restricts those two
  // roles to Overview + Cashier & Terminal (their own shift) without hardcoding role names or
  // depending on a page-route permission, since no single page covers "all analytics".
  const canViewAnalyticsTabs = user?.posCeilings.canViewXReport ?? false;
  const tabs: {
    value: string;
    label: string;
    icon: typeof LayoutDashboard;
    requiresAnalytics?: boolean;
  }[] = [
    { value: "overview", label: "Overview", icon: LayoutDashboard },
    { value: "sales", label: "Sales Performance", icon: TrendingUp, requiresAnalytics: true },
    { value: "inventory", label: "Inventory Health", icon: Boxes, requiresAnalytics: true },
    { value: "delivery", label: "Delivery & Dispatch", icon: Truck, requiresAnalytics: true },
    { value: "cashier", label: "Cashier & Terminal", icon: UserSquare2 },
    { value: "payments", label: "Payments & Returns", icon: Wallet, requiresAnalytics: true },
    { value: "compliance", label: "Compliance & Alerts", icon: Shield, requiresAnalytics: true },
  ];
  const visibleTabs = tabs.filter((t) => !t.requiresAnalytics || canViewAnalyticsTabs);

  // Every KPI row on the dashboard is user-arrangeable: which cards appear, and in what order.
  // Nobody watches all six equally — a yard supervisor cares about deliveries and stock, a branch
  // manager about takings — and the choice is remembered per tab.
  const overviewCards = useKpiCards("dashboard.overview", overviewKpisReal);
  const salesCards = useKpiCards("dashboard.sales", salesPerfKpisReal);
  const inventoryCards = useKpiCards("dashboard.inventory", inventoryKpisReal);
  const cashierCards = useKpiCards("dashboard.cashier", cashierKpisReal);

  // Export exports what you are looking at. FilterBar's Export button is generic — it needs the
  // caller to hand it rows — and the dashboard never did, so it always reported "Nothing to
  // export" no matter what was on screen. Each tab exports its own primary table, already narrowed
  // by the filter bar above it.
  const exportData = useMemo(() => {
    switch (activeTab) {
      case "overview":
        return {
          filename: "dashboard-overview.csv",
          columns: ["KPI", "Value", "Detail"],
          rows: overviewKpisReal.map((k) => [k.title, k.value, k.sub] as (string | number)[]),
        };
      case "sales":
        return {
          filename: "dashboard-sales.csv",
          columns: ["Order", "Customer", "Type", "Value", "Status", "Payment", "Invoice"],
          rows: recentOrdersReal.map(
            (o) =>
              [o.id, o.customer, o.type, o.value, o.status, o.payment, o.invoice] as (
                string | number
              )[],
          ),
        };
      case "inventory":
        return {
          filename: "dashboard-inventory.csv",
          columns: [
            "SKU",
            "Product",
            "Category",
            "Warehouse",
            "Available",
            "Reorder",
            "Supplier",
            "Status",
          ],
          rows: inventoryRowsReal.map(
            (r) =>
              [r.sku, r.name, r.cat, r.branch, r.qty, r.reorder, r.supplier, r.status] as (
                string | number
              )[],
          ),
        };
      case "delivery":
        return {
          filename: "dashboard-delivery.csv",
          columns: [
            "Delivery",
            "Order",
            "Customer",
            "Materials",
            "Qty",
            "Weight",
            "Area",
            "Promised",
            "Driver",
            "Vehicle",
            "Status",
            "Amount",
            "Priority",
          ],
          rows: deliveryDetailReal.map(
            (d) =>
              [
                d.no,
                d.order,
                d.customer,
                d.materials,
                d.qty,
                d.weight,
                d.area,
                d.promised,
                d.driver,
                d.vehicle,
                d.status,
                d.amount,
                d.priority,
              ] as (string | number)[],
          ),
        };
      case "cashier":
        return {
          filename: "dashboard-cashier.csv",
          columns: [
            "Terminal",
            "Cashier",
            "Shift",
            "Started",
            "Transactions",
            "Cash Sales",
            "Expected",
            "Sync",
            "Printer",
            "Card Reader",
            "Status",
          ],
          rows: terminalDetailReal.map(
            (t) =>
              [
                t.term,
                t.cashier,
                t.shift,
                t.started,
                t.tx,
                t.sales,
                t.expected,
                t.sync,
                t.printer,
                t.card,
                t.status,
              ] as (string | number)[],
          ),
        };
      case "payments":
        return {
          filename: "dashboard-payments.csv",
          columns: ["Method / Return type", "Amount", "Transactions"],
          rows: [
            ...paymentBreakdownReal.map((p) => [p.method, p.amount, p.tx] as (string | number)[]),
            ...returnBreakdownReal.map((r) => [r.label, r.value, ""] as (string | number)[]),
          ],
        };
      case "compliance":
        return {
          filename: "dashboard-alerts.csv",
          columns: ["Severity", "Module", "Message", "Age"],
          rows: alertsReal.map((a) => [a.severity, a.module, a.msg, a.age] as (string | number)[]),
        };
      default:
        return null;
    }
  }, [
    activeTab,
    overviewKpisReal,
    recentOrdersReal,
    inventoryRowsReal,
    deliveryDetailReal,
    terminalDetailReal,
    paymentBreakdownReal,
    returnBreakdownReal,
    alertsReal,
  ]);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.value === activeTab))
      setActiveTab(visibleTabs[0]?.value ?? "overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, visibleTabs.map((t) => t.value).join(",")]);

  return (
    <div className="space-y-5">

      {/* Global filter bar — scrolls away with the page. Pinned under the header it held a large
          band of the viewport open on every tab, and it isn't something you adjust while reading rows. */}
      <div className="bp-fade">
        <FilterBar exportData={exportData} />
      </div>

      {/* The tab strip stays pinned — it's navigation — and now sits directly under the app header
          rather than below the filter bar that used to be stuck above it. */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="sticky top-16 z-[4] -mx-4 px-4 py-2 md:-mx-6 md:px-6 bg-canvas/85 backdrop-blur">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-black/5 bg-white p-1 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="gap-1.5 px-3 text-xs data-[state=active]:bg-brand data-[state=active]:text-brand-foreground data-[state=active]:shadow-sm"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* 1. Overview */}
        <TabsContent value="overview" className="bp-fade space-y-4">
          <CardRowHeader title="Today at a glance" cards={overviewCards} />
          <OverviewKpis items={overviewCards.visible} />
          {overviewCards.visible.length === 0 && ALL_CARDS_HIDDEN}
          <HourlySummary data={hourlyReal} tx={txCount} />
          <TopCategoriesCompact
            categories={categoryAggReal}
            topProductByCategory={topProductByCategoryReal}
            onViewAll={() => setActiveTab("sales")}
          />
          <DispatchPipelinePreview
            stages={dispatchPipelineReal}
            previewCards={deliveryDetailReal.slice(0, 3)}
            onViewAll={() => setActiveTab("delivery")}
          />
          <CashierWorkspaceSummary tiles={cashierTilesReal} quickActions={cashierQuickActions} />
        </TabsContent>

        {/* 2. Sales Performance */}
        <TabsContent value="sales" className="bp-fade space-y-4">
          <CardRowHeader title="Sales performance" cards={salesCards} />
          <SalesPerfKpis items={salesCards.visible} />
          {salesCards.visible.length === 0 && ALL_CARDS_HIDDEN}
          <SalesPerformance data={hourlyReal} />
          <TopCategoriesCompact
            categories={categoryAggReal}
            topProductByCategory={topProductByCategoryReal}
            onViewAll={() => navigate({ to: "/insights/sales" })}
          />
          <BranchPerformance rows={branchPerformanceReal} />
          <RecentOrdersTable
            orders={recentOrdersReal}
            onOpenAnalytics={() => navigate({ to: "/insights/bi" })}
          />
        </TabsContent>

        {/* 3. Inventory Health */}
        <TabsContent value="inventory" className="bp-fade space-y-4">
          <CardRowHeader title="Inventory health" cards={inventoryCards} />
          <InventoryKpiGrid items={inventoryCards.visible} />
          {inventoryCards.visible.length === 0 && ALL_CARDS_HIDDEN}
          <InventoryHealth rows={inventoryRowsReal} summary={inventorySummaryReal} />
        </TabsContent>

        {/* 4. Delivery & Dispatch */}
        <TabsContent value="delivery" className="bp-fade space-y-4">
          <DeliveryPipelineBoard cards={deliveryDetailReal} />
        </TabsContent>

        {/* 5. Cashier & Terminal */}
        <TabsContent value="cashier" className="bp-fade space-y-4">
          <CardRowHeader title="Cashier &amp; terminal" cards={cashierCards} />
          <CashierKpiGrid items={cashierCards.visible} />
          {cashierCards.visible.length === 0 && ALL_CARDS_HIDDEN}
          <TerminalDetailTable rows={terminalDetailReal} />
        </TabsContent>

        {/* 6. Payments & Returns */}
        <TabsContent value="payments" className="bp-fade space-y-4">
          <PaymentBreakdownTiles items={paymentBreakdownReal} />
          <ReturnBreakdownTiles items={returnBreakdownReal} />
        </TabsContent>

        {/* 7. Compliance & Alerts */}
        <TabsContent value="compliance" className="bp-fade space-y-4">
          <AlertsByGroup
            alerts={alertsReal}
            onAction={(a) =>
              a.link ? navigate({ to: a.link }) : toast.info(a.action, { description: a.msg })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
