import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import type { LiveTable } from "./admin";

export type StockLevelDto = {
  productId: number; sku: string; productName: string; categoryName: string; warehouseId: number; warehouseName: string;
  onHand: number; reserved: number; available: number; reorderLevel: number; value: number; status: string;
};
export type BranchStockLevelDto = {
  productId: number; sku: string; productName: string; categoryName: string; branchId: number; branchName: string;
  onHand: number; reserved: number; available: number; reorderLevel: number; value: number; status: string;
};
export type StockBatchDto = {
  id: number; sku: string; productName: string; batchNo: string; receivedDate: string; expiryDate: string;
  daysLeft: number; qty: number; warehouseName: string; status: string;
};
export type WarehouseBinDto = { id: number; binCode: string; label: string; capacityTons: number; filledTons: number };
export type WarehouseDto = {
  id: number; code: string; name: string; branchId: number; branchName: string; type: string; status: string;
  bins: WarehouseBinDto[]; reservationCount: number; dispatchReady: boolean;
  stockValue: number; skuCount: number; lowStockCount: number; openTransfersOut: number; openTransfersIn: number; activeBatchCount: number;
};
export type StockTransferLineDto = {
  id: number; productId: number; sku: string; productName: string; qty: number; unitCost: number;
  receivedQty: number; discrepancy: number; batchNo: string | null; expiryDate: string | null;
};
export type StockTransferDto = {
  id: number; transferNo: string;
  fromWarehouseId: number | null; fromWarehouseName: string | null; fromBranchId: number | null; fromBranchName: string | null;
  toWarehouseId: number | null; toWarehouseName: string | null; toBranchId: number | null; toBranchName: string | null;
  sourceLabel: string; destLabel: string;
  status: string; eta: string | null; carrier: string | null; notes: string | null;
  approverUserId: number | null; approverName: string | null; totalValue: number; lines: StockTransferLineDto[];
};
export type TransferLineInput = { productId: number; qty: number; unitCost: number; batchNo?: string | null; expiryDate?: string | null };
export type CreateStockTransferRequest = {
  fromWarehouseId: number | null; fromBranchId: number | null; toWarehouseId: number | null; toBranchId: number | null;
  eta: string | null; carrier: string | null; notes: string | null; lines: TransferLineInput[];
};
export type ReceiveTransferLineInput = { lineId: number; receivedQty: number };

export const useWarehouses = (enabled = true) => useQuery({ queryKey: ["inventory", "warehouses"], queryFn: () => apiGet<WarehouseDto[]>("/api/inventory/warehouses"), enabled });

export type UpsertWarehouseRequest = { code: string; name: string; branchId: number; type: string };
export type UpdateWarehouseRequest = UpsertWarehouseRequest & { status: string };
export type CreateWarehouseBinRequest = { binCode: string; label: string; capacityTons: number };

export function useCreateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertWarehouseRequest) => apiPost<WarehouseDto>("/api/inventory/warehouses", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "warehouses"] }),
  });
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpdateWarehouseRequest }) =>
      apiPut<WarehouseDto>(`/api/inventory/warehouses/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "warehouses"] }),
  });
}

export function useSetWarehouseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiPut<WarehouseDto>(`/api/inventory/warehouses/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "warehouses"] }),
  });
}

export function useCreateWarehouseBin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ warehouseId, request }: { warehouseId: number; request: CreateWarehouseBinRequest }) =>
      apiPost<WarehouseDto>(`/api/inventory/warehouses/${warehouseId}/bins`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "warehouses"] }),
  });
}

export function useDeleteWarehouseBin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ warehouseId, binId }: { warehouseId: number; binId: number }) =>
      apiDelete<WarehouseDto>(`/api/inventory/warehouses/${warehouseId}/bins/${binId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "warehouses"] }),
  });
}
export const useStockLevels = (enabled = true) => useQuery({ queryKey: ["inventory", "stock-levels"], queryFn: () => apiGet<StockLevelDto[]>("/api/inventory/stock-levels"), enabled });
export const useBranchStockLevels = (enabled = true) => useQuery({ queryKey: ["inventory", "branch-stock-levels"], queryFn: () => apiGet<BranchStockLevelDto[]>("/api/inventory/branch-stock-levels"), enabled });
export const useStockBatches = (enabled = true) => useQuery({ queryKey: ["inventory", "stock-batches"], queryFn: () => apiGet<StockBatchDto[]>("/api/inventory/stock-batches"), enabled });
export const useStockTransfers = (enabled = true) => useQuery({ queryKey: ["inventory", "transfers"], queryFn: () => apiGet<StockTransferDto[]>("/api/inventory/transfers"), enabled });

export type CreateStockBatchRequest = { productId: number; warehouseId: number; batchNo: string; receivedDate: string; expiryDate: string; qty: number };

export function useCreateStockBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateStockBatchRequest) => apiPost<StockBatchDto>("/api/inventory/stock-batches", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "stock-batches"] }),
  });
}

function useBatchAction(action: "quarantine" | "write-off" | "move-to-promo") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<StockBatchDto>(`/api/inventory/stock-batches/${id}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "stock-batches"] }),
  });
}
export const useQuarantineBatch = () => useBatchAction("quarantine");
export const useWriteOffBatch = () => useBatchAction("write-off");
export const usePromoBatch = () => useBatchAction("move-to-promo");

