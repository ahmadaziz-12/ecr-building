import {
  AlertTriangle, BadgePercent, Banknote, Boxes, CalendarClock, ClipboardCheck, Clock, FileBarChart2,
  Gauge, HeartPulse, Layers, PackageSearch, Receipt, RotateCcw, Scale, ShieldCheck, ShoppingCart,
  TrendingUp, Truck, Undo2, UserCheck, UserCog, Users, Wallet,
} from "lucide-react";
import type { ReportFilterSpec, ReportKnobSpec } from "./ReportFilterBar";
import type { ReportColumn, ReportDetail } from "./ReportTable";
import type { ReportFilterOptionsDto } from "@/lib/api/reports";

// The report catalogue. Everything about a report that isn't its data — where it lives in the
// picker, which filters it offers, which columns it shows, and what a row drills into — is
// declared here, so adding a report is one entry plus one backend endpoint rather than another
// hand-built table in the console.

export type ReportKey =
  | "sales-summary" | "top-products" | "discount-utilization" | "cashier-performance"
  | "profit-margin" | "category-performance" | "payment-methods"
  | "returns-analysis" | "refund-methods" | "restocking-fees" | "customer-returns" | "damaged-items"
  | "item-report" | "inventory-report" | "low-stock" | "stock-count-variance" | "slow-moving" | "expiry-report"
  | "purchase-orders" | "supplier-returns" | "supplier-performance"
  | "vat" | "contractor-aging" | "employee-report" | "employee-audit";

export type ReportGroup = "Sales" | "Returns & Quality" | "Inventory" | "Procurement" | "Tax & B2B" | "People & Audit";

export const REPORT_GROUPS: ReportGroup[] = [
  "Sales", "Inventory", "Procurement", "Returns & Quality", "Tax & B2B", "People & Audit",
];

export type ReportDef = {
  key: ReportKey;
  label: string;
  desc: string;
  group: ReportGroup;
  icon: typeof FileBarChart2;
  /** Whether the report accepts a from/to window at all. */
  dated: boolean;
  filters: ReportFilterSpec[];
  knobs?: ReportKnobSpec[];
  defaultKnobs?: Record<string, string | number | boolean>;
  /** Absent for the four aggregate reports that render bespoke KPI/summary blocks. */
  columns?: ReportColumn<never>[];
  detail?: ReportDetail<never>;
  tableTitle?: string;
  emptyLabel?: string;
};

// ————— Reusable filter specs —————

const opt = (values: string[]) => values.map((v) => ({ id: v, label: v, sub: null }));

