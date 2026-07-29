import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";

// Serial Number Tracking (electrical tools, equipment, warranty items): one row per physical unit —
// registered manually (or at receiving), consumed by checkout linking it to the order/line that sold
// it, and looked up later by serial number for warranty/support.
export type SerializedUnitDto = {
  id: number;
  productId: number;
  sku: string;
  productName: string;
  serialNo: string;
  status: string;
  branchId: number;
  branchName: string;
  receivedDate: string;
  soldOrderId: number | null;
  soldOrderNo: string | null;
  warrantyExpiresAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type RegisterSerializedUnitsRequest = {
  productId: number;
  branchId: number;
  serialNumbers: string[];
  warrantyExpiresAt?: string | null;
  notes?: string | null;
};

const KEY = ["inventory", "serials"] as const;

export function useSerializedUnits(
  filters: { productId?: number; branchId?: number; status?: string; search?: string } = {},
  enabled = true,
) {
  const params = new URLSearchParams();
  if (filters.productId) params.set("productId", String(filters.productId));
  if (filters.branchId) params.set("branchId", String(filters.branchId));
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  const qs = params.toString();
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () => apiGet<SerializedUnitDto[]>(`/api/inventory/serials${qs ? `?${qs}` : ""}`),
    enabled,
  });
}

// Warranty/support lookup — find the exact unit (and which order it was sold on) by its serial.
export function useSerialLookup(serialNo: string, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "lookup", serialNo],
    queryFn: () => apiGet<SerializedUnitDto>(`/api/inventory/serials/${encodeURIComponent(serialNo)}`),
    enabled: enabled && serialNo.trim().length > 0,
    retry: false,
  });
}

export function useRegisterSerials() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RegisterSerializedUnitsRequest) => apiPost<SerializedUnitDto[]>("/api/inventory/serials", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateSerialStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes?: string }) =>
      apiPut<SerializedUnitDto>(`/api/inventory/serials/${id}/status`, { status, notes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
