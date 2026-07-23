import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";
import type { LiveTable } from "./admin";

export type StockLevelDto = {
  productId: number; sku: string; productName: string; categoryName: string; warehouseId: number; warehouseName: string;
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
};
export type StockTransferLineDto = { productId: number; sku: string; productName: string; qty: number; unitCost: number };
export type StockTransferDto = {
  id: number; transferNo: string; fromWarehouseId: number; fromWarehouseName: string; toWarehouseId: number; toWarehouseName: string;
  status: string; eta: string | null; carrier: string | null; notes: string | null; totalValue: number; lines: StockTransferLineDto[];
};
export type TransferLineInput = { productId: number; qty: number; unitCost: number };
export type CreateStockTransferRequest = {
  fromWarehouseId: number; toWarehouseId: number; eta: string | null; carrier: string | null; notes: string | null; lines: TransferLineInput[];
};

export const useWarehouses = (enabled = true) => useQuery({ queryKey: ["inventory", "warehouses"], queryFn: () => apiGet<WarehouseDto[]>("/api/inventory/warehouses"), enabled });
export const useStockLevels = (enabled = true) => useQuery({ queryKey: ["inventory", "stock-levels"], queryFn: () => apiGet<StockLevelDto[]>("/api/inventory/stock-levels"), enabled });
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

function useTransferAction(action: "approve" | "dispatch" | "receive") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPut<StockTransferDto>(`/api/inventory/transfers/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["catalog", "products"] });
    },
  });
}
export const useApproveTransfer = () => useTransferAction("approve");
export const useDispatchTransfer = () => useTransferAction("dispatch");
export const useReceiveTransfer = () => useTransferAction("receive");

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
    columns: ["Code", "Name", "Branch", "Type", "Bins", "Utilization", "Reservations", "Dispatch Ready", "Status"],
    statusCol: 8,
    rows: rows.map((w) => {
      const capacity = w.bins.reduce((sum, b) => sum + b.capacityTons, 0);
      const filled = w.bins.reduce((sum, b) => sum + b.filledTons, 0);
      const utilization = capacity > 0 ? `${Math.round((filled / capacity) * 100)}%` : "—";
      return [w.code, w.name, w.branchName, w.type, w.bins.length, utilization, w.reservationCount, w.dispatchReady ? "Yes" : "No", w.status];
    }),
  };
}

export function mapStockTransfers(rows: StockTransferDto[]): LiveTable {
  return {
    columns: ["Transfer #", "From", "To", "SKUs", "Qty", "Value (ر.س)", "ETA", "Status"],
    statusCol: 7,
    ids: rows.map((t) => t.id),
    rows: rows.map((t) => [
      t.transferNo, t.fromWarehouseName, t.toWarehouseName, t.lines.length, t.lines.reduce((s, l) => s + l.qty, 0),
      t.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 }), fmtDate(t.eta), t.status,
    ]),
    kpis: [
      { label: "Open Transfers", value: String(rows.filter((t) => t.status !== "Received" && t.status !== "Discrepancy").length), sub: `${rows.filter((t) => t.status === "InTransit").length} in transit`, tone: "info" },
      { label: "Awaiting Approval", value: String(rows.filter((t) => t.status === "Draft").length), sub: "Manager sign-off", tone: "warning" },
      { label: "Discrepancies", value: String(rows.filter((t) => t.status === "Discrepancy").length), sub: "Under investigation", tone: "critical" },
      { label: "Value In Transit", value: `${rows.filter((t) => t.status === "InTransit").reduce((s, t) => s + t.totalValue, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`, sub: "Currently moving", tone: "info" },
    ],
  };
}
