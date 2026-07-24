import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";
import type { LiveTable } from "./admin";

export type SupplierDto = {
  id: number; code: string; nameEn: string; nameAr: string | null; type: string; vatNo: string | null; phone: string | null;
  email: string | null; categories: string[]; terms: string; currency: string; leadTimeDays: number; iban: string | null; status: string;
};
export type UpsertSupplierRequest = {
  code: string; nameEn: string; nameAr: string | null; type: string; vatNo: string | null; phone: string | null; email: string | null;
  categories: string[]; terms: string; currency: string; leadTimeDays: number; iban: string | null;
};
export type SupplierLedgerLineDto = { date: string; reference: string; description: string; accountCode: string; accountName: string; debit: number; credit: number };

export type PurchaseOrderLineDto = {
  id: number; productId: number; sku: string; productName: string; branchId: number; branchName: string;
  warehouseId: number; warehouseName: string; qty: number; unitCost: number; receivedQty: number;
  batchNo: string | null; expiryDate: string | null;
};
export type PurchaseOrderDto = {
  id: number; poNo: string; supplierId: number; supplierName: string; branches: string[]; currency: string;
  expectedDate: string; status: string; shipping: number; incoterm: string | null; carrier: string | null; trackingRef: string | null;
  totalValue: number; receivedPct: number; lines: PurchaseOrderLineDto[];
};
export type PoLineInput = { productId: number; branchId: number; warehouseId: number; qty: number; unitCost: number; batchNo?: string | null; expiryDate?: string | null };
export type CreatePurchaseOrderRequest = {
  supplierId: number; currency: string; expectedDate: string; shipping: number; incoterm: string | null;
  approverUserId: number | null; lines: PoLineInput[];
};
export type ReceiveLineInput = { lineId: number; qty: number; batchNo?: string | null; expiryDate?: string | null };
export type ReceivePurchaseOrderRequest = { lines: ReceiveLineInput[] };

export type AuditHistoryEntryDto = { id: number; createdAt: string; event: string; userName: string | null; oldValue: string | null; newValue: string | null; reason: string | null };

export type RtsLineDto = { productId: number; sku: string; batchNo: string | null; qty: number; unitCost: number };
export type ReturnToSupplierDto = {
  id: number; rtsNo: string; supplierId: number; supplierName: string; purchaseOrderId: number | null; purchaseOrderNo: string | null;
  branchId: number; branchName: string; warehouseId: number; warehouseName: string;
  reason: string; date: string; creditNoteRef: string | null; carrier: string | null; status: string; lines: RtsLineDto[];
};
export type RtsLineInput = { productId: number; batchNo?: string | null; qty: number; unitCost: number };
export type CreateRtsRequest = {
  supplierId: number; purchaseOrderId: number | null; branchId: number; warehouseId: number;
  reason: string; date: string; carrier: string | null; lines: RtsLineInput[];
};

export const useSuppliers = (enabled = true) => useQuery({ queryKey: ["procurement", "suppliers"], queryFn: () => apiGet<SupplierDto[]>("/api/procurement/suppliers"), enabled });
export const usePurchaseOrders = (enabled = true) => useQuery({ queryKey: ["procurement", "purchase-orders"], queryFn: () => apiGet<PurchaseOrderDto[]>("/api/procurement/purchase-orders"), enabled });
export const useReturnsToSupplier = (enabled = true) => useQuery({ queryKey: ["procurement", "rts"], queryFn: () => apiGet<ReturnToSupplierDto[]>("/api/procurement/rts"), enabled });

export const useSupplierLedger = (id: number | undefined) =>
  useQuery({
    queryKey: ["procurement", "supplier-ledger", id],
    queryFn: () => apiGet<SupplierLedgerLineDto[]>(`/api/procurement/suppliers/${id}/ledger`),
    enabled: id !== undefined,
  });
export const usePurchaseOrderHistory = (id: number | undefined) =>
  useQuery({
    queryKey: ["procurement", "po-history", id],
    queryFn: () => apiGet<AuditHistoryEntryDto[]>(`/api/procurement/purchase-orders/${id}/history`),
    enabled: id !== undefined,
  });
export const useRtsHistory = (id: number | undefined) =>
  useQuery({
    queryKey: ["procurement", "rts-history", id],
    queryFn: () => apiGet<AuditHistoryEntryDto[]>(`/api/procurement/rts/${id}/history`),
    enabled: id !== undefined,
  });

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertSupplierRequest) => apiPost<SupplierDto>("/api/procurement/suppliers", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", "suppliers"] }),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertSupplierRequest }) => apiPut<SupplierDto>(`/api/procurement/suppliers/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", "suppliers"] }),
  });
}

export function useSetSupplierStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Active" | "Inactive" }) => apiPut<SupplierDto>(`/api/procurement/suppliers/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", "suppliers"] }),
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreatePurchaseOrderRequest) => apiPost<PurchaseOrderDto>("/api/procurement/purchase-orders", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-orders"] }),
  });
}

