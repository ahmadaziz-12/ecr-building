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
};
export type ReturnLineDto = {
  productId: number;
  sku: string;
  productName: string;
  qty: number;
  amount: number;
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

export type CreateReturnLineInput = { productId: number; qty: number; amount: number };
export type CreateReturnRequest = {
  orderId: number | null;
  customerId: number | null;
  type: string;
  reason: string;
  lines: CreateReturnLineInput[];
};
export function useCreateReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateReturnRequest) =>
      apiPost<ReturnDto>("/api/finance/returns", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "returns"] }),
  });
}
export function useApproveReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, warehouseId }: { id: number; warehouseId: number }) =>
      apiPut<ReturnDto>(`/api/finance/returns/${id}/approve`, { warehouseId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance", "returns"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "customers"] });
    },
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
      "Status",
    ],
    statusCol: 7,
    rows: rows.map((t) => [
      t.code,
      t.name,
      t.type,
      t.type === "Fee" ? fmtSar(t.rate) : `${t.rate}%`,
      t.appliesTo,
      fmtDate(t.effectiveFrom),
      t.glAccountCode ?? "—",
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
    ],
    statusCol: 8,
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
    ]),
  };
}
