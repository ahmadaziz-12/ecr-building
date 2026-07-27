import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";

// Automatic Stock Count — typed client for backend StockCountsController
// (api/inventory/stock-counts/*). A session is generated from live stock, counted by keyboard or
// barcode, submitted for review, then posted; posting writes one StockAdjustment and the matching
// StockMovements, so a stocktake reconciles through the same ledger as any other correction.

export type StockCountLineDto = {
  id: number;
  productId: number;
  sku: string;
  productName: string;
  categoryName: string;
  uom: string;
  binLocation: string | null;
  barcode: string | null;
  /** Null on a blind count until the sheet is posted — the server withholds it, not just the UI. */
  systemQty: number | null;
  countedQty: number | null;
  variance: number | null;
  varianceValue: number | null;
  unitCost: number;
  note: string | null;
  countedAt: string | null;
  status: "Uncounted" | "Matched" | "Overage" | "Shortage";
};

export type StockCountDto = {
  id: number;
  countNo: string;
  warehouseId: number;
  warehouseName: string;
  branchId: number;
  branchName: string;
  scope: string;
  categoryId: number | null;
  categoryName: string | null;
  status: "Draft" | "InProgress" | "PendingApproval" | "Completed" | "Cancelled";
  scheduledFor: string;
  startedAt: string | null;
  completedAt: string | null;
  countedByName: string | null;
  approvedByName: string | null;
  notes: string | null;
  autoFillUncounted: boolean;
  blindCount: boolean;
  stockAdjustmentId: number | null;
  lineCount: number;
  countedLines: number;
  varianceLines: number;
  netVarianceQty: number;
  netVarianceValue: number;
  absVarianceValue: number;
  accuracyPct: number;
  lines: StockCountLineDto[];
};

export type StockCountScope = "FullWarehouse" | "Category" | "LowStock" | "HighValue" | "FastMoving";

export type GenerateStockCountRequest = {
  warehouseId: number;
  scope: StockCountScope;
  categoryId?: number | null;
  scheduledFor?: string | null;
  notes?: string | null;
  autoFillUncounted?: boolean;
  blindCount?: boolean;
  includeZeroStock?: boolean;
  topN?: number | null;
};

export type StockCountLineInput = { lineId: number; countedQty: number | null; note?: string | null };
export type StockCountListFilters = {
  warehouseId?: number;
  branchId?: number;
  status?: string;
  from?: string;
  to?: string;
};

const base = "/api/inventory/stock-counts";
const listKey = (filters: StockCountListFilters) => ["inventory", "stock-counts", filters] as const;

function qs(filters: StockCountListFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && value !== null) params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const useStockCounts = (filters: StockCountListFilters = {}, enabled = true) =>
  useQuery({
    queryKey: listKey(filters),
    queryFn: () => apiGet<StockCountDto[]>(`${base}${qs(filters)}`),
    enabled,
  });

export const useStockCount = (id: number | null) =>
  useQuery({
    queryKey: ["inventory", "stock-count", id],
    queryFn: () => apiGet<StockCountDto>(`${base}/${id}`),
    enabled: id !== null,
  });

// Every mutation returns the whole refreshed session, so the cached detail is seeded from the
// response instead of waiting on a refetch — counting is a tight keyboard loop and a round-trip
// of latency per line is the difference between usable and not.
function useStockCountMutation<TArgs>(fn: (args: TArgs) => Promise<StockCountDto>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      queryClient.setQueryData(["inventory", "stock-count", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-counts"] });
    },
  });
}

export const useGenerateStockCount = () =>
  useStockCountMutation((request: GenerateStockCountRequest) => apiPost<StockCountDto>(`${base}/generate`, request));

export const useSaveStockCountLines = () =>
  useStockCountMutation(({ id, lines }: { id: number; lines: StockCountLineInput[] }) =>
    apiPut<StockCountDto>(`${base}/${id}/lines`, { lines }),
  );

export const useScanStockCount = () =>
  useStockCountMutation(({ id, code, qty = 1, increment = true }: { id: number; code: string; qty?: number; increment?: boolean }) =>
    apiPost<StockCountDto>(`${base}/${id}/scan`, { code, qty, increment }),
  );

export const useAutoFillStockCount = () =>
  useStockCountMutation(({ id }: { id: number }) => apiPost<StockCountDto>(`${base}/${id}/auto-fill`));

export const useSubmitStockCount = () =>
  useStockCountMutation(({ id }: { id: number }) => apiPost<StockCountDto>(`${base}/${id}/submit`));

export function usePostStockCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approverUserId, notes }: { id: number; approverUserId?: number | null; notes?: string | null }) =>
      apiPost<StockCountDto>(`${base}/${id}/post`, { approverUserId: approverUserId ?? null, notes: notes ?? null }),
    onSuccess: (data) => {
      queryClient.setQueryData(["inventory", "stock-count", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-counts"] });
      // Posting rewrites both stock pools and appends to the movement ledger — every view of stock
      // is now stale, not just the count itself.
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "branch-stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}

export const useCancelStockCount = () =>
  useStockCountMutation(({ id }: { id: number }) => apiPost<StockCountDto>(`${base}/${id}/cancel`));