function invalidateTransfers(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["inventory", "transfers"] });
  queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
  queryClient.invalidateQueries({ queryKey: ["inventory", "branch-stock-levels"] });
  queryClient.invalidateQueries({ queryKey: ["inventory", "stock-batches"] });
  queryClient.invalidateQueries({ queryKey: ["inventory", "warehouses"] });
  queryClient.invalidateQueries({ queryKey: ["catalog", "products"] });
}

function useTransferAction(action: "submit" | "dispatch" | "cancel") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<StockTransferDto>(`/api/inventory/transfers/${id}/${action}`),
    onSuccess: () => invalidateTransfers(queryClient),
  });
}
export const useSubmitTransfer = () => useTransferAction("submit");
export const useDispatchTransfer = () => useTransferAction("dispatch");
export const useCancelTransfer = () => useTransferAction("cancel");

export function useApproveTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approverUserId }: { id: number; approverUserId: number | null }) =>
      apiPut<StockTransferDto>(`/api/inventory/transfers/${id}/approve`, { approverUserId }),
    onSuccess: () => invalidateTransfers(queryClient),
  });
}

export function useReceiveTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lines }: { id: number; lines: ReceiveTransferLineInput[] }) =>
      apiPut<StockTransferDto>(`/api/inventory/transfers/${id}/receive`, { lines }),
    onSuccess: () => invalidateTransfers(queryClient),
  });
}

export function useCreateStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateStockTransferRequest) => apiPost<StockTransferDto>("/api/inventory/transfers", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "transfers"] }),
  });
}

export type CreateStockAdjustmentLineInput = { productId: number; systemQty: number; countedQty: number; note?: string | null };
export type CreateStockAdjustmentRequest = {
  reason: string; warehouseId: number; date: string; approverUserId?: number | null; evidenceAttached: boolean;
  lines: CreateStockAdjustmentLineInput[];
};
export type StockAdjustmentDto = {
  id: number; reason: string; warehouseId: number; warehouseName: string; date: string; approverName: string | null;
  evidenceAttached: boolean; status: string;
};

export function useCreateStockAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateStockAdjustmentRequest) => apiPost<StockAdjustmentDto>("/api/inventory/adjustments", request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["catalog", "products"] });
    },
  });
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function mapStockLevels(rows: StockLevelDto[]): LiveTable {
  return {
    columns: ["SKU", "Product", "Category", "Warehouse", "On Hand", "Reserved", "Available", "Reorder", "Value (ر.س)", "Status"],
    statusCol: 9,
    rows: rows.map((s) => [
      s.sku, s.productName, s.categoryName, s.warehouseName, s.onHand, s.reserved, s.available, s.reorderLevel,
      s.value.toLocaleString("en-US", { maximumFractionDigits: 0 }), s.status,
    ]),
    kpis: [
      { label: "Healthy", value: String(rows.filter((s) => s.status === "Healthy").length), sub: `${rows.length} lines`, tone: "success" },
      { label: "Low Stock", value: String(rows.filter((s) => s.status === "Low").length), sub: "Approaching reorder", tone: "warning" },
      { label: "Critical / Out", value: String(rows.filter((s) => s.status === "Critical").length), sub: "Reorder now", tone: "critical" },
      { label: "Stock Value", value: `${rows.reduce((sum, s) => sum + s.value, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`, sub: "At cost, all warehouses", tone: "info" },
    ],
  };
}

export function mapBranchStockLevels(rows: BranchStockLevelDto[]): LiveTable {
  return {
    columns: ["SKU", "Product", "Category", "Branch", "On Hand", "Reserved", "Available", "Reorder", "Value (ر.س)", "Status"],
    statusCol: 9,
    rows: rows.map((s) => [
      s.sku, s.productName, s.categoryName, s.branchName, s.onHand, s.reserved, s.available, s.reorderLevel,
      s.value.toLocaleString("en-US", { maximumFractionDigits: 0 }), s.status,
    ]),
    kpis: [
      { label: "Healthy", value: String(rows.filter((s) => s.status === "Healthy").length), sub: `${rows.length} lines`, tone: "success" },
      { label: "Low Stock", value: String(rows.filter((s) => s.status === "Low").length), sub: "Approaching reorder", tone: "warning" },
      { label: "Critical / Out", value: String(rows.filter((s) => s.status === "Critical").length), sub: "Can't be sold right now", tone: "critical" },
      { label: "Stock Value", value: `${rows.reduce((sum, s) => sum + s.value, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`, sub: "At cost, all branches", tone: "info" },
    ],
  };
}

