import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete } from "./client";
import type { LiveTable } from "./admin";

export type CustomerDto = {
  id: number;
  nameEn: string;
  nameAr: string | null;
  type: string;
  phone: string | null;
  email: string | null;
  vatNo: string | null;
  creditLimit: number;
  outstanding: number;
  city: string | null;
  district: string | null;
  address: string | null;
  loyaltyEnrolled: boolean;
  loyaltyPoints: number;
  loyaltyLifetimePoints: number;
  loyaltyTier: string;
  status: string;
  lastPurchaseAt: string | null;
  projectName: string | null;
  creditTermDays: number | null;
  createdAt: string;
};
export type OrderLineDto = {
  productId: number;
  sku: string;
  productName: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  vatRate: number;
  lineTotal: number;
};
export type OrderPaymentDto = {
  method: string;
  amount: number;
  referenceNumber: string | null;
  status: string;
  createdAt: string;
};
export type OrderFeeDto = { label: string; amount: number };
export type OrderDto = {
  id: number;
  orderNo: string;
  branchId: number;
  branchName: string;
  terminalId: number | null;
  cashierName: string;
  customerId: number | null;
  customerName: string;
  type: string;
  status: string;
  paymentStatus: string;
  subTotal: number;
  discountTotal: number;
  vatTotal: number;
  feesTotal: number;
  grandTotal: number;
  createdAt: string;
  lines: OrderLineDto[];
  payments: OrderPaymentDto[];
  fees: OrderFeeDto[];
};
export type CashierShiftDto = {
  id: number;
  terminalId: number;
  terminalName: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  status: string;
};
export type PricingRuleDto = {
  id: number;
  name: string;
  type: string;
  scope: string;
  condition: string;
  action: string;
  priority: number;
  validUntil: string | null;
  status: string;
  code: string | null;
  discountType: string;
  value: number;
};

export const useCustomers = (enabled = true, filters?: { type?: string; search?: string }) =>
  useQuery({
    queryKey: ["pos", "customers", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.type) params.set("type", filters.type);
      if (filters?.search) params.set("search", filters.search);
      const qs = params.toString();
      return apiGet<CustomerDto[]>(`/api/pos/customers${qs ? `?${qs}` : ""}`);
    },
    enabled,
  });
export const useOrders = (
  enabled = true,
  filters?: { status?: string; type?: string; search?: string },
) =>
  useQuery({
    queryKey: ["pos", "orders", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.type) params.set("type", filters.type);
      if (filters?.search) params.set("search", filters.search);
      const qs = params.toString();
      return apiGet<OrderDto[]>(`/api/pos/orders${qs ? `?${qs}` : ""}`);
    },
    enabled,
  });
export const useCashierShifts = (enabled = true) =>
  useQuery({
    queryKey: ["pos", "cashier-shifts"],
    queryFn: () => apiGet<CashierShiftDto[]>("/api/pos/cashier-shifts"),
    enabled,
  });
export const usePricingRules = (enabled = true) =>
  useQuery({
    queryKey: ["finance", "pricing-rules"],
    queryFn: () => apiGet<PricingRuleDto[]>("/api/finance/pricing-rules"),
    enabled,
  });

