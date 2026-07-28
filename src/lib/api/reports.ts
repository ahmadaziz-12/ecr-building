import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./client";

// Module 12 (BRD §7): typed clients for the operational report endpoints served by the backend
// report controllers (api/insights/reports/*). Each report is its own view in the Insights →
// Reports console; all filtering is server-side.
//
// Two conventions match the backend (see ReportFilters in ReportsExtendedController.cs):
//  • Date range is sent as plain YYYY-MM-DD. The server turns `to` into an exclusive
//    to+1day bound, so the last day of the range is genuinely included. Never append a time
//    component here — that's what made "to = today" drop today's transactions.
//  • Multi-selects serialise as repeated params (?branchId=1&branchId=2). An omitted/empty array
//    means "no constraint", never "match nothing".

export type SalesByMethodRow = {
  method: string;
  amount: number;
  count: number;
  sharePct: number;
  refunded: number;
  net: number;
};
export type SalesByCashierRow = {
  cashier: string;
  branch: string;
  amount: number;
  orders: number;
  discounts: number;
  avgBasket: number;
  voids: number;
};
export type SalesByBranchRow = {
  branch: string;
  orders: number;
  gross: number;
  discounts: number;
  vat: number;
  net: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  avgBasket: number;
};
export type SalesByDayRow = {
  date: string;
  orders: number;
  gross: number;
  discounts: number;
  net: number;
  grossProfit: number;
};
export type SalesByCategoryRow = {
  category: string;
  units: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  sharePct: number;
};
export type SalesSummaryDto = {
  grossSales: number;
  discounts: number;
  vat: number;
  fees: number;
  netSales: number;
  orderCount: number;
  itemsSold: number;
  avgBasket: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  returnCount: number;
  refundValue: number;
  netAfterReturns: number;
  uniqueCustomers: number;
  voidedOrders: number;
  byMethod: SalesByMethodRow[];
  byCashier: SalesByCashierRow[];
  byBranch: SalesByBranchRow[];
  byDay: SalesByDayRow[];
  byCategory: SalesByCategoryRow[];
};
export type ReturnsAnalysisRow = {
  type: string;
  count: number;
  grossRefund: number;
  vatReversed: number;
  restockingFees: number;
  netCashback: number;
};
export type RefundMethodRow = { method: string; count: number; amount: number };
export type VatByRateRow = { rate: number; taxableAmount: number; vatCollected: number };
export type VatReportDto = {
  collected: VatByRateRow[];
  totalCollected: number;
  totalReversed: number;
  netVat: number;
};
export type TopProductRow = {
  productId: number;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  supplier: string | null;
  uom: string;
  orders: number;
  units: number;
  grossRevenue: number;
  discounts: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  avgSellingPrice: number;
  sharePct: number;
  returnedUnits: number;
  returnRatePct: number;
  onHand: number;
  lastSoldAt: string | null;
};
export type SlowMovingRow = {
  sku: string;
  name: string;
  onHand: number;
  lastSoldAt: string | null;
};
export type ContractorAgingRow = {
  customer: string;
  creditLimit: number;
  outstanding: number;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number;
};
export type RestockingFeeRow = { month: string; returns: number; feesCollected: number };
export type DiscountUtilizationDto = {
  totalDiscounts: number;
  discountedOrders: number;
  totalOrders: number;
  discountRatePct: number;
};