function invalidatePo(queryClient: ReturnType<typeof useQueryClient>, id: number) {
  queryClient.invalidateQueries({ queryKey: ["procurement", "purchase-orders"] });
  queryClient.invalidateQueries({ queryKey: ["procurement", "po-history", id] });
}

function usePoAction(action: "submit" | "cancel") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<PurchaseOrderDto>(`/api/procurement/purchase-orders/${id}/${action}`),
    onSuccess: (_data, id) => invalidatePo(queryClient, id),
  });
}
export const useSubmitPurchaseOrder = () => usePoAction("submit");
export const useCancelPurchaseOrder = () => usePoAction("cancel");

export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approverUserId }: { id: number; approverUserId: number | null }) =>
      apiPut<PurchaseOrderDto>(`/api/procurement/purchase-orders/${id}/approve`, { approverUserId }),
    onSuccess: (_data, { id }) => invalidatePo(queryClient, id),
  });
}

export function useDispatchPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, carrier, trackingRef }: { id: number; carrier: string | null; trackingRef: string | null }) =>
      apiPut<PurchaseOrderDto>(`/api/procurement/purchase-orders/${id}/dispatch`, { carrier, trackingRef }),
    onSuccess: (_data, { id }) => invalidatePo(queryClient, id),
  });
}

export function useReceivePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lines }: { id: number; lines: ReceiveLineInput[] }) =>
      apiPut<PurchaseOrderDto>(`/api/procurement/purchase-orders/${id}/receive`, { lines }),
    onSuccess: (_data, { id }) => {
      invalidatePo(queryClient, id);
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-batches"] });
    },
  });
}

export function useCreateRts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateRtsRequest) => apiPost<ReturnToSupplierDto>("/api/procurement/rts", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", "rts"] }),
  });
}

function invalidateRts(queryClient: ReturnType<typeof useQueryClient>, id: number) {
  queryClient.invalidateQueries({ queryKey: ["procurement", "rts"] });
  queryClient.invalidateQueries({ queryKey: ["procurement", "rts-history", id] });
}

function invalidateRtsStock(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
  queryClient.invalidateQueries({ queryKey: ["inventory", "stock-batches"] });
}

export function useDispatchRts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<ReturnToSupplierDto>(`/api/procurement/rts/${id}/dispatch`),
    onSuccess: (_data, id) => {
      invalidateRts(queryClient, id);
      invalidateRtsStock(queryClient);
    },
  });
}

export function useRejectRts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<ReturnToSupplierDto>(`/api/procurement/rts/${id}/reject`),
    onSuccess: (_data, id) => {
      invalidateRts(queryClient, id);
      invalidateRtsStock(queryClient);
    },
  });
}

export function useCancelRts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<ReturnToSupplierDto>(`/api/procurement/rts/${id}/cancel`),
    onSuccess: (_data, id) => invalidateRts(queryClient, id),
  });
}

export function useCreditRts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, creditNoteRef }: { id: number; creditNoteRef: string }) =>
      apiPut<ReturnToSupplierDto>(`/api/procurement/rts/${id}/credit`, { creditNoteRef }),
    onSuccess: (_data, { id }) => invalidateRts(queryClient, id),
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function mapSuppliers(rows: SupplierDto[]): LiveTable {
  return {
    columns: ["Code", "Supplier", "Category", "Contact", "VAT No.", "Terms", "Lead (days)", "Currency", "Status"],
    statusCol: 8,
    ids: rows.map((s) => s.id),
    rows: rows.map((s) => [
      s.code, s.nameEn, s.categories.join(", ") || "—", s.phone ?? s.email ?? "—", s.vatNo ?? "—", s.terms, s.leadTimeDays, s.currency, s.status,
    ]),
  };
}

export function mapPurchaseOrders(rows: PurchaseOrderDto[]): LiveTable {
  return {
    columns: ["PO #", "Supplier", "Branch(es)", "ETA", "Lines", "PO Value", "Received %", "Status"],
    statusCol: 7,
    ids: rows.map((p) => p.id),
    rows: rows.map((p) => [
      p.poNo, p.supplierName, p.branches.join(", ") || "—", fmtDate(p.expectedDate), p.lines.length,
      `${p.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`, `${p.receivedPct}%`, p.status,
    ]),
  };
}

export function mapRts(rows: ReturnToSupplierDto[]): LiveTable {
  return {
    columns: ["RTS #", "Supplier", "Branch", "Linked PO", "Reason", "Items", "Value (ر.س)", "Credit Note", "Created", "Status"],
    statusCol: 9,
    ids: rows.map((r) => r.id),
    rows: rows.map((r) => [
      r.rtsNo, r.supplierName, r.branchName, r.purchaseOrderNo ?? "—", r.reason, r.lines.reduce((s, l) => s + l.qty, 0),
      r.lines.reduce((s, l) => s + l.qty * l.unitCost, 0).toLocaleString("en-US", { maximumFractionDigits: 0 }),
      r.creditNoteRef ?? "—", fmtDate(r.date), r.status,
    ]),
  };
}