export type UpsertPricingRuleRequest = {
  name: string;
  type: string;
  scope: string;
  condition: string;
  action: string;
  priority: number;
  validUntil: string | null;
  code: string | null;
  discountType: string;
  value: number;
};
export function useCreatePricingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertPricingRuleRequest) =>
      apiPost<PricingRuleDto>("/api/finance/pricing-rules", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "pricing-rules"] }),
  });
}
export function useUpdatePricingRuleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiPut<PricingRuleDto>(`/api/finance/pricing-rules/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "pricing-rules"] }),
  });
}

export type CartLine = { productId: number; qty: number };
export type PaymentInput = { method: string; amount: number };
export type ManualDiscountInput = { type: "Percentage" | "Fixed"; value: number };
export type CustomFeeInput = { label: string; amount: number };
export type CheckoutRequest = {
  branchId: number;
  terminalId: number | null;
  customerId: number | null;
  type: string;
  lines: CartLine[];
  payments: PaymentInput[];
  couponCode?: string | null;
  manualDiscount?: ManualDiscountInput | null;
  customFees?: CustomFeeInput[];
  notes?: string;
};

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CheckoutRequest) => apiPost<OrderDto>("/api/pos/orders", request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["catalog", "products"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "customers"] });
      queryClient.invalidateQueries({ queryKey: ["finance", "accounts"] });
      queryClient.invalidateQueries({ queryKey: ["zatca"] });
    },
  });
}

export async function lookupCustomerByPhone(phone: string): Promise<CustomerDto | null> {
  try {
    return await apiGet<CustomerDto>(
      `/api/pos/customers/by-phone?phone=${encodeURIComponent(phone)}`,
    );
  } catch {
    return null;
  }
}

export type UpsertCustomerInput = {
  nameEn: string;
  phone?: string | null;
  type?: string;
  nameAr?: string | null;
  email?: string | null;
  vatNo?: string | null;
  creditLimit?: number;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  loyaltyEnrolled?: boolean;
  projectName?: string | null;
  creditTermDays?: number | null;
};

function toUpsertCustomerRequest(request: UpsertCustomerInput) {
  return {
    nameEn: request.nameEn,
    nameAr: request.nameAr ?? null,
    type: request.type ?? "Retail",
    phone: request.phone ?? null,
    email: request.email ?? null,
    vatNo: request.vatNo ?? null,
    creditLimit: request.creditLimit ?? 0,
    city: request.city ?? null,
    district: request.district ?? null,
    address: request.address ?? null,
    loyaltyEnrolled: request.loyaltyEnrolled ?? false,
    projectName: request.projectName ?? null,
    creditTermDays: request.creditTermDays ?? null,
  };
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertCustomerInput) =>
      apiPost<CustomerDto>("/api/pos/customers", toUpsertCustomerRequest(request)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "customers"] }),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...request }: UpsertCustomerInput & { id: number }) =>
      apiPut<CustomerDto>(`/api/pos/customers/${id}`, toUpsertCustomerRequest(request)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "customers"] }),
  });
}

export function useArchiveCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<CustomerDto>(`/api/pos/customers/${id}/archive`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "customers"] }),
  });
}

export type CustomerStatementDto = {
  customerId: number;
  customerName: string;
  creditLimit: number;
  outstanding: number;
  orders: OrderDto[];
};
export const useCustomerStatement = (customerId: number | null) =>
  useQuery({
    queryKey: ["pos", "customers", customerId, "statement"],
    queryFn: () => apiGet<CustomerStatementDto>(`/api/pos/customers/${customerId}/statement`),
    enabled: customerId !== null,
  });

export function useVoidOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiPut<OrderDto>(`/api/pos/orders/${id}/void`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "orders"] }),
  });
}

export type ValidateCouponResponse = {
  valid: boolean;
  code: string | null;
  name: string | null;
  discountType: string;
  value: number;
  reason: string | null;
};
export async function validateCoupon(code: string): Promise<ValidateCouponResponse> {
  return apiGet<ValidateCouponResponse>(
    `/api/finance/pricing-rules/validate-coupon?code=${encodeURIComponent(code)}`,
  );
}

export type ParkedLineDto = {
  productId: number;
  sku: string;
  productName: string;
  qty: number;
  unitPrice: number;
};
export type ParkedSaleDto = {
  id: number;
  ticketNo: string;
  branchId: number;
  terminalId: number | null;
  cashierName: string;
  customerId: number | null;
  customerName: string | null;
  notes: string | null;
  createdAt: string;
  total: number;
  lines: ParkedLineDto[];
};

export const useParkedSales = (branchId: number | undefined, enabled = true) =>
  useQuery({
    queryKey: ["pos", "parked-sales", branchId],
    queryFn: () =>
      apiGet<ParkedSaleDto[]>(`/api/pos/parked-sales${branchId ? `?branchId=${branchId}` : ""}`),
    enabled: enabled && branchId !== undefined,
  });

export function useHoldSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: {
      branchId: number;
      terminalId: number | null;
      customerId: number | null;
      notes?: string;
      lines: CartLine[];
    }) => apiPost<ParkedSaleDto>("/api/pos/parked-sales", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "parked-sales"] }),
  });
}

export function useResumeSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete<void>(`/api/pos/parked-sales/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "parked-sales"] }),
  });
}

