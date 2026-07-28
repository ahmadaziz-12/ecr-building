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
  // Module 7 (BRD §4.3.2): SAR-spend tier progress + Gold's dedicated manager + Platinum's priority billing.
  loyaltyLifetimeSpend: number;
  accountManagerUserId: number | null;
  accountManagerName: string | null;
  priorityBilling: boolean;
  // Module 20 (BRD §4.3.4): birthday-bonus source + "points lapse next month" cashier alert.
  dateOfBirth?: string | null;
  pointsExpiringSoon?: boolean;
  // BRD §7 (CR-038): which Product price list this customer is charged — independent of Type.
  priceListType?: string;
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
  // BRD §2.3 audit trail — qty/unitPrice are in the selling UOM (`uom`); stockQty is what inventory
  // was actually deducted, in stock UOM. Legacy lines predating the UOM engine: uom="", stockQty=0.
  uom: string;
  stockQty: number;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  // The OrderLine's own id — Module 6 return creation references original lines by this.
  id: number;
  // BRD §5.2: set when the line was auto-populated from a bundle.
  bundleId: number | null;
  bundleName: string | null;
  // Product weight (per stock UOM) × the line's actual stock qty — total kg for the line.
  lineWeight: number;
  // BRD §2.3: cashier's free-text note for this specific line.
  notes?: string | null;
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
  // Portion of discountTotal from bundle constituent pricing (individual price minus bundle
  // price) — broken out so the receipt can show it as its own line (BRD §5.2).
  bundleDiscountTotal: number;
  vatTotal: number;
  feesTotal: number;
  grandTotal: number;
  createdAt: string;
  lines: OrderLineDto[];
  payments: OrderPaymentDto[];
  fees: OrderFeeDto[];
  // Only populated on the checkout response for a loyalty-enrolled customer (BRD §4.3.1) — null on
  // List/Get/Void, which don't recompute a points snapshot.
  loyaltyPointsEarned: number | null;
  loyaltyPointsBalance: number | null;
  loyaltyNextTierThreshold: number | null;
  loyaltyPointsRedeemed: number | null;
  // BRD §3.5: set when this sale had at least one delivery-flagged line — the auto-created
  // DeliveryOrder's own id/no/stage, so POS screens can show live delivery status without a trip to
  // the separate Delivery module.
  deliveryOrderId: number | null;
  deliveryOrderNo: string | null;
  deliveryStage: string | null;
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
  // null = applies company-wide, across every branch.
  branchId: number | null;
  branchName: string | null;
  // Type="Quantity"/"Promotional": the cart-line quantity threshold (Quantity only) and the SKU
  // it's scoped to (null = any product, both types).
  minQuantity: number | null;
  sku: string | null;
  // Type="Promotional" only (BRD §7 CR-040): the rule's start date — null = active immediately.
  validFrom: string | null;
  // Phase 2 (BRD §5.1) — see src/lib/buildpos/pricing.ts for how each is applied.
  // Type="Quantity" + palletQty set: repeating-tier pallet pricing instead of a single % threshold.
  palletQty: number | null;
  // Type="Buy X Get Y": every (buyQty + freeQty) units bought yields freeQty free units.
  buyQty: number | null;
  freeQty: number | null;
  // Type="Trade Value": cart-subtotal threshold (SAR) — value is the % off the whole order.
  minCartTotal: number | null;
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

// BRD §4.3.1-§4.3.3: the checkout screen needs the current earn/redeem rate/min/max AND the tier
// ladder (thresholds/multipliers/discounts/free-delivery) — all Settings-driven, read here instead
// of hardcoding the BRD's own default numbers.
export type LoyaltyConfigDto = {
  pointsPerSarEarned: number;
  pointsPerSarRedeemed: number;
  minRedeemPoints: number;
  maxRedeemPctOfTotal: number;
  silverThreshold: number;
  goldThreshold: number;
  platinumThreshold: number;
  silverMultiplier: number;
  goldMultiplier: number;
  platinumMultiplier: number;
  silverDiscountPct: number;
  goldDiscountPct: number;
  platinumDiscountPct: number;
  freeDeliveryMinOrderSar: number;
};
export const useLoyaltyConfig = (enabled = true) =>
  useQuery({
    queryKey: ["pos", "loyalty-config"],
    queryFn: () => apiGet<LoyaltyConfigDto>("/api/pos/orders/loyalty-config"),
    enabled,
    staleTime: 5 * 60 * 1000,
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
  // null = applies company-wide, across every branch.
  branchId: number | null;
  minQuantity?: number | null;
  sku?: string | null;
  validFrom?: string | null;
  palletQty?: number | null;
  buyQty?: number | null;
  freeQty?: number | null;
  minCartTotal?: number | null;
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
export function useUpdatePricingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertPricingRuleRequest }) =>
      apiPut<PricingRuleDto>(`/api/finance/pricing-rules/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "pricing-rules"] }),
  });
}
export function useDeletePricingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete<void>(`/api/finance/pricing-rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "pricing-rules"] }),
  });
}

