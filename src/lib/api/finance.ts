import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";
import type { LiveTable } from "./admin";

export type ExpenseDto = {
  id: number;
  expenseNo: string;
  date: string;
  branchId: number;
  branchName: string;
  category: string;
  description: string;
  vendor: string | null;
  amount: number;
  vat: number;
  method: string;
  status: string;
  reconciled: boolean;
};
export type TaxCodeDto = {
  id: number;
  code: string;
  name: string;
  type: string;
  rate: number;
  appliesTo: string;
  effectiveFrom: string;
  glAccountCode: string | null;
  status: string;
  // null = applies company-wide, across every branch.
  branchId: number | null;
  branchName: string | null;
};
export type ReturnLineDto = {
  productId: number;
  sku: string;
  productName: string;
  qty: number;
  amount: number;
  orderLineId: number | null;
  stockQty: number;
  unitPricePaid: number;
  vatRate: number;
};
export type ReturnDto = {
  id: number;
  returnNo: string;
  orderId: number | null;
  orderNo: string | null;
  customerId: number | null;
  customerName: string;
  type: string;
  reason: string;
  totalAmount: number;
  approvedByName: string | null;
  status: string;
  createdAt: string;
  lines: ReturnLineDto[];
  // Module 6 (BRD §3.2): damaged-return workflow + frozen Return Value Calculation + refund routing.
  dgrnNo: string | null;
  damageReason: string | null;
  photoReference: string | null;
  grossRefund: number;
  vatReversal: number;
  restockingFeePct: number;
  restockingFeeAmount: number;
  netCashback: number;
  refundMethod: string;
  refundSplitJson: string | null;
  exchangeOrderId: number | null;
  exchangeOrderNo: string | null;
  exchangeNetPayable: number | null;
  // Inherited from the original sale via Order — null only if that order was later deleted.
  branchId: number | null;
  branchName: string | null;
  cashierName: string | null;
};

// The Return Value Calculation shown to the cashier BEFORE confirming (BRD §3.2.3/§3.2.4).
export type ReturnPreviewLineDto = {
  orderLineId: number; productId: number; sku: string; productName: string; uom: string;
  originalQty: number; maxReturnableQty: number; qty: number; unitPricePaid: number;
  baseRefund: number; vatReversal: number; returnable: boolean; nonReturnableReason: string | null;
};
export type ReturnPreviewDto = {
  grossRefund: number; vatReversal: number; restockingFeePct: number; restockingFeeAmount: number;
  netCashback: number; requiresWindowOverride: boolean; windowDays: number; lines: ReturnPreviewLineDto[];
};
export type AccountDto = { id: number; code: string; name: string; type: string; balance: number };
export type JournalLineDto = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};
export type JournalEntryDto = {
  id: number;
  date: string;
  reference: string;
  description: string;
  lines: JournalLineDto[];
};

export const useExpenses = (enabled = true) =>
  useQuery({
    queryKey: ["finance", "expenses"],
    queryFn: () => apiGet<ExpenseDto[]>("/api/finance/expenses"),
    enabled,
  });
export const useTaxCodes = (enabled = true) =>
  useQuery({
    queryKey: ["finance", "tax-codes"],
    queryFn: () => apiGet<TaxCodeDto[]>("/api/finance/tax-codes"),
    enabled,
  });
export const useReturns = (enabled = true) =>
  useQuery({
    queryKey: ["finance", "returns"],
    queryFn: () => apiGet<ReturnDto[]>("/api/finance/returns"),
    enabled,
  });

export type CreateExpenseRequest = {
  date: string;
  branchId: number;
  category: string;
  description: string;
  vendor: string | null;
  amount: number;
  vat: number;
  method: string;
};
export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateExpenseRequest) =>
      apiPost<ExpenseDto>("/api/finance/expenses", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "expenses"] }),
  });
}
export function useUpdateExpenseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      approverUserId,
    }: {
      id: number;
      status: string;
      approverUserId: number | null;
    }) => apiPut<ExpenseDto>(`/api/finance/expenses/${id}/status`, { status, approverUserId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "expenses"] }),
  });
}

export type UpsertTaxCodeRequest = {
  code: string;
  name: string;
  type: string;
  rate: number;
  appliesTo: string;
  effectiveFrom: string;
  glAccountCode: string | null;
  // null = applies company-wide, across every branch.
  branchId: number | null;
};
export function useCreateTaxCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertTaxCodeRequest) =>
      apiPost<TaxCodeDto>("/api/finance/tax-codes", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "tax-codes"] }),
  });
}
export function useUpdateTaxCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertTaxCodeRequest }) =>
      apiPut<TaxCodeDto>(`/api/finance/tax-codes/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "tax-codes"] }),
  });
}
export function useSetTaxCodeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiPut<TaxCodeDto>(`/api/finance/tax-codes/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "tax-codes"] }),
  });
}

