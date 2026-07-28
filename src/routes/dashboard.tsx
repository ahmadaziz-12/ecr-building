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
  DashboardHeader,
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
import { useFilters } from "@/lib/buildpos/filter-context";
import { formatSAR, type Severity } from "@/lib/buildpos/format";
import { useAuth } from "@/lib/api/auth";
import { useOrders, useCashierShifts, useParkedSales, useCustomers } from "@/lib/api/pos";
import {
  useStockLevels,
  useStockBatches,
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

// Resolves the Date Range filter to a concrete [start, end) window. Returns null for the "All..."
// sentinel (no filtering). Custom Range reads the two ISO date strings the FilterBar's inline
// <input type="date"> fields write into filterValues.
function resolveDateRange(
  preset: string,
  customStart: string,
  customEnd: string,
): { start: Date; end: Date } | null {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  switch (preset) {
    case "Today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "Yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case "Last 7 Days": {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case "Last 30 Days": {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case "This Month":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
    case "Last Month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case "Custom Range":
      if (!customStart || !customEnd) return null;
      return { start: startOfDay(new Date(customStart)), end: endOfDay(new Date(customEnd)) };
    default:
      return null;
  }
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

function OverviewPage() {
  const { activeTab, setActiveTab, values: filterValues } = useFilters();
  const navigate = useNavigate();
  const { hasAccess } = useAuth();

  const { data: orders } = useOrders(hasAccess("Orders"));
  const { data: products } = useProducts(hasAccess("Inventory"));
  const { data: stockLevels } = useStockLevels(hasAccess("Inventory"));
  const { data: warehouses } = useWarehouses(hasAccess("Inventory"));
  const { data: stockBatches } = useStockBatches(hasAccess("Inventory"));
  const { data: stockTransfers } = useStockTransfers(hasAccess("Inventory"));
  const { data: deliveryOrders } = useDeliveryOrdersApi(hasAccess("Delivery"));
  const { data: cashierShifts } = useCashierShifts(hasAccess("Pos"));
  const { data: zatcaInvoices } = useZatcaInvoices(undefined, hasAccess("Finance"));
  const { data: returnsData } = useReturns(hasAccess("Finance"));
  const { data: branches } = useBranches(hasAccess("Network"));
  const { data: terminals } = useTerminals(hasAccess("Network"));
  const { data: devices } = useDevices(hasAccess("Network"));
  const { data: notifications } = useNotifications();
  const { data: customers } = useCustomers(hasAccess("Orders"));
  const { data: employees } = useEmployeesApi();
  // Only 2 branches exist in this deployment — ParkedSalesController requires a branchId per
  // call, so summing the two known branches is the only way to get a cross-branch total (a
  // third call per new branch would be needed if the network grows).
  const { data: parkedBranch1 } = useParkedSales(1, hasAccess("Pos"));
  const { data: parkedBranch2 } = useParkedSales(2, hasAccess("Pos"));

  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const customerMap = useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);
  const terminalsList = terminals ?? [];
  // Best-effort join only — Order/CashierShift carry cashierName (string), not an employee FK, so
  // this matches by full name and silently misses cashiers whose seeded name diverges from HR.
  const departmentByName = useMemo(
    () => new Map((employees ?? []).map((e) => [`${e.firstName} ${e.lastName}`, e.departmentName])),
    [employees],
  );

  // --- Filter predicates, one per FilterBar control, applied where each is semantically meaningful ---
  const selectedBranchId = (branches ?? []).find((b) => b.nameEn === filterValues.Branch)?.id;
  const selectedTerminalId = terminalsList.find((t) => t.code === filterValues.Terminal)?.id;
  const dateWindow = resolveDateRange(
    filterValues["Date Range"],
    filterValues["Custom Range Start"],
    filterValues["Custom Range End"],
  );
  const inDateWindow = (iso: string) => {
    if (!dateWindow) return true;
    const t = new Date(iso).getTime();
    return t >= dateWindow.start.getTime() && t <= dateWindow.end.getTime();
  };
  const cashierOk = (name: string) =>
    filterValues.Cashier === "All Cashiers" || name === filterValues.Cashier;
  const statusOk = (status: string) =>
    filterValues.Status === "All" || status === filterValues.Status;
  const customerTierOf = (customerId: number | null): string => {
    if (customerId === null) return "Walk-in";
    const c = customerMap.get(customerId);
    if (!c) return "Walk-in";
    if (c.loyaltyEnrolled) return "Loyalty Member";
    return c.type === "WalkIn" ? "Walk-in" : "Retail";
  };
  const customerTierOk = (customerId: number | null) =>
    filterValues.Customer === "All" || customerTierOf(customerId) === filterValues.Customer;
  const contractorOk = (customerId: number | null) => {
    if (filterValues["Contractor Account"] === "All") return true;
    const c = customerId === null ? undefined : customerMap.get(customerId);
    return c?.nameEn === filterValues["Contractor Account"];
  };
  const paymentMethodOk = (o: { payments: { method: string }[] }) =>
    filterValues["Payment Method"] === "All" ||
    o.payments.some((p) => p.method === filterValues["Payment Method"]);
  const departmentOk = (cashierName: string) =>
    filterValues["Employee Department"] === "All" ||
    departmentByName.get(cashierName) === filterValues["Employee Department"];
  const shiftStatusOk = (status: string) => {
    const sel = filterValues["Shift Status"];
    if (sel === "All") return true;
    return status === (sel === "Needs Review" ? "NeedsReview" : sel);
  };

  const orderList = useMemo(
    () =>
      (orders ?? []).filter(
        (o) =>
          (selectedBranchId === undefined || o.branchId === selectedBranchId) &&
          (selectedTerminalId === undefined || o.terminalId === selectedTerminalId) &&
          inDateWindow(o.createdAt) &&
          cashierOk(o.cashierName) &&
          statusOk(o.status) &&
          customerTierOk(o.customerId) &&
          contractorOk(o.customerId) &&
          paymentMethodOk(o) &&
          departmentOk(o.cashierName),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, selectedBranchId, selectedTerminalId, dateWindow, filterValues],
  );
  const completedOrders = useMemo(
    () => orderList.filter((o) => o.status === "Completed"),
    [orderList],
  );
  const stockLevelsList = useMemo(() => {
    const sel = filterValues["Stock Status"];
    return (stockLevels ?? []).filter((s) => {
      if (sel === "All") return true;
      if (sel === "Out of Stock") return s.available === 0;
      if (sel === "Quarantine") return false; // Quarantine is a stock-batch state, not a StockLevel status.
      return s.status === sel;
    });
  }, [stockLevels, filterValues]);
  const deliveryList = useMemo(() => {
    const sel = filterValues["Delivery Status"];
    return (deliveryOrders ?? []).filter(
      (d) => (sel === "All" || stageBucket(d.stage) === sel) && inDateWindow(d.promisedDate),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryOrders, filterValues, dateWindow]);
  const zatcaList = useMemo(() => {
    const sel = filterValues["Invoice Status"];
    return (zatcaInvoices ?? []).filter(
      (i) => (sel === "All" || i.status === sel) && inDateWindow(i.issueDate),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zatcaInvoices, filterValues, dateWindow]);
  const zatcaByOrderId = useMemo(() => new Map(zatcaList.map((i) => [i.orderId, i])), [zatcaList]);
  const returnsList = useMemo(() => {
    const sel = filterValues["Return Type"];
    return (returnsData ?? []).filter(
      (r) => (sel === "All" || r.type === sel) && inDateWindow(r.createdAt),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnsData, filterValues, dateWindow]);
  const cashierShiftsList = useMemo(
    () =>
      (cashierShifts ?? []).filter(
        (s) =>
          (selectedTerminalId === undefined || s.terminalId === selectedTerminalId) &&
          cashierOk(s.cashierName) &&
          shiftStatusOk(s.status) &&
          departmentOk(s.cashierName) &&
          inDateWindow(s.openedAt),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cashierShifts, selectedTerminalId, dateWindow, filterValues],
  );
  const parkedSalesAll = [...(parkedBranch1 ?? []), ...(parkedBranch2 ?? [])];

  const grossSales = completedOrders.reduce((s, o) => s + o.subTotal, 0);
  const discountsTotal = completedOrders.reduce((s, o) => s + o.discountTotal, 0);
  const netSales = grossSales - discountsTotal;
  const grandTotalSum = completedOrders.reduce((s, o) => s + o.grandTotal, 0);
  const txCount = completedOrders.length;
  const avgBasket = txCount ? Math.round(grandTotalSum / txCount) : 0;

  const lowStockCount = stockLevelsList.filter((s) => s.status === "Low").length;
  const criticalStockCount = stockLevelsList.filter((s) => s.status === "Critical").length;
  const availableUnits = stockLevelsList.reduce((s, x) => s + x.available, 0);
  const reservedUnits = stockLevelsList.reduce((s, x) => s + x.reserved, 0);
  const stockValue = stockLevelsList.reduce((s, x) => s + x.value, 0);
  const quarantineBatches = (stockBatches ?? []).filter((b) => b.status === "Quarantine");
  const quarantineQty = quarantineBatches.reduce((s, b) => s + b.qty, 0);
  const expiringBatches = (stockBatches ?? []).filter((b) => b.daysLeft >= 0 && b.daysLeft <= 30);
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

  const overviewKpisReal = [
    {
      key: "sales",
      title: "Total Material Sales",
      value: formatSAR(grandTotalSum),
      sub: `${txCount} transactions`,
      tone: "success" as Severity,
      icon: "trending",
    },
    {
      key: "net",
      title: "Net Sales",
      value: formatSAR(netSales),
      sub: "After discounts",
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
      sub: `${criticalStockCount} out of stock`,
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
    for (const o of completedOrders) {
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
  }, [completedOrders]);

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
    for (const o of completedOrders) {
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
  }, [completedOrders, productMap, stockLevelsList]);

  const topProductByCategoryReal = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const o of completedOrders) {
      for (const l of o.lines) {
        const p = productMap.get(l.productId);
        const cat = p?.categoryName ?? "Uncategorized";
        const cur = map.get(cat);
        if (!cur || l.lineTotal > cur.total)
          map.set(cat, { name: l.productName, total: l.lineTotal });
      }
    }
    return Object.fromEntries([...map.entries()].map(([k, v]) => [k, v.name]));
  }, [completedOrders, productMap]);

  const contractorOrdersList = completedOrders.filter((o) => o.type === "Contractor");
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
      sub: "All completed orders",
      tone: "success" as Severity,
      icon: "trending",
    },
    {
      key: "net",
      title: "Net Sales",
      value: formatSAR(netSales),
      sub: "After discounts",
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
      title: "Completed Returns",
      value: formatSAR(returnsTotal),
      sub: `${returnsList.length} items`,
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
      sub: `${contractorPct}% of gross`,
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
    const ordersByBranch = new Map<number, typeof completedOrders>();
    for (const o of completedOrders)
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
  }, [branches, completedOrders, terminalsList, cashierShifts, stockLevelsList, warehouses]);

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
            filterValues.Supplier === "All" ||
            productMap.get(s.productId)?.supplierName === filterValues.Supplier,
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
    [stockLevelsList, productMap, filterValues.Supplier],
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
    for (const o of completedOrders) {
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
  }, [completedOrders]);

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

  // BRD §10.1: cross-register reporting/analytics is a Supervisor+ concern. Cashier/Senior Cashier
  // are the only two seeded roles with Insights = None, so gating these 5 tabs behind it naturally
  // restricts them to Overview + Cashier & Terminal (their own shift) without hardcoding role names.
  const tabs: {
    value: string;
    label: string;
    icon: typeof LayoutDashboard;
    module?: "Insights";
  }[] = [
    { value: "overview", label: "Overview", icon: LayoutDashboard },
    { value: "sales", label: "Sales Performance", icon: TrendingUp, module: "Insights" },
    { value: "inventory", label: "Inventory Health", icon: Boxes, module: "Insights" },
    { value: "delivery", label: "Delivery & Dispatch", icon: Truck, module: "Insights" },
    { value: "cashier", label: "Cashier & Terminal", icon: UserSquare2 },
    { value: "payments", label: "Payments & Returns", icon: Wallet, module: "Insights" },
    { value: "compliance", label: "Compliance & Alerts", icon: Shield, module: "Insights" },
  ];
  const visibleTabs = tabs.filter((t) => !t.module || hasAccess(t.module));
  useEffect(() => {
    if (!visibleTabs.some((t) => t.value === activeTab))
      setActiveTab(visibleTabs[0]?.value ?? "overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, visibleTabs.map((t) => t.value).join(",")]);

  const csvExportForActiveTab = useMemo(() => {
    switch (activeTab) {
      case "overview":
        return {
          filename: "dashboard-overview.csv",
          columns: ["Metric", "Value", "Detail"],
          rows: overviewKpisReal.map((k) => [k.title, k.value, k.sub]),
        };
      case "sales":
        return {
          filename: "dashboard-sales-performance.csv",
          columns: ["Order", "Customer", "Type", "Value", "Status", "Payment", "Invoice"],
          rows: recentOrdersReal.map((o) => [
            o.id,
            o.customer,
            o.type,
            o.value,
            o.status,
            o.payment,
            o.invoice,
          ]),
        };
      case "inventory":
        return {
          filename: "dashboard-inventory-health.csv",
          columns: [
            "SKU",
            "Product",
            "Category",
            "Branch",
            "Qty",
            "Reorder Level",
            "Supplier",
            "Status",
          ],
          rows: inventoryRowsReal.map((r) => [
            r.sku,
            r.name,
            r.cat,
            r.branch,
            r.qty,
            r.reorder,
            r.supplier,
            r.status,
          ]),
        };
      case "delivery":
        return {
          filename: "dashboard-delivery-dispatch.csv",
          columns: [
            "Delivery No",
            "Order",
            "Customer",
            "Materials",
            "Qty",
            "Driver",
            "Vehicle",
            "Status",
            "Amount",
          ],
          rows: deliveryDetailReal.map((d) => [
            d.no,
            d.order,
            d.customer,
            d.materials,
            d.qty,
            d.driver,
            d.vehicle,
            d.status,
            d.amount,
          ]),
        };
      case "cashier":
        return {
          filename: "dashboard-cashier-terminal.csv",
          columns: ["Terminal", "Cashier", "Shift", "Started", "Tx", "Sales", "Expected", "Status"],
          rows: terminalDetailReal.map((t) => [
            t.term,
            t.cashier,
            t.shift,
            t.started,
            t.tx,
            t.sales,
            t.expected,
            t.status,
          ]),
        };
      case "payments":
        return {
          filename: "dashboard-payments-returns.csv",
          columns: ["Section", "Label", "Value", "Tx"],
          rows: [
            ...paymentBreakdownReal.map((p) => [
              "Payment Method",
              p.method,
              p.amount,
              String(p.tx),
            ]),
            ...returnBreakdownReal.map((r) => ["Returns", r.label, r.value, ""]),
          ],
        };
      case "compliance":
        return {
          filename: "dashboard-compliance-alerts.csv",
          columns: ["Severity", "Module", "Message", "Age"],
          rows: alertsReal.map((a) => [a.severity, a.module, a.msg, a.age]),
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

  return (
    <div className="space-y-5">
      <DashboardHeader subtitle="Monitor today's sales, transactions, stock risks, deliveries, and active shifts across your building-material branches." />

      {/* Global filter bar */}
      <div className="bp-fade sticky top-16 z-[5] -mx-4 px-4 py-2 md:-mx-6 md:px-6 bg-canvas/85 backdrop-blur">
        <FilterBar exportData={csvExportForActiveTab} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="sticky top-[7.5rem] z-[4] -mx-4 px-4 py-2 md:-mx-6 md:px-6 bg-canvas/85 backdrop-blur">
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
          <OverviewKpis items={overviewKpisReal} />
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
          <SalesPerfKpis items={salesPerfKpisReal} />
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
          <InventoryKpiGrid items={inventoryKpisReal} />
          <InventoryHealth rows={inventoryRowsReal} summary={inventorySummaryReal} />
        </TabsContent>

        {/* 4. Delivery & Dispatch */}
        <TabsContent value="delivery" className="bp-fade space-y-4">
          <DeliveryPipelineBoard cards={deliveryDetailReal} />
        </TabsContent>

        {/* 5. Cashier & Terminal */}
        <TabsContent value="cashier" className="bp-fade space-y-4">
          <CashierKpiGrid items={cashierKpisReal} />
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