export function mapStockBatches(rows: StockBatchDto[]): LiveTable {
  return {
    columns: ["SKU", "Product", "Batch", "Received", "Expires", "Days Left", "Qty", "Warehouse", "Status"],
    statusCol: 8,
    ids: rows.map((b) => b.id),
    rows: rows.map((b) => [b.sku, b.productName, b.batchNo, fmtDate(b.receivedDate), fmtDate(b.expiryDate), b.daysLeft, b.qty, b.warehouseName, b.status]),
    kpis: [
      { label: "Batch-Tracked SKUs", value: String(rows.length), sub: `${new Set(rows.map((b) => b.sku)).size} distinct SKUs`, tone: "info" },
      { label: "Expiring ≤ 30 days", value: String(rows.filter((b) => b.daysLeft >= 0 && b.daysLeft <= 30).length), sub: "Move to promo", tone: "warning" },
      { label: "Expired / Written Off", value: String(rows.filter((b) => b.status === "Expired" || b.status === "WrittenOff").length), sub: "Write-off pending", tone: "critical" },
      { label: "Quarantine", value: String(rows.filter((b) => b.status === "Quarantine").length), sub: "QC review", tone: "warning" },
    ],
  };
}

export function mapWarehouses(rows: WarehouseDto[]): LiveTable {
  return {
    columns: [
      "Code", "Name", "Branch", "Type", "Bins", "Utilization", "Stock Value (ر.س)", "SKUs", "Low Stock",
      "Active Batches", "Transfers Out", "Transfers In", "Status",
    ],
    statusCol: 12,
    ids: rows.map((w) => w.id),
    rows: rows.map((w) => {
      const capacity = w.bins.reduce((sum, b) => sum + b.capacityTons, 0);
      const filled = w.bins.reduce((sum, b) => sum + b.filledTons, 0);
      const utilization = capacity > 0 ? `${Math.round((filled / capacity) * 100)}%` : "—";
      return [
        w.code, w.name, w.branchName, w.type, w.bins.length, utilization,
        w.stockValue.toLocaleString("en-US", { maximumFractionDigits: 0 }), w.skuCount, w.lowStockCount,
        w.activeBatchCount, w.openTransfersOut, w.openTransfersIn, w.status,
      ];
    }),
    kpis: [
      { label: "Warehouses", value: String(rows.length), sub: `${rows.filter((w) => w.status === "Active").length} active`, tone: "info" },
      { label: "Total Stock Value", value: `${rows.reduce((s, w) => s + w.stockValue, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`, sub: "At cost, all warehouses", tone: "info" },
      { label: "Low Stock Lines", value: String(rows.reduce((s, w) => s + w.lowStockCount, 0)), sub: "Across all warehouses", tone: "warning" },
      { label: "Open Transfers", value: String(rows.reduce((s, w) => s + w.openTransfersOut + w.openTransfersIn, 0)), sub: "In + out, not yet received", tone: "info" },
    ],
  };
}

export function mapStockTransfers(rows: StockTransferDto[]): LiveTable {
  return {
    columns: ["Transfer #", "From", "To", "SKUs", "Qty", "Value (ر.س)", "Approver", "ETA", "Status"],
    statusCol: 8,
    ids: rows.map((t) => t.id),
    rows: rows.map((t) => [
      t.transferNo, t.sourceLabel, t.destLabel, t.lines.length, t.lines.reduce((s, l) => s + l.qty, 0),
      t.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 }), t.approverName ?? "—", fmtDate(t.eta), t.status,
    ]),
    kpis: [
      { label: "Open Transfers", value: String(rows.filter((t) => t.status !== "Received" && t.status !== "Cancelled").length), sub: `${rows.filter((t) => t.status === "InTransit").length} in transit`, tone: "info" },
      { label: "Awaiting Approval", value: String(rows.filter((t) => t.status === "PendingApproval").length), sub: "Manager sign-off", tone: "warning" },
      { label: "Discrepancies", value: String(rows.filter((t) => t.status === "Received" && t.lines.some((l) => l.discrepancy !== 0)).length), sub: "Short or over-received", tone: "critical" },
      { label: "Value In Transit", value: `${rows.filter((t) => t.status === "InTransit").reduce((s, t) => s + t.totalValue, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`, sub: "Currently moving", tone: "info" },
    ],
  };
}