// Module 6: the cashier picks specific ORIGINAL ORDER LINES and quantities — refund amounts are
// computed server-side from the original sale, never sent from the client.
export type CreateReturnLineInput = { orderLineId: number; qty: number };
export type CreateReturnRequest = {
  orderId: number;
  type: string;
  reason: string;
  lines: CreateReturnLineInput[];
  damageReasonCode?: string;
  photoReference?: string;
  windowOverrideApprovalRequestId?: number | null;
  exchangeOrderId?: number | null;
};
export function useCreateReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateReturnRequest) =>
      apiPost<ReturnDto>("/api/finance/returns", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "returns"] }),
  });
}

export function useReturnPreview() {
  return useMutation({
    mutationFn: (request: { orderId: number; type: string; lines: CreateReturnLineInput[] }) =>
      apiPost<ReturnPreviewDto>("/api/finance/returns/preview", request),
  });
}
export function useReconcileExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<ExpenseDto>(`/api/finance/expenses/${id}/reconcile`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "expenses"] }),
  });
}

export function useQuarantineReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<ReturnDto>(`/api/finance/returns/${id}/quarantine`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "returns"] }),
  });
}

export function useApproveReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, branchId, refundMethod, secondAuthEmail, secondAuthPin }: {
      id: number; branchId: number; refundMethod?: string; secondAuthEmail?: string; secondAuthPin?: string;
    }) =>
      apiPut<ReturnDto>(`/api/finance/returns/${id}/approve`, { branchId, refundMethod, secondAuthEmail, secondAuthPin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance", "returns"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "branch-stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "customers"] });
    },
  });
}
// BRD §3.2.1/§3.2.4: the return window and dual-authorization cash threshold — configured from the
// Returns & Refunds page itself, not the generic Admin Settings browser.
export type ReturnPolicyConfigDto = { dualAuthCashThreshold: number; standardWindowDays: number; surplusWindowDays: number };
export const useReturnPolicyConfig = (enabled = true) =>
  useQuery({
    queryKey: ["finance", "returns", "policy-config"],
    queryFn: () => apiGet<ReturnPolicyConfigDto>("/api/finance/returns/policy-config"),
    enabled,
  });
export function useUpdateReturnPolicyConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ReturnPolicyConfigDto) => apiPut<ReturnPolicyConfigDto>("/api/finance/returns/policy-config", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "returns", "policy-config"] }),
  });
}

export const useAccounts = (enabled = true) =>
  useQuery({
    queryKey: ["finance", "accounts"],
    queryFn: () => apiGet<AccountDto[]>("/api/finance/accounts"),
    enabled,
  });
export const useJournal = (enabled = true) =>
  useQuery({
    queryKey: ["finance", "journal"],
    queryFn: () => apiGet<JournalEntryDto[]>("/api/finance/journal"),
    enabled,
  });

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}

export function mapExpenses(rows: ExpenseDto[]): LiveTable {
  return {
    columns: [
      "Expense #",
      "Date",
      "Branch",
      "Category",
      "Description",
      "Vendor",
      "Amount",
      "VAT",
      "Method",
      "Status",
    ],
    statusCol: 9,
    ids: rows.map((e) => e.id),
    rows: rows.map((e) => [
      e.expenseNo,
      fmtDate(e.date),
      e.branchName,
      e.category,
      e.description,
      e.vendor ?? "—",
      fmtSar(e.amount),
      fmtSar(e.vat),
      e.method,
      e.status,
    ]),
  };
}

export function mapTaxCodes(rows: TaxCodeDto[]): LiveTable {
  return {
    columns: [
      "Code",
      "Name",
      "Type",
      "Rate",
      "Applies To",
      "Effective From",
      "GL Account",
      "Branch",
      "Status",
    ],
    statusCol: 8,
    ids: rows.map((t) => t.id),
    rows: rows.map((t) => [
      t.code,
      t.name,
      t.type,
      t.type === "Fee" ? fmtSar(t.rate) : `${t.rate}%`,
      t.appliesTo,
      fmtDate(t.effectiveFrom),
      t.glAccountCode ?? "—",
      t.branchName ?? "All Branches",
      t.status,
    ]),
  };
}

export function mapReturns(rows: ReturnDto[]): LiveTable {
  return {
    columns: [
      "Return #",
      "Order",
      "Customer",
      "Type",
      "Product",
      "Refund",
      "Reason",
      "Approved By",
      "Status",
      // Appended after Status (not inserted earlier) so this doesn't shift the indices the
      // Standard/Damaged/Surplus/Exchange tabs and status-pill rendering already key on.
      "Branch",
      "Cashier",
    ],
    statusCol: 8,
    ids: rows.map((r) => r.id),
    rows: rows.map((r) => [
      r.returnNo,
      r.orderNo ?? "—",
      r.customerName,
      r.type,
      r.lines.map((l) => l.productName).join(", ") || "—",
      fmtSar(r.totalAmount),
      r.reason,
      r.approvedByName ?? "—",
      r.status,
      r.branchName ?? "—",
      r.cashierName ?? "—",
    ]),
  };
}