const F = {
  branch: { key: "branchId", label: "Branch", allLabel: "Branches", options: (o: ReportFilterOptionsDto) => o.branches },
  warehouse: { key: "warehouseId", label: "Warehouse", allLabel: "Warehouses", options: (o: ReportFilterOptionsDto) => o.warehouses },
  category: { key: "categoryId", label: "Category", allLabel: "Categories", options: (o: ReportFilterOptionsDto) => o.categories },
  item: { key: "productId", label: "Item", allLabel: "Items", options: (o: ReportFilterOptionsDto) => o.products },
  supplier: { key: "supplierId", label: "Supplier", allLabel: "Suppliers", options: (o: ReportFilterOptionsDto) => o.suppliers },
  customer: { key: "customerId", label: "Customer", allLabel: "Customers", options: (o: ReportFilterOptionsDto) => o.customers },
  user: { key: "userId", label: "User", allLabel: "Users", options: (o: ReportFilterOptionsDto) => o.users },
  employee: { key: "employeeId", label: "Employee", allLabel: "Employees", options: (o: ReportFilterOptionsDto) => o.employees },
  role: { key: "roleId", label: "Role", allLabel: "Roles", options: (o: ReportFilterOptionsDto) => o.roles },
  userStatus: { key: "status", label: "Account", allLabel: "Account Statuses", options: () => opt(["Active", "Suspended", "Inactive"]) },
  orderType: { key: "orderType", label: "Order Type", allLabel: "Order Types", options: () => opt(["Retail", "Contractor", "Quotation", "Delivery"]) },
  brand: { key: "brand", label: "Brand", allLabel: "Brands", options: (o: ReportFilterOptionsDto) => opt(o.brands) },
  supplierType: { key: "supplierType", label: "Supplier Type", allLabel: "Supplier Types", options: (o: ReportFilterOptionsDto) => opt(o.supplierTypes) },
  stockStatus: { key: "stockStatus", label: "Stock Status", allLabel: "Stock Status", options: (o: ReportFilterOptionsDto) => opt(o.stockStatuses) },
  entityStatus: { key: "status", label: "Status", allLabel: "Statuses", options: () => opt(["Active", "Inactive"]) },
  locationType: { key: "locationType", label: "Location", allLabel: "Locations", options: () => opt(["Warehouse", "Branch"]) },
  severity: { key: "severity", label: "Severity", allLabel: "Severities", options: () => opt(["Low", "Critical"]) },
  poStatus: { key: "status", label: "PO Status", allLabel: "Statuses", options: (o: ReportFilterOptionsDto) => opt(o.purchaseOrderStatuses) },
  rtsStatus: { key: "status", label: "RTS Status", allLabel: "Statuses", options: (o: ReportFilterOptionsDto) => opt(o.rtsStatuses) },
  returnType: { key: "type", label: "Return Type", allLabel: "Types", options: (o: ReportFilterOptionsDto) => opt(o.returnTypes) },
  returnStatus: { key: "status", label: "Status", allLabel: "Statuses", options: (o: ReportFilterOptionsDto) => opt(o.returnStatuses) },
  refundMethod: { key: "refundMethod", label: "Refund Method", allLabel: "Methods", options: (o: ReportFilterOptionsDto) => opt(o.refundMethods) },
  damageReason: { key: "damageReason", label: "Damage Reason", allLabel: "Reasons", options: (o: ReportFilterOptionsDto) => opt(o.damageReasons) },
  countStatus: { key: "status", label: "Count Status", allLabel: "Statuses", options: (o: ReportFilterOptionsDto) => opt(o.stockCountStatuses) },
  countScope: { key: "scope", label: "Scope", allLabel: "Scopes", options: () => opt(["FullWarehouse", "Category", "LowStock", "HighValue", "FastMoving"]) },
  paymentMethod: { key: "method", label: "Method", allLabel: "Methods", options: (o: ReportFilterOptionsDto) => opt(o.paymentMethods) },
  auditModule: { key: "module", label: "Module", allLabel: "Modules", options: (o: ReportFilterOptionsDto) => opt(o.auditModules) },
  auditEvent: { key: "event", label: "Event", allLabel: "Events", options: (o: ReportFilterOptionsDto) => opt(o.auditEvents) },
  auditSeverity: { key: "severity", label: "Severity", allLabel: "Severities", options: () => opt(["Info", "Warning", "Critical"]) },
  expiryStatus: { key: "status", label: "Status", allLabel: "Statuses", options: () => opt(["Healthy", "Monitor", "Expiring", "Critical", "Expired", "Quarantine", "WrittenOff"]) },
  customerType: { key: "customerType", label: "Account Type", allLabel: "Types", options: () => opt(["Contractor", "B2B"]) },
} satisfies Record<string, ReportFilterSpec>;

// ————— Column helpers —————

const c = <T,>(key: string, label: string, format?: ReportColumn<T>["format"]): ReportColumn<T> => ({ key, label, format });