// uom: selling UOM (omitted = stock UOM). lengthM/widthM/heightM: cut-to-size dimensions — when
// lengthM is set on an IsCutToSize product the server computes qty (length/area/volume, per the
// product's CutToSizeUnit) itself and ignores the sent qty (BRD §2.3).
// requiresDelivery (BRD §3.5): cashier flags this line for delivery instead of counter pickup.
// notes (BRD §2.3): cashier's free-text note for this line. manualDiscountPct (BRD §2.3/§6.2):
// cashier-entered per-line discount %, gated by the same authorization ceiling as ManualDiscount below.
// manualUnitPrice (BRD §7 CR-039): an absolute price override for this line — replaces the resolved
// list price entirely (no discount stacks on top), gated by Role.CanOverrideItemPrice or a
// PriceOverride approval (see CheckoutRequest.priceOverrideApprovalRequestId), distinct from a discount.
export type CartLine = {
  productId: number;
  qty: number;
  uom?: string;
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  requiresDelivery?: boolean;
  notes?: string | null;
  manualDiscountPct?: number | null;
  manualUnitPrice?: number | null;
};
export type PaymentInput = { method: string; amount: number };
export type ManualDiscountInput = { type: "Percentage" | "Fixed"; value: number };
export type CustomFeeInput = { label: string; amount: number };
// BRD §3.5: one shared address/date/driver-vehicle-preference for every delivery-flagged line in
// the cart. zoneId (optional): the delivery fee auto-calculates from the zone's configured fee.
export type DeliveryDetailsInput = {
  addressType: string;
  contactName: string;
  contactMobile: string;
  city: string;
  district?: string | null;
  street?: string | null;
  landmark?: string | null;
  instructions?: string | null;
  promisedDate: string;
  promisedTime: string;
  timeSlot?: string | null;
  priority?: string | null;
  driverId?: number | null;
  vehicleId?: number | null;
  zoneId?: number | null;
  weightTons?: number | null;
};
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
  // BRD §5.2: bundles in the cart — the server expands each into constituent lines at proportional
  // bundle prices with per-item VAT. supervisorEmail/Pin (Phase 4, BRD §5.7) are only read when the
  // bundle failed a schedule/branch/customer-group eligibility check client-side.
  bundles?: { bundleId: number; qty: number; supervisorEmail?: string; supervisorPin?: string }[];
  // Module 11 (BRD §4.2): B2B purchase-order reference + project code for the tax invoice.
  poReference?: string | null;
  projectCode?: string | null;
  // Module 10 (offline mode): idempotency key — a replay with the same id returns the original order.
  clientRequestId?: string;
  // Id of an Approved ApprovalRequest (Type=Discount) — required when manualDiscount exceeds the
  // cashier's own BRD §10.1 discount-authorization ceiling (see OrdersController.Checkout).
  discountApprovalRequestId?: number | null;
  // Id of an Approved ApprovalRequest (Type=CreditOverride) — required when an AccountCredit payment
  // would push a B2B customer's Outstanding balance over their CreditLimit (BRD §4.2).
  creditOverrideApprovalRequestId?: number | null;
  // BRD §3.5: required when any `lines` entry has requiresDelivery=true.
  delivery?: DeliveryDetailsInput | null;
  // Id of an Approved ApprovalRequest (Type=PriceOverride) — required when any line's manualUnitPrice
  // needs authorization the cashier doesn't hold (BRD §7 CR-039).
  priceOverrideApprovalRequestId?: number | null;
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
  // BRD §7 (CR-038): which Product price list this customer is charged — independent of type.
  priceListType?: string;
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
    priceListType: request.priceListType ?? "Retail",
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

// Reconstructed from GL postings to Accounts Receivable (1100) — every AccountCredit sale, B2B
// return credit, or RecordPayment settlement shows up here, in the same reference-based way
// SuppliersController.Ledger already works for suppliers (see useSupplierLedger).
export type CustomerLedgerLineDto = {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
};
export const useCustomerLedger = (id: number | undefined) =>
  useQuery({
    queryKey: ["pos", "customers", id, "ledger"],
    queryFn: () => apiGet<CustomerLedgerLineDto[]>(`/api/pos/customers/${id}/ledger`),
    enabled: id !== undefined,
  });