export type ItemReportRow = {
  productId: number;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  brand: string | null;
  supplier: string | null;
  uom: string;
  costPrice: number;
  sellingPrice: number;
  vatRate: number;
  marginPct: number;
  warehouseOnHand: number;
  branchOnHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  stockValue: number;
  retailValue: number;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  returnedUnits: number;
  returnRatePct: number;
  lastSoldAt: string | null;
  stockStatus: string;
  status: string;
};
export type InventoryReportRow = {
  productId: number;
  sku: string;
  name: string;
  category: string;
  locationType: string;
  locationId: number;
  location: string;
  branch: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  costPrice: number;
  stockValue: number;
  retailValue: number;
  lastMovementAt: string | null;
  status: string;
};
export type LowStockRow = {
  productId: number;
  sku: string;
  name: string;
  category: string;
  locationType: string;
  locationId: number;
  location: string;
  branch: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  reorderQty: number;
  shortfall: number;
  suggestedOrderQty: number;
  supplier: string | null;
  leadTimeDays: number;
  costPrice: number;
  restockValue: number;
  status: string;
};
export type StockCountVarianceLine = {
  sku: string;
  product: string;
  category: string;
  systemQty: number;
  countedQty: number | null;
  variance: number;
  unitCost: number;
  varianceValue: number;
  lineStatus: string;
  note: string | null;
};
export type StockCountVarianceRow = {
  id: number;
  countNo: string;
  date: string;
  warehouse: string;
  branch: string;
  scope: string;
  category: string | null;
  status: string;
  countedBy: string | null;
  approvedBy: string | null;
  lines: number;
  counted: number;
  varianceLines: number;
  netVarianceQty: number;
  netVarianceValue: number;
  absVarianceValue: number;
  accuracyPct: number;
  items: StockCountVarianceLine[];
};
export type ExpiryReportRow = {
  batchId: number;
  sku: string;
  product: string;
  category: string;
  warehouse: string;
  branch: string;
  batchNo: string;
  receivedDate: string;
  expiryDate: string;
  daysLeft: number;
  qty: number;
  unitCost: number;
  value: number;
  status: string;
};
export type PurchaseOrderReportLine = {
  sku: string;
  product: string;
  category: string;
  branch: string;
  warehouse: string | null;
  uom: string;
  qty: number;
  receivedQty: number;
  pendingQty: number;
  unitCost: number;
  lineTotal: number;
  batchNo: string | null;
  expiryDate: string | null;
};
export type PurchaseOrderReportRow = {
  id: number;
  poNo: string;
  orderedAt: string;
  expectedDate: string;
  supplier: string;
  status: string;
  currency: string;
  branches: string;
  carrier: string | null;
  trackingRef: string | null;
  approvedBy: string | null;
  itemCount: number;
  qtyOrdered: number;
  qtyReceived: number;
  qtyPending: number;
  receivedPct: number;
  subTotal: number;
  shipping: number;
  total: number;
  daysLate: number;
  items: PurchaseOrderReportLine[];
};
export type SupplierReturnReportLine = {
  sku: string;
  product: string;
  category: string;
  qty: number;
  unitCost: number;
  lineValue: number;
  batchNo: string | null;
};
export type SupplierReturnReportRow = {
  id: number;
  rtsNo: string;
  date: string;
  supplier: string;
  branch: string;
  warehouse: string;
  linkedPo: string | null;
  reason: string;
  status: string;
  creditNoteRef: string | null;
  carrier: string | null;
  itemCount: number;
  qty: number;
  value: number;
  items: SupplierReturnReportLine[];
};
export type SupplierPerformanceRow = {
  supplierId: number;
  supplier: string;
  type: string;
  terms: string;
  leadTimeDays: number;
  poCount: number;
  orderedValue: number;
  receivedValue: number;
  fillRatePct: number;
  onTimePct: number;
  avgLeadTimeDays: number;
  returnCount: number;
  returnedValue: number;
  returnRatePct: number;
  outstanding: number;
};
export type CustomerReturnReportLine = {
  sku: string;
  product: string;
  category: string;
  qty: number;
  unitPricePaid: number;
  vatRate: number;
  amount: number;
};
export type CustomerReturnReportRow = {
  id: number;
  returnNo: string;
  date: string;
  type: string;
  orderNo: string | null;
  customer: string | null;
  branch: string;
  approvedBy: string | null;
  reason: string;
  damageReason: string | null;
  refundMethod: string;
  status: string;
  dgrnNo: string | null;
  itemCount: number;
  qty: number;
  grossRefund: number;
  vatReversal: number;
  restockingFee: number;
  netCashback: number;
  items: CustomerReturnReportLine[];
};
export type DamagedItemReportRow = {
  returnId: number;
  returnNo: string;
  dgrnNo: string | null;
  date: string;
  sku: string;
  product: string;
  category: string;
  branch: string;
  customer: string | null;
  qty: number;
  unitCost: number;
  lossValue: number;
  damageReason: string;
  notes: string | null;
  photoReference: string | null;
  approvedBy: string | null;
  status: string;
};
export type EmployeeAuditRow = {
  id: number;
  date: string;
  userName: string | null;
  employeeName: string | null;
  department: string | null;
  designation: string | null;
  branch: string | null;
  module: string;
  event: string;
  recordId: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  severity: string;
  device: string | null;
};
export type EmployeeActivityRow = {
  date: string;
  kind: string;
  reference: string;
  detail: string;
  amount: number | null;
  branch: string | null;
  severity: string;
};
export type EmployeeReportRow = {
  userId: number;
  name: string;
  email: string;
  role: string;
  branch: string;
  status: string;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  orders: number;
  grossSales: number;
  discounts: number;
  vat: number;
  netSales: number;
  avgBasket: number;
  itemsPerOrder: number;
  discountRatePct: number;
  voidedOrders: number;
  voidedValue: number;
  refundsApproved: number;
  refundValue: number;
  shifts: number;
  cashVariance: number;
  auditEvents: number;
  criticalEvents: number;
  items: EmployeeActivityRow[];
};
export type CashierPerformanceRow = {
  userId: number;
  cashier: string;
  branch: string;
  orders: number;
  gross: number;
  discounts: number;
  vat: number;
  net: number;
  avgBasket: number;
  itemsPerOrder: number;
  voidedOrders: number;
  discountRatePct: number;
  refunds: number;
  refundValue: number;
};
export type ProfitMarginRow = {
  key: string;
  label: string;
  sub: string | null;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  discounts: number;
  returns: number;
  netProfit: number;
};
export type PaymentMethodReportRow = {
  method: string;
  transactions: number;
  amount: number;
  sharePct: number;
  refunds: number;
  refundAmount: number;
  net: number;
};
export type CategoryPerformanceRow = {
  categoryId: number;
  category: string;
  skuCount: number;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  returnedUnits: number;
  returnRatePct: number;
  onHand: number;
  stockValue: number;
};