export const REPORTS: ReportDef[] = [
  // ————————————— Sales —————————————
  {
    key: "sales-summary",
    label: "Sales Summary",
    desc: "Takings and margin for the period, cut by payment method, cashier, branch, day and category.",
    group: "Sales",
    icon: TrendingUp,
    dated: true,
    // Order-level attributes only — see the endpoint comment: a product filter on a whole-order
    // summary would leave Gross Sales counting entire baskets and stop it reconciling.
    filters: [F.branch, F.user, F.customer, F.orderType, F.paymentMethod],
  },
  {
    key: "top-products",
    label: "Top Products",
    desc: "Best sellers by revenue, with margin, discounting, return rate and stock cover behind each.",
    group: "Sales",
    icon: FileBarChart2,
    dated: true,
    filters: [F.branch, F.category, F.item, F.supplier, F.brand],
    knobs: [{ key: "take", label: "Top", kind: "number", min: 1, max: 200 }],
    defaultKnobs: { take: 20 },
    tableTitle: "Top Products by Revenue",
    columns: [
      c("sku", "SKU", "mono"), c("name", "Product"), c("category", "Category"), c("brand", "Brand"),
      c("supplier", "Supplier"), c("uom", "UOM"),
      c("orders", "Orders", "int"), c("units", "Units", "qty"),
      c("grossRevenue", "Gross", "money"), c("discounts", "Discounts", "money"),
      c("revenue", "Revenue", "money"), c("sharePct", "Share", "pct"),
      c("cogs", "COGS", "money"), c("grossProfit", "Gross Profit", "money"), c("marginPct", "Margin", "pct"),
      c("avgSellingPrice", "Avg Price", "money"),
      c("returnedUnits", "Returned", "qty"), c("returnRatePct", "Return Rate", "pct"),
      c("onHand", "On Hand", "qty"), c("lastSoldAt", "Last Sold", "date"),
    ],
    emptyLabel: "No sales in the selected period for these filters.",
  },
  {
    key: "profit-margin",
    label: "Profit & Margin",
    desc: "Revenue against cost of goods, by product, category or branch.",
    group: "Sales",
    icon: Gauge,
    dated: true,
    filters: [F.branch, F.category, F.item],
    knobs: [{
      key: "groupBy", label: "Group by", kind: "choice",
      choices: [{ value: "product", label: "Product" }, { value: "category", label: "Category" }, { value: "branch", label: "Branch" }],
    }],
    defaultKnobs: { groupBy: "product" },
    tableTitle: "Gross Margin",
    columns: [
      c("label", "Name"), c("sub", "SKU", "mono"), c("unitsSold", "Units", "qty"),
      c("revenue", "Revenue", "money"), c("cogs", "COGS", "money"), c("grossProfit", "Gross Profit", "money"),
      c("marginPct", "Margin", "pct"), c("discounts", "Discounts", "money"), c("returns", "Returns", "money"),
      c("netProfit", "Net Profit", "money"),
    ],
  },
  {
    key: "category-performance",
    label: "Category Performance",
    desc: "Margin, velocity and return rate for each category.",
    group: "Sales",
    icon: Layers,
    dated: true,
    filters: [F.branch, F.category],
    tableTitle: "Category Performance",
    columns: [
      c("category", "Category"), c("skuCount", "SKUs", "int"), c("unitsSold", "Units", "qty"),
      c("revenue", "Revenue", "money"), c("cogs", "COGS", "money"), c("grossProfit", "Gross Profit", "money"),
      c("marginPct", "Margin", "pct"), c("returnedUnits", "Returned", "qty"), c("returnRatePct", "Return Rate", "pct"),
      c("onHand", "On Hand", "qty"), c("stockValue", "Stock Value", "money"),
    ],
  },
  {
    key: "cashier-performance",
    label: "Cashier Performance",
    desc: "Throughput, basket size, discounting and voids per cashier.",
    group: "Sales",
    icon: Users,
    dated: true,
    filters: [F.branch, F.user],
    tableTitle: "Cashier Performance",
    columns: [
      c("cashier", "Cashier"), c("branch", "Branch"), c("orders", "Orders", "int"),
      c("gross", "Gross", "money"), c("discounts", "Discounts", "money"), c("vat", "VAT", "money"),
      c("net", "Net", "money"), c("avgBasket", "Avg Basket", "money"), c("itemsPerOrder", "Items/Order", "qty"),
      c("discountRatePct", "Discount Rate", "pct"), c("voidedOrders", "Voids", "int"),
      c("refunds", "Refunds", "int"), c("refundValue", "Refund Value", "money"),
    ],
  },
  {
    key: "payment-methods",
    label: "Payment Methods",
    desc: "How takings split across cash, card and wallet rails — net of refunds.",
    group: "Sales",
    icon: Wallet,
    dated: true,
    filters: [F.branch, F.paymentMethod],
    tableTitle: "Settlement by Method",
    columns: [
      c("method", "Method"), c("transactions", "Transactions", "int"), c("amount", "Amount", "money"),
      c("sharePct", "Share", "pct"), c("refunds", "Refunds", "int"), c("refundAmount", "Refunded", "money"),
      c("net", "Net", "money"),
    ],
  },
  {
    key: "discount-utilization",
    label: "Discount Utilization",
    desc: "How much margin is being given away, and on how many orders.",
    group: "Sales",
    icon: BadgePercent,
    dated: true,
    filters: [F.branch, F.user, F.orderType],
  },

  // ————————————— Inventory —————————————
  {
    key: "item-report",
    label: "Item Report",
    desc: "The SKU master joined to stock, sales, margin and returns.",
    group: "Inventory",
    icon: Boxes,
    dated: true,
    filters: [F.branch, F.warehouse, F.category, F.item, F.supplier, F.brand, F.stockStatus, F.entityStatus],
    tableTitle: "Item Master & Performance",
    columns: [
      c("sku", "SKU", "mono"), c("name", "Product"), c("category", "Category"), c("brand", "Brand"),
      c("supplier", "Supplier"), c("uom", "UOM"),
      c("costPrice", "Cost", "money"), c("sellingPrice", "Price", "money"), c("marginPct", "Margin", "pct"),
      c("warehouseOnHand", "WH On Hand", "qty"), c("branchOnHand", "Branch On Hand", "qty"),
      c("available", "Available", "qty"), c("reorderLevel", "Reorder", "int"),
      c("stockValue", "Stock Value", "money"),
      c("unitsSold", "Units Sold", "qty"), c("revenue", "Revenue", "money"), c("grossProfit", "Gross Profit", "money"),
      c("returnedUnits", "Returned", "qty"), c("returnRatePct", "Return Rate", "pct"),
      c("lastSoldAt", "Last Sold", "date"), c("stockStatus", "Stock", "status"),
      { key: "barcode", label: "Barcode", exportOnly: true },
      { key: "status", label: "Catalog Status", exportOnly: true },
      { key: "retailValue", label: "Retail Value", format: "money", exportOnly: true },
      { key: "cogs", label: "COGS", format: "money", exportOnly: true },
    ],
  },
  {
    key: "inventory-report",
    label: "Inventory Report",
    desc: "On-hand, reserved and valuation for every stocked location.",
    group: "Inventory",
    icon: PackageSearch,
    dated: false,
    filters: [F.branch, F.warehouse, F.category, F.item, F.locationType, F.stockStatus],
    knobs: [{ key: "includeZeroStock", label: "Include zero stock", kind: "toggle" }],
    defaultKnobs: { includeZeroStock: true },
    tableTitle: "Inventory Snapshot",
    columns: [
      c("sku", "SKU", "mono"), c("name", "Product"), c("category", "Category"),
      c("locationType", "Location Type"), c("location", "Location"), c("branch", "Branch"),
      c("onHand", "On Hand", "qty"), c("reserved", "Reserved", "qty"), c("available", "Available", "qty"),
      c("reorderLevel", "Reorder", "int"), c("costPrice", "Cost", "money"),
      c("stockValue", "Stock Value", "money"), c("retailValue", "Retail Value", "money"),
      c("lastMovementAt", "Last Movement", "date"), c("status", "Status", "status"),
    ],
  },
  {
    key: "low-stock",
    label: "Low Stock Report",
    desc: "Everything at or under its reorder level, with the replenishment already worked out.",
    group: "Inventory",
    icon: AlertTriangle,
    dated: false,
    filters: [F.item, F.warehouse, F.branch, F.category, F.supplier, F.locationType, F.severity],
    tableTitle: "Replenishment Required",
    columns: [
      c("sku", "SKU", "mono"), c("name", "Product"), c("category", "Category"),
      c("locationType", "Location Type"), c("location", "Location"), c("branch", "Branch"),
      c("onHand", "On Hand", "qty"), c("reserved", "Reserved", "qty"), c("available", "Available", "qty"),
      c("reorderLevel", "Reorder Level", "int"), c("shortfall", "Shortfall", "qty"),
      c("suggestedOrderQty", "Suggested Order", "qty"), c("restockValue", "Restock Cost", "money"),
      c("supplier", "Supplier"), c("leadTimeDays", "Lead Time", "days"), c("status", "Status", "status"),
    ],
    emptyLabel: "Nothing is below its reorder level for these filters.",
  },
  {
    key: "stock-count-variance",
    label: "Stock Count Report",
    desc: "Stocktake sessions, their accuracy, and the variance each one posted.",
    group: "Inventory",
    icon: ClipboardCheck,
    dated: true,
    filters: [F.warehouse, F.branch, F.item, F.category, F.countStatus, F.countScope],
    knobs: [{ key: "varianceOnly", label: "Variances only", kind: "toggle" }],
    tableTitle: "Stocktake Reconciliation",
    columns: [
      c("countNo", "Count #", "mono"), c("date", "Date", "date"), c("warehouse", "Warehouse"),
      c("branch", "Branch"), c("scope", "Scope"), c("category", "Category"),
      c("lines", "Lines", "int"), c("counted", "Counted", "int"), c("varianceLines", "Variances", "int"),
      c("accuracyPct", "Accuracy", "pct"), c("netVarianceQty", "Net Variance Qty", "qty"),
      c("netVarianceValue", "Net Variance Value", "money"), c("absVarianceValue", "Absolute Variance", "money"),
      c("countedBy", "Counted By"), c("approvedBy", "Approved By"), c("status", "Status", "status"),
    ],
    detail: {
      title: (r: never) => `Count ${(r as { countNo: string }).countNo}`,
      subtitle: (r: never) => {
        const row = r as { warehouse: string; branch: string; scope: string };
        return `${row.warehouse} · ${row.branch} · ${row.scope}`;
      },
      fields: (r: never) => {
        const row = r as { status: string; countedBy: string | null; approvedBy: string | null; accuracyPct: number; netVarianceValue: number; absVarianceValue: number };
        return [
          { label: "Status", value: row.status },
          { label: "Accuracy", value: `${row.accuracyPct.toFixed(1)}%` },
          { label: "Counted By", value: row.countedBy ?? "—" },
          { label: "Approved By", value: row.approvedBy ?? "—" },
          { label: "Net Variance", value: `${row.netVarianceValue.toFixed(2)} ر.س` },
          { label: "Absolute Variance", value: `${row.absVarianceValue.toFixed(2)} ر.س` },
        ];
      },
      itemsLabel: "Counted items",
      items: (r: never) => (r as { items: unknown[] }).items,
      columns: [
        c("sku", "SKU", "mono"), c("product", "Product"), c("category", "Category"),
        c("systemQty", "System", "qty"), c("countedQty", "Counted", "qty"), c("variance", "Variance", "qty"),
        c("varianceValue", "Value", "money"), c("lineStatus", "Result", "status"), c("note", "Note"),
      ],
    },
  },
  {
    key: "slow-moving",
    label: "Slow-Moving Stock",
    desc: "On-hand items with no sales in the chosen window, and the capital tied up in them.",
    group: "Inventory",
    icon: Clock,
    dated: false,
    filters: [F.branch, F.category, F.item, F.supplier, F.brand],
    knobs: [{
      key: "days", label: "No sales in", kind: "choice",
      choices: [{ value: "30", label: "30 days" }, { value: "60", label: "60 days" }, { value: "90", label: "90 days" }, { value: "180", label: "180 days" }],
    }],
    defaultKnobs: { days: "30" },
    tableTitle: "Slow-Moving SKUs",
    columns: [
      c("sku", "SKU", "mono"), c("name", "Product"), c("category", "Category"), c("brand", "Brand"),
      c("supplier", "Supplier"), c("uom", "UOM"),
      c("onHand", "On Hand", "qty"), c("costPrice", "Cost", "money"), c("stockValue", "Stock Value", "money"),
      c("sellingPrice", "Price", "money"), c("retailValue", "Retail Value", "money"),
      c("reorderLevel", "Reorder", "int"),
      c("unitsSoldInWindow", "Sold In Window", "qty"),
      c("lastSoldAt", "Last Sold", "date"), c("daysSinceLastSale", "Days Idle", "int"),
      c("status", "Status", "status"),
    ],
    emptyLabel: "Nothing slow-moving — every stocked SKU sold recently.",
  },
  {
    key: "expiry-report",
    label: "Expiry & Shelf Life",
    desc: "Batch-tracked stock by remaining shelf life and write-off exposure.",
    group: "Inventory",
    icon: CalendarClock,
    dated: false,
    filters: [F.warehouse, F.branch, F.category, F.item, F.expiryStatus],
    knobs: [{ key: "withinDays", label: "Expiring within (days)", kind: "number", min: 1, max: 720 }],
    tableTitle: "Batch Shelf Life",
    columns: [
      c("sku", "SKU", "mono"), c("product", "Product"), c("category", "Category"),
      c("batchNo", "Batch"), c("warehouse", "Warehouse"), c("branch", "Branch"),
      c("receivedDate", "Received", "date"), c("expiryDate", "Expires", "date"), c("daysLeft", "Days Left", "int"),
      c("qty", "Qty", "qty"), c("value", "Value", "money"), c("status", "Status", "status"),
    ],
  },

  // ————————————— Procurement —————————————
  {
    key: "purchase-orders",
    label: "Purchase Order Report",
    desc: "Every PO with ordered vs received quantities, value and lateness.",
    group: "Procurement",
    icon: ShoppingCart,
    dated: true,
    filters: [F.supplier, F.branch, F.warehouse, F.item, F.category, F.poStatus],
    tableTitle: "Purchase Orders",
    columns: [
      c("poNo", "PO #", "mono"), c("orderedAt", "Ordered", "date"), c("expectedDate", "Expected", "date"),
      c("supplier", "Supplier"), c("branches", "Branch"), c("itemCount", "Lines", "int"),
      c("qtyOrdered", "Qty Ordered", "qty"), c("qtyReceived", "Qty Received", "qty"), c("qtyPending", "Pending", "qty"),
      c("receivedPct", "Received", "pct"), c("subTotal", "Subtotal", "money"), c("shipping", "Shipping", "money"),
      c("total", "Total", "money"), c("daysLate", "Days Late", "int"), c("status", "Status", "status"),
      { key: "approvedBy", label: "Approved By", exportOnly: true },
      { key: "carrier", label: "Carrier", exportOnly: true },
      { key: "trackingRef", label: "Tracking", exportOnly: true },
    ],
    detail: {
      title: (r: never) => `PO ${(r as { poNo: string }).poNo}`,
      subtitle: (r: never) => {
        const row = r as { supplier: string; status: string };
        return `${row.supplier} · ${row.status}`;
      },
      fields: (r: never) => {
        const row = r as { orderedAt: string; expectedDate: string; total: number; currency: string; approvedBy: string | null; carrier: string | null; trackingRef: string | null; receivedPct: number };
        return [
          { label: "Ordered", value: new Date(row.orderedAt).toLocaleDateString("en-GB") },
          { label: "Expected", value: new Date(row.expectedDate).toLocaleDateString("en-GB") },
          { label: "Total", value: `${row.total.toFixed(2)} ${row.currency}` },
          { label: "Received", value: `${row.receivedPct.toFixed(1)}%` },
          { label: "Approved By", value: row.approvedBy ?? "—" },
          { label: "Carrier", value: [row.carrier, row.trackingRef].filter(Boolean).join(" · ") || "—" },
        ];
      },
      itemsLabel: "Ordered items",
      items: (r: never) => (r as { items: unknown[] }).items,
      columns: [
        c("sku", "SKU", "mono"), c("product", "Product"), c("category", "Category"), c("branch", "Branch"),
        c("warehouse", "Warehouse"), c("uom", "UOM"), c("qty", "Ordered", "qty"), c("receivedQty", "Received", "qty"),
        c("pendingQty", "Pending", "qty"), c("unitCost", "Unit Cost", "money"), c("lineTotal", "Line Total", "money"),
        c("batchNo", "Batch"), c("expiryDate", "Expiry", "date"),
      ],
    },
  },
  {
    key: "supplier-returns",
    label: "Supplier Returns Report",
    desc: "Goods sent back to suppliers, their reason, value and credit-note status.",
    group: "Procurement",
    icon: Undo2,
    dated: true,
    filters: [F.supplier, F.branch, F.warehouse, F.item, F.category, F.rtsStatus],
    tableTitle: "Returns to Supplier (RTS)",
    columns: [
      c("rtsNo", "RTS #", "mono"), c("date", "Date", "date"), c("supplier", "Supplier"),
      c("branch", "Branch"), c("warehouse", "Warehouse"), c("linkedPo", "Linked PO", "mono"),
      c("reason", "Reason"), c("itemCount", "Lines", "int"), c("qty", "Qty", "qty"), c("value", "Value", "money"),
      c("creditNoteRef", "Credit Note"), c("status", "Status", "status"),
      { key: "carrier", label: "Carrier", exportOnly: true },
    ],
    detail: {
      title: (r: never) => `RTS ${(r as { rtsNo: string }).rtsNo}`,
      subtitle: (r: never) => {
        const row = r as { supplier: string; status: string };
        return `${row.supplier} · ${row.status}`;
      },
      fields: (r: never) => {
        const row = r as { date: string; branch: string; warehouse: string; linkedPo: string | null; creditNoteRef: string | null; value: number; reason: string };
        return [
          { label: "Date", value: new Date(row.date).toLocaleDateString("en-GB") },
          { label: "Reason", value: row.reason },
          { label: "Branch", value: row.branch },
          { label: "Warehouse", value: row.warehouse },
          { label: "Linked PO", value: row.linkedPo ?? "—" },
          { label: "Credit Note", value: row.creditNoteRef ?? "Not yet received" },
        ];
      },
      itemsLabel: "Returned items",
      items: (r: never) => (r as { items: unknown[] }).items,
      columns: [
        c("sku", "SKU", "mono"), c("product", "Product"), c("category", "Category"),
        c("qty", "Qty", "qty"), c("unitCost", "Unit Cost", "money"), c("lineValue", "Line Value", "money"),
        c("batchNo", "Batch"),
      ],
    },
  },
  {
    key: "supplier-performance",
    label: "Supplier Performance",
    desc: "Fill rate, punctuality, lead time and return rate per supplier.",
    group: "Procurement",
    icon: Truck,
    dated: true,
    filters: [F.supplier, F.branch, F.supplierType],
    tableTitle: "Supplier Scorecard",
    columns: [
      c("supplier", "Supplier"), c("type", "Type"), c("terms", "Terms"),
      c("poCount", "POs", "int"), c("orderedValue", "Ordered", "money"), c("receivedValue", "Received", "money"),
      c("fillRatePct", "Fill Rate", "pct"), c("onTimePct", "On Time", "pct"),
      c("leadTimeDays", "Quoted Lead", "days"), c("avgLeadTimeDays", "Actual Lead", "days"),
      c("returnCount", "Returns", "int"), c("returnedValue", "Returned Value", "money"),
      c("returnRatePct", "Return Rate", "pct"),
    ],
  },

  // ————————————— Returns & Quality —————————————
  {
    key: "customer-returns",
    label: "Customer Returns Report",
    desc: "Every return ticket with its refund breakdown and the items involved.",
    group: "Returns & Quality",
    icon: RotateCcw,
    dated: true,
    filters: [F.branch, F.customer, F.item, F.category, F.returnType, F.returnStatus, F.refundMethod],
    tableTitle: "Customer Returns",
    columns: [
      c("returnNo", "Return #", "mono"), c("date", "Date", "datetime"), c("type", "Type"),
      c("orderNo", "Original Order", "mono"), c("customer", "Customer"), c("branch", "Branch"),
      c("reason", "Reason"), c("itemCount", "Lines", "int"), c("qty", "Qty", "qty"),
      c("grossRefund", "Gross Refund", "money"), c("vatReversal", "VAT Reversed", "money"),
      c("restockingFee", "Restocking Fee", "money"), c("netCashback", "Net Cashback", "money"),
      c("refundMethod", "Refund Method"), c("approvedBy", "Approved By"), c("status", "Status", "status"),
      { key: "dgrnNo", label: "DGRN #", exportOnly: true },
      { key: "damageReason", label: "Damage Reason", exportOnly: true },
    ],
    detail: {
      title: (r: never) => `Return ${(r as { returnNo: string }).returnNo}`,
      subtitle: (r: never) => {
        const row = r as { type: string; branch: string };
        return `${row.type} · ${row.branch}`;
      },
      fields: (r: never) => {
        const row = r as { date: string; orderNo: string | null; customer: string | null; reason: string; refundMethod: string; netCashback: number; approvedBy: string | null; dgrnNo: string | null };
        return [
          { label: "Date", value: new Date(row.date).toLocaleString("en-GB") },
          { label: "Original Order", value: row.orderNo ?? "—" },
          { label: "Customer", value: row.customer ?? "Walk-in" },
          { label: "Reason", value: row.reason },
          { label: "Refund Method", value: row.refundMethod },
          { label: "Net Cashback", value: `${row.netCashback.toFixed(2)} ر.س` },
          { label: "Approved By", value: row.approvedBy ?? "—" },
          { label: "DGRN", value: row.dgrnNo ?? "—" },
        ];
      },
      itemsLabel: "Returned items",
      items: (r: never) => (r as { items: unknown[] }).items,
      columns: [
        c("sku", "SKU", "mono"), c("product", "Product"), c("category", "Category"),
        c("qty", "Qty", "qty"), c("unitPricePaid", "Price Paid", "money"), c("vatRate", "VAT", "pct"),
        c("amount", "Amount", "money"),
      ],
    },
  },
  {
    key: "damaged-items",
    label: "Damaged Items Report",
    desc: "Line-level damage losses by reason code, with evidence references.",
    group: "Returns & Quality",
    icon: ShieldCheck,
    dated: true,
    filters: [F.branch, F.item, F.category, F.damageReason, F.returnStatus],
    tableTitle: "Damaged Goods",
    columns: [
      c("dgrnNo", "DGRN #", "mono"), c("returnNo", "Return #", "mono"), c("date", "Date", "datetime"),
      c("sku", "SKU", "mono"), c("product", "Product"), c("category", "Category"), c("branch", "Branch"),
      c("customer", "Customer"), c("qty", "Qty", "qty"), c("unitCost", "Unit Cost", "money"),
      c("lossValue", "Loss Value", "money"), c("damageReason", "Damage Reason"),
      c("approvedBy", "Approved By"), c("status", "Status", "status"),
      { key: "notes", label: "Notes", exportOnly: true },
      { key: "photoReference", label: "Photo Reference", exportOnly: true },
    ],
    emptyLabel: "No damaged returns in this period.",
  },
  {
    key: "returns-analysis",
    label: "Returns Analysis",
    desc: "Refunds, VAT reversals and restocking fees by return type.",
    group: "Returns & Quality",
    icon: Scale,
    dated: true,
    filters: [F.branch, F.customer, F.returnType, F.returnStatus],
    tableTitle: "Returns by Type",
    columns: [
      c("type", "Type"), c("count", "Tickets", "int"), c("grossRefund", "Gross Refund", "money"),
      c("vatReversed", "VAT Reversed", "money"), c("restockingFees", "Restocking Fees", "money"),
      c("netCashback", "Net Cashback", "money"),
    ],
    emptyLabel: "No returns in the selected period.",
  },
  {
    key: "refund-methods",
    label: "Refund Methods",
    desc: "How approved refunds were paid back out.",
    group: "Returns & Quality",
    icon: Banknote,
    dated: true,
    filters: [F.branch, F.customer, F.refundMethod, F.returnType],
    tableTitle: "Refunds by Method",
    columns: [c("method", "Method"), c("count", "Refunds", "int"), c("amount", "Amount", "money")],
    emptyLabel: "No approved refunds in the selected period.",
  },
  {
    key: "restocking-fees",
    label: "Restocking Fees",
    desc: "Fees withheld on surplus returns, month by month.",
    group: "Returns & Quality",
    icon: Receipt,
    dated: true,
    filters: [F.branch],
    tableTitle: "Restocking Fees Collected",
    columns: [c("month", "Month"), c("returns", "Surplus Returns", "int"), c("feesCollected", "Fees Collected", "money")],
    emptyLabel: "No restocking fees in the selected period.",
  },

  // ————————————— Tax & B2B —————————————
  {
    key: "vat",
    label: "VAT Report",
    desc: "Output VAT by rate, reversals, and the net position.",
    group: "Tax & B2B",
    icon: Scale,
    dated: true,
    filters: [F.branch],
  },
  {
    key: "contractor-aging",
    label: "Contractor Aging",
    desc: "B2B credit exposure and how stale each account is.",
    group: "Tax & B2B",
    icon: HeartPulse,
    dated: false,
    filters: [F.customer, F.customerType],
    tableTitle: "B2B / Contractor Credit Exposure",
    columns: [
      c("customer", "Customer"), c("creditLimit", "Credit Limit", "money"),
      c("outstanding", "Outstanding", "money"),
      { key: "utilization", label: "Utilization", format: "pct", value: (r: never) => {
        const row = r as { creditLimit: number; outstanding: number };
        return row.creditLimit > 0 ? (row.outstanding / row.creditLimit) * 100 : 0;
      } },
      c("lastPurchaseAt", "Last Purchase", "date"), c("daysSinceLastPurchase", "Inactive", "days"),
    ],
    emptyLabel: "No B2B accounts carry an outstanding balance.",
  },

  // ————————————— People & Audit —————————————
  {
    key: "employee-report",
    label: "Employee Report",
    desc: "Per-staff register performance, voids, refunds approved, shift cash variance and audit footprint.",
    group: "People & Audit",
    icon: UserCheck,
    dated: true,
    filters: [F.user, F.branch, F.role, F.userStatus],
    tableTitle: "Staff Activity & Performance",
    columns: [
      c("name", "Employee"), c("role", "Role"), c("branch", "Branch"),
      c("orders", "Orders", "int"), c("grossSales", "Gross", "money"),
      c("discounts", "Discounts", "money"), c("discountRatePct", "Discount Rate", "pct"),
      c("vat", "VAT", "money"), c("netSales", "Net Sales", "money"),
      c("avgBasket", "Avg Basket", "money"), c("itemsPerOrder", "Items/Order", "qty"),
      c("voidedOrders", "Voids", "int"), c("voidedValue", "Voided Value", "money"),
      c("refundsApproved", "Refunds Approved", "int"), c("refundValue", "Refund Value", "money"),
      c("shifts", "Shifts", "int"), c("cashVariance", "Cash Variance", "money"),
      c("auditEvents", "Audit Events", "int"), c("criticalEvents", "Critical", "int"),
      c("lastActivityAt", "Last Activity", "datetime"), c("status", "Account", "status"),
      { key: "email", label: "Email", exportOnly: true },
      { key: "lastLoginAt", label: "Last Login", format: "datetime", exportOnly: true },
    ],
    detail: {
      title: (r: never) => (r as { name: string }).name,
      subtitle: (r: never) => {
        const row = r as { role: string; branch: string };
        return `${row.role} · ${row.branch}`;
      },
      fields: (r: never) => {
        const row = r as {
          email: string; status: string; lastLoginAt: string | null; orders: number;
          netSales: number; discountRatePct: number; voidedOrders: number; cashVariance: number;
        };
        return [
          { label: "Email", value: row.email },
          { label: "Account", value: row.status },
          { label: "Last Login", value: row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString("en-GB") : "Never" },
          { label: "Orders", value: String(row.orders) },
          { label: "Net Sales", value: `${row.netSales.toFixed(2)} ر.س` },
          { label: "Discount Rate", value: `${row.discountRatePct.toFixed(1)}%` },
          { label: "Voids", value: String(row.voidedOrders) },
          { label: "Cash Variance", value: `${row.cashVariance.toFixed(2)} ر.س` },
        ];
      },
      itemsLabel: "Activity trail",
      items: (r: never) => (r as { items: unknown[] }).items,
      columns: [
        c("date", "When", "datetime"), c("kind", "Type"), c("reference", "Reference", "mono"),
        c("detail", "Detail"), c("amount", "Amount", "money"), c("branch", "Branch"),
        c("severity", "Severity", "status"),
      ],
    },
    emptyLabel: "No staff accounts match these filters.",
  },
  {
    key: "employee-audit",
    label: "Employee Audit Report",
    desc: "Who changed what, where, and why — across every module.",
    group: "People & Audit",
    icon: UserCog,
    dated: true,
    filters: [F.user, F.employee, F.branch, F.auditModule, F.auditEvent, F.auditSeverity],
    knobs: [{ key: "take", label: "Max rows", kind: "number", min: 100, max: 10000 }],
    defaultKnobs: { take: 1000 },
    tableTitle: "Employee Audit Trail",
    columns: [
      c("date", "Date & Time", "datetime"), c("userName", "User"), c("employeeName", "Employee"),
      c("department", "Department"), c("designation", "Designation"), c("branch", "Branch"),
      c("module", "Module"), c("event", "Action"), c("recordId", "Record", "mono"),
      c("reason", "Reason"), c("device", "Device"), c("severity", "Severity", "status"),
      { key: "oldValue", label: "Old Value", exportOnly: true },
      { key: "newValue", label: "New Value", exportOnly: true },
    ],
    emptyLabel: "No audit events match these filters.",
  },
];

export const REPORT_BY_KEY = Object.fromEntries(REPORTS.map((r) => [r.key, r])) as Record<ReportKey, ReportDef>;