export function useOpenShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { terminalId: number; openingFloat: number }) =>
      apiPost<CashierShiftDto>("/api/pos/cashier-shifts/open", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "cashier-shifts"] }),
  });
}

export function useCloseShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, countedCash }: { id: number; countedCash: number }) =>
      apiPut<CashierShiftDto>(`/api/pos/cashier-shifts/${id}/close`, { countedCash }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "cashier-shifts"] }),
  });
}

export function useCashMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      direction,
      amount,
      reason,
    }: {
      id: number;
      direction: "in" | "out";
      amount: number;
      reason: string;
    }) =>
      apiPut<CashierShiftDto>(
        `/api/pos/cashier-shifts/${id}/cash-movement?direction=${direction}`,
        { amount, reason },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "cashier-shifts"] }),
  });
}

export type ShiftPaymentBreakdownDto = { method: string; amount: number; count: number };
export type CashierShiftReportDto = {
  reportType: string;
  shiftId: number;
  terminalName: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  generatedAt: string;
  openingFloat: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  orderCount: number;
  paymentBreakdown: ShiftPaymentBreakdownDto[];
};
export const fetchShiftReport = (id: number, type: "X" | "Z") =>
  apiGet<CashierShiftReportDto>(`/api/pos/cashier-shifts/${id}/report?type=${type}`);

export type QuotationLineDto = {
  productId: number;
  sku: string;
  productName: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  vatRate: number;
  lineTotal: number;
};
export type QuotationDto = {
  id: number;
  quoteNo: string;
  branchId: number;
  customerId: number | null;
  customerName: string;
  createdByName: string;
  status: string;
  validUntil: string;
  subTotal: number;
  discountTotal: number;
  vatTotal: number;
  grandTotal: number;
  notes: string | null;
  convertedOrderId: number | null;
  convertedOrderNo: string | null;
  createdAt: string;
  lines: QuotationLineDto[];
};
export type CreateQuotationRequest = {
  branchId: number;
  customerId: number | null;
  lines: CartLine[];
  validUntil?: string | null;
  notes?: string;
};

export const useQuotations = (enabled = true) =>
  useQuery({
    queryKey: ["pos", "quotations"],
    queryFn: () => apiGet<QuotationDto[]>("/api/pos/quotations"),
    enabled,
  });

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateQuotationRequest) =>
      apiPost<QuotationDto>("/api/pos/quotations", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "quotations"] }),
  });
}

function useQuotationTransition(action: "send" | "accept" | "reject") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<QuotationDto>(`/api/pos/quotations/${id}/${action}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "quotations"] }),
  });
}
export const useSendQuotation = () => useQuotationTransition("send");
export const useAcceptQuotation = () => useQuotationTransition("accept");
export const useRejectQuotation = () => useQuotationTransition("reject");

export function useConvertQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPost<OrderDto>(`/api/pos/quotations/${id}/convert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos", "quotations"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
    },
  });
}

export type ApprovalRequestDto = {
  id: number;
  type: string;
  branchId: number;
  requestedByName: string;
  approverName: string | null;
  amount: number;
  reason: string;
  status: string;
  relatedOrderId: number | null;
  relatedOrderNo: string | null;
  createdAt: string;
  resolvedAt: string | null;
};
export type CreateApprovalRequestInput = {
  type: string;
  branchId: number;
  amount: number;
  reason: string;
  relatedOrderId?: number | null;
};

export const useApprovalRequests = (enabled = true, status?: string) =>
  useQuery({
    queryKey: ["pos", "approvals", status],
    queryFn: () =>
      apiGet<ApprovalRequestDto[]>(`/api/pos/approvals${status ? `?status=${status}` : ""}`),
    enabled,
  });

export function useCreateApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateApprovalRequestInput) =>
      apiPost<ApprovalRequestDto>("/api/pos/approvals", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "approvals"] }),
  });
}