export type FilterOption = { id: string; label: string; sub: string | null };
export type ReportFilterOptionsDto = {
  branches: FilterOption[];
  warehouses: FilterOption[];
  categories: FilterOption[];
  products: FilterOption[];
  suppliers: FilterOption[];
  customers: FilterOption[];
  users: FilterOption[];
  employees: FilterOption[];
  roles: FilterOption[];
  purchaseOrderStatuses: string[];
  rtsStatuses: string[];
  returnTypes: string[];
  returnStatuses: string[];
  refundMethods: string[];
  damageReasons: string[];
  stockCountStatuses: string[];
  paymentMethods: string[];
  auditModules: string[];
  auditEvents: string[];
  brands: string[];
  stockStatuses: string[];
  supplierTypes: string[];
};

export type ReportDateRange = { from?: string; to?: string };
/** Every value a report filter bar can produce: a date range, a multi-select, or a scalar knob. */
export type ReportQuery = ReportDateRange &
  Record<string, string | number | boolean | string[] | undefined>;

// Repeated params for arrays, plain params for scalars, and nothing at all for empty values —
// the exact shape the backend's [FromQuery] int[]/string[] binding expects.
export function reportQs(query: ReportQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v !== "") params.append(key, String(v));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const base = "/api/insights/reports";

// One hook covers every list-shaped report — the console drives them all from a declarative
// registry, so a new report is a registry entry plus a backend endpoint, not another hook here.
function useReport<T>(key: string, query: ReportQuery, enabled: boolean) {
  return useQuery({
    queryKey: ["insights", "report", key, query],
    queryFn: () => apiGet<T>(`${base}/${key}${reportQs(query)}`),
    enabled,
  });
}

