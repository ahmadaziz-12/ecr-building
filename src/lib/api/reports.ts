import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./client";

// Module 12 (BRD §7): typed clients for the operational report endpoints served by
// backend ReportsController (api/insights/reports/*). Each report is its own view in the
// Insights → Reports console; date filtering is server-side via from/to.

export type SalesByMethodRow = { method: string; amount: number; count: number };
export type SalesByCashierRow = { cashier: string; amount: number; orders: number };
export type SalesSummaryDto = {
  grossSales: number;
  discounts: number;
  vat: number;
  netSales: number;
  orderCount: number;
  byMethod: SalesByMethodRow[];
  byCashier: SalesByCashierRow[];
};
export type ReturnsAnalysisRow = { type: string; count: number; grossRefund: number; vatReversed: number; restockingFees: number; netCashback: number };
export type RefundMethodRow = { method: string; count: number; amount: number };
export type VatByRateRow = { rate: number; taxableAmount: number; vatCollected: number };
export type VatReportDto = { collected: VatByRateRow[]; totalCollected: number; totalReversed: number; netVat: number };
export type TopProductRow = { sku: string; name: string; units: number; revenue: number };
export type SlowMovingRow = { sku: string; name: string; onHand: number; lastSoldAt: string | null };
export type ContractorAgingRow = { customer: string; creditLimit: number; outstanding: number; lastPurchaseAt: string | null; daysSinceLastPurchase: number };
export type RestockingFeeRow = { month: string; returns: number; feesCollected: number };
export type DiscountUtilizationDto = { totalDiscounts: number; discountedOrders: number; totalOrders: number; discountRatePct: number };

export type ReportDateRange = { from?: string; to?: string };

function rangeQs(range: ReportDateRange, extra: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  // The backend compares CreatedAt <= to, so a bare date would exclude the chosen end day itself.
  if (range.to) params.set("to", `${range.to}T23:59:59`);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const base = "/api/insights/reports";

export const useSalesSummaryReport = (range: ReportDateRange, enabled = true) =>
  useQuery({
    queryKey: ["insights", "report", "sales-summary", range],
    queryFn: () => apiGet<SalesSummaryDto>(`${base}/sales-summary${rangeQs(range)}`),
    enabled,
  });
export const useReturnsAnalysisReport = (range: ReportDateRange, enabled = true) =>
  useQuery({
    queryKey: ["insights", "report", "returns-analysis", range],
    queryFn: () => apiGet<ReturnsAnalysisRow[]>(`${base}/returns-analysis${rangeQs(range)}`),
    enabled,
  });
export const useRefundMethodsReport = (range: ReportDateRange, enabled = true) =>
  useQuery({
    queryKey: ["insights", "report", "refund-methods", range],
    queryFn: () => apiGet<RefundMethodRow[]>(`${base}/refund-methods${rangeQs(range)}`),
    enabled,
  });
export const useVatReport = (range: ReportDateRange, enabled = true) =>
  useQuery({
    queryKey: ["insights", "report", "vat", range],
    queryFn: () => apiGet<VatReportDto>(`${base}/vat${rangeQs(range)}`),
    enabled,
  });
export const useTopProductsReport = (range: ReportDateRange, take: number, enabled = true) =>
  useQuery({
    queryKey: ["insights", "report", "top-products", range, take],
    queryFn: () => apiGet<TopProductRow[]>(`${base}/top-products${rangeQs(range, { take })}`),
    enabled,
  });
export const useSlowMovingReport = (days: number, enabled = true) =>
  useQuery({
    queryKey: ["insights", "report", "slow-moving", days],
    queryFn: () => apiGet<SlowMovingRow[]>(`${base}/slow-moving${rangeQs({}, { days })}`),
    enabled,
  });
export const useContractorAgingReport = (enabled = true) =>
  useQuery({
    queryKey: ["insights", "report", "contractor-aging"],
    queryFn: () => apiGet<ContractorAgingRow[]>(`${base}/contractor-aging`),
    enabled,
  });
export const useRestockingFeesReport = (range: ReportDateRange, enabled = true) =>
  useQuery({
    queryKey: ["insights", "report", "restocking-fees", range],
    queryFn: () => apiGet<RestockingFeeRow[]>(`${base}/restocking-fees${rangeQs(range)}`),
    enabled,
  });
export const useDiscountUtilizationReport = (range: ReportDateRange, enabled = true) =>
  useQuery({
    queryKey: ["insights", "report", "discount-utilization", range],
    queryFn: () => apiGet<DiscountUtilizationDto>(`${base}/discount-utilization${rangeQs(range)}`),
    enabled,
  });