function useResolveApprovalAction(action: "approve" | "reject") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiPut<ApprovalRequestDto>(`/api/pos/approvals/${id}/${action}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "approvals"] }),
  });
}
export const useApproveApproval = () => useResolveApprovalAction("approve");
export const useRejectApproval = () => useResolveApprovalAction("reject");

function fmtSar(amount: number): string {
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`;
}
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function mapOrders(rows: OrderDto[]): LiveTable {
  return {
    columns: [
      "Order ID",
      "Date/Time",
      "Customer",
      "Type",
      "Payment",
      "Items",
      "Amount",
      "Cashier",
      "Status",
    ],
    statusCol: 8,
    rows: rows.map((o) => [
      o.orderNo,
      fmtTime(o.createdAt),
      o.customerName,
      o.type,
      o.payments.map((p) => p.method).join(" + ") || "—",
      o.lines.reduce((s, l) => s + l.qty, 0),
      fmtSar(o.grandTotal),
      o.cashierName,
      o.status,
    ]),
  };
}

export function mapCustomers(rows: CustomerDto[]): LiveTable {
  return {
    columns: [
      "ID",
      "Name (EN/AR)",
      "Type",
      "Phone",
      "VAT No.",
      "Credit Limit",
      "Outstanding",
      "Last Purchase",
      "Status",
    ],
    statusCol: 8,
    rows: rows.map((c) => [
      `CUS-${String(c.id).padStart(5, "0")}`,
      `${c.nameEn}${c.nameAr ? ` / ${c.nameAr}` : ""}`,
      c.type,
      c.phone ?? "—",
      c.vatNo ?? "—",
      c.creditLimit > 0 ? fmtSar(c.creditLimit) : "—",
      fmtSar(c.outstanding),
      c.lastPurchaseAt
        ? new Date(c.lastPurchaseAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—",
      c.status,
    ]),
  };
}

export function mapCashierShifts(rows: CashierShiftDto[]): LiveTable {
  return {
    columns: [
      "Shift ID",
      "Cashier",
      "Terminal",
      "Opened",
      "Closed",
      "Opening Float",
      "Cash Sales",
      "Cash In/Out",
      "Expected",
      "Counted",
      "Variance",
      "Status",
    ],
    statusCol: 11,
    rows: rows.map((s) => [
      `SH-${String(s.id).padStart(4, "0")}`,
      s.cashierName,
      s.terminalName,
      fmtTime(s.openedAt),
      fmtTime(s.closedAt),
      fmtSar(s.openingFloat),
      fmtSar(s.cashSales),
      fmtSar(s.cashIn - s.cashOut),
      fmtSar(s.expectedCash),
      s.countedCash === null ? "—" : fmtSar(s.countedCash),
      s.variance === null ? "—" : fmtSar(s.variance),
      s.status,
    ]),
  };
}

export function mapPricingRules(rows: PricingRuleDto[]): LiveTable {
  return {
    columns: [
      "Rule ID",
      "Name",
      "Type",
      "Scope",
      "Code",
      "Discount",
      "Priority",
      "Valid Until",
      "Status",
    ],
    statusCol: 8,
    ids: rows.map((r) => r.id),
    rows: rows.map((r) => [
      `PR-${String(r.id).padStart(3, "0")}`,
      r.name,
      r.type,
      r.scope,
      r.code ?? "—",
      r.discountType === "Percentage" ? `${r.value}%` : `${r.value} ر.س`,
      r.priority,
      r.validUntil
        ? new Date(r.validUntil).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "Ongoing",
      r.status,
    ]),
  };
}

export function mapParkedSales(rows: ParkedSaleDto[]): LiveTable {
  return {
    columns: ["Ticket", "Customer", "Items", "Amount", "Parked At", "Cashier", "Reason", "Status"],
    statusCol: 7,
    rows: rows.map((p) => [
      p.ticketNo,
      p.customerName ?? "Walk-in",
      p.lines.reduce((s, l) => s + l.qty, 0),
      fmtSar(p.total),
      fmtTime(p.createdAt),
      p.cashierName,
      p.notes ?? "—",
      "Parked",
    ]),
  };
}