export type RecordCustomerPaymentInput = {
  amount: number;
  method: string;
  referenceNo?: string | null;
  notes?: string | null;
};
export function useRecordCustomerPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, ...request }: RecordCustomerPaymentInput & { customerId: number }) =>
      apiPost<CustomerDto>(`/api/pos/customers/${customerId}/payments`, request),
    onSuccess: (_, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ["pos", "customers"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "customers", customerId, "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "customers", customerId, "statement"] });
    },
  });
}

// Settles a Pending/Unpaid order (a converted quotation) — the register takes the payment here
// instead of the order sitting "Awaiting payment" forever. Loyalty/AccountCredit are checkout-only
// tenders; the server rejects them on this endpoint.
export function usePayOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payments,
      terminalId,
    }: {
      id: number;
      payments: PaymentInput[];
      terminalId?: number | null;
    }) =>
      apiPut<OrderDto>(`/api/pos/orders/${id}/pay`, { payments, terminalId: terminalId ?? null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "cashier-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["finance", "accounts"] });
      queryClient.invalidateQueries({ queryKey: ["zatca"] });
    },
  });
}

export function useVoidOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reason,
      reasonCode,
      authorizerEmail,
      authorizerPin,
    }: {
      id: number;
      reason: string;
      reasonCode: string;
      authorizerEmail?: string;
      authorizerPin?: string;
    }) =>
      apiPut<OrderDto>(`/api/pos/orders/${id}/void`, {
        reason,
        reasonCode,
        authorizerEmail,
        authorizerPin,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "orders"] }),
  });
}

// BRD §3.6 (Module 17): void a single line — restores only that line's stock and adjusts totals.
export function useVoidOrderLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      orderLineId,
      reason,
      reasonCode,
      authorizerEmail,
      authorizerPin,
    }: {
      id: number;
      orderLineId: number;
      reason: string;
      reasonCode: string;
      authorizerEmail?: string;
      authorizerPin?: string;
    }) =>
      apiPut<OrderDto>(`/api/pos/orders/${id}/void-line`, {
        orderLineId,
        reason,
        reasonCode,
        authorizerEmail,
        authorizerPin,
      }),
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
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["pos", "cashier-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "cashier-shifts", id, "movements"] });
    },
  });
}

// Itemized trail behind CashierShiftDto's aggregate cashIn/cashOut — lets a till reconciliation
// drill into exactly which events made up that total instead of only seeing the sum.
export type CashMovementDto = {
  id: number;
  direction: "In" | "Out";
  amount: number;
  reason: string;
  createdAt: string;
  createdByName: string | null;
};
export const useCashMovements = (shiftId: number | undefined) =>
  useQuery({
    queryKey: ["pos", "cashier-shifts", shiftId, "movements"],
    queryFn: () => apiGet<CashMovementDto[]>(`/api/pos/cashier-shifts/${shiftId}/movements`),
    enabled: shiftId !== undefined,
  });

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
  // BRD §3.4 (Module 16): both mandatory — the backend has always returned these, the frontend type
  // just never declared them.
  projectCode: string;
  customerReference: string;
  // Quotation-level discount rate the user picked (0 = none); every line is priced at this rate.
  discountPct: number;
};
export type CreateQuotationRequest = {
  branchId: number;
  customerId: number | null;
  lines: CartLine[];
  validUntil?: string | null;
  notes?: string;
  // BRD §3.4 (Module 16): mandatory — the server rejects quotations without a project code.
  projectCode: string;
  // The customer's own PO/tracking number — optional, since it isn't always known up front.
  customerReference?: string;
  // Manual override; omit to fall back to the server's auto contractor-discount rule.
  discountPct?: number | null;
};
export type UpdateQuotationRequest = {
  customerId: number | null;
  lines: CartLine[];
  validUntil?: string | null;
  notes?: string;
  projectCode: string;
  customerReference?: string;
  discountPct?: number | null;
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

export function useUpdateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpdateQuotationRequest }) =>
      apiPut<QuotationDto>(`/api/pos/quotations/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos", "quotations"] }),
  });
}

// Soft-cancel (sets Status=Cancelled server-side) — quotations are never hard-deleted so the audit
// trail and history stay intact, matching how Orders handle Void instead of a real DELETE.
export function useCancelQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete<void>(`/api/pos/quotations/${id}`),
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
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
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
      "Branch",
      "Status",
    ],
    statusCol: 9,
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
      r.branchName ?? "All Branches",
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