export const useReportFilterOptions = (enabled = true) =>
  useQuery({
    queryKey: ["insights", "report", "filter-options"],
    queryFn: () => apiGet<ReportFilterOptionsDto>(`${base}/filter-options`),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

export const useSalesSummaryReport = (query: ReportQuery, enabled = true) =>
  useReport<SalesSummaryDto>("sales-summary", query, enabled);
export const useReturnsAnalysisReport = (query: ReportQuery, enabled = true) =>
  useReport<ReturnsAnalysisRow[]>("returns-analysis", query, enabled);
export const useRefundMethodsReport = (query: ReportQuery, enabled = true) =>
  useReport<RefundMethodRow[]>("refund-methods", query, enabled);
export const useVatReport = (query: ReportQuery, enabled = true) =>
  useReport<VatReportDto>("vat", query, enabled);
export const useTopProductsReport = (query: ReportQuery, enabled = true) =>
  useReport<TopProductRow[]>("top-products", query, enabled);
export const useSlowMovingReport = (query: ReportQuery, enabled = true) =>
  useReport<SlowMovingRow[]>("slow-moving", query, enabled);
export const useContractorAgingReport = (query: ReportQuery, enabled = true) =>
  useReport<ContractorAgingRow[]>("contractor-aging", query, enabled);
export const useRestockingFeesReport = (query: ReportQuery, enabled = true) =>
  useReport<RestockingFeeRow[]>("restocking-fees", query, enabled);
export const useDiscountUtilizationReport = (query: ReportQuery, enabled = true) =>
  useReport<DiscountUtilizationDto>("discount-utilization", query, enabled);

export const useItemReport = (query: ReportQuery, enabled = true) =>
  useReport<ItemReportRow[]>("item-report", query, enabled);
export const useInventoryReport = (query: ReportQuery, enabled = true) =>
  useReport<InventoryReportRow[]>("inventory-report", query, enabled);
export const useLowStockReport = (query: ReportQuery, enabled = true) =>
  useReport<LowStockRow[]>("low-stock", query, enabled);
export const useStockCountVarianceReport = (query: ReportQuery, enabled = true) =>
  useReport<StockCountVarianceRow[]>("stock-count-variance", query, enabled);
export const useExpiryReport = (query: ReportQuery, enabled = true) =>
  useReport<ExpiryReportRow[]>("expiry-report", query, enabled);
export const usePurchaseOrderReport = (query: ReportQuery, enabled = true) =>
  useReport<PurchaseOrderReportRow[]>("purchase-orders", query, enabled);
export const useSupplierReturnsReport = (query: ReportQuery, enabled = true) =>
  useReport<SupplierReturnReportRow[]>("supplier-returns", query, enabled);
export const useSupplierPerformanceReport = (query: ReportQuery, enabled = true) =>
  useReport<SupplierPerformanceRow[]>("supplier-performance", query, enabled);
export const useCustomerReturnsReport = (query: ReportQuery, enabled = true) =>
  useReport<CustomerReturnReportRow[]>("customer-returns", query, enabled);
export const useDamagedItemsReport = (query: ReportQuery, enabled = true) =>
  useReport<DamagedItemReportRow[]>("damaged-items", query, enabled);
export const useEmployeeAuditReport = (query: ReportQuery, enabled = true) =>
  useReport<EmployeeAuditRow[]>("employee-audit", query, enabled);
export const useEmployeeReport = (query: ReportQuery, enabled = true) =>
  useReport<EmployeeReportRow[]>("employee-report", query, enabled);
export const useCashierPerformanceReport = (query: ReportQuery, enabled = true) =>
  useReport<CashierPerformanceRow[]>("cashier-performance", query, enabled);
export const useProfitMarginReport = (query: ReportQuery, enabled = true) =>
  useReport<ProfitMarginRow[]>("profit-margin", query, enabled);
export const usePaymentMethodsReport = (query: ReportQuery, enabled = true) =>
  useReport<PaymentMethodReportRow[]>("payment-methods", query, enabled);
export const useCategoryPerformanceReport = (query: ReportQuery, enabled = true) =>
  useReport<CategoryPerformanceRow[]>("category-performance", query, enabled);

// Phase 5 (BRD §5.8 Analytics & Reporting) — bundle-engine reports, served from
// BundleReportsController (same api/insights/reports base, same Window()/ReportFilters
// conventions as every other report above).
export type BundleSalesRow = {
  bundleId: number;
  code: string;
  nameEn: string;
  type: string;
  unitsSold: number;
  revenue: number;
  savings: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
};
export type BundleProductContributionRow = {
  bundleId: number;
  bundleCode: string;
  bundleName: string;
  productId: number;
  sku: string;
  productName: string;
  qtySold: number;
  revenue: number;
};
export type BundleSuggestionRow = {
  bundleId: number;
  code: string;
  nameEn: string;
  suggested: number;
  accepted: number;
  rejected: number;
  conversionPct: number;
};
export type BundlePromotionRow = {
  productId: number;
  sku: string;
  productName: string;
  timesApplied: number;
  paidUnits: number;
  freeUnits: number;
};
export type PalletUtilizationRow = {
  productId: number;
  sku: string;
  productName: string;
  palletUnitsSold: number;
  looseUnitsSold: number;
  difference: number;
};
export const useBundleSalesReport = (query: ReportQuery, enabled = true) =>
  useReport<BundleSalesRow[]>("bundle-sales", query, enabled);
export const useBundleProductContributionReport = (query: ReportQuery, enabled = true) =>
  useReport<BundleProductContributionRow[]>("bundle-product-contribution", query, enabled);
export const useBundleSuggestionsReport = (query: ReportQuery, enabled = true) =>
  useReport<BundleSuggestionRow[]>("bundle-suggestions", query, enabled);
export const useBundlePromotionsReport = (query: ReportQuery, enabled = true) =>
  useReport<BundlePromotionRow[]>("bundle-promotions", query, enabled);
export const usePalletUtilizationReport = (query: ReportQuery, enabled = true) =>
  useReport<PalletUtilizationRow[]>("pallet-utilization", query, enabled);
