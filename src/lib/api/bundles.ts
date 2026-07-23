import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";
import type { LiveTable } from "./admin";

export type BundleLineDto = { productId: number; sku: string; productName: string; qty: number; unitCost: number };
export type BundleDto = {
  id: number; code: string; nameEn: string; nameAr: string | null; bundlePrice: number; componentCost: number;
  status: string; lines: BundleLineDto[];
};

export const useBundles = (enabled = true) =>
  useQuery({ queryKey: ["catalog", "bundles"], queryFn: () => apiGet<BundleDto[]>("/api/catalog/bundles"), enabled });

export type BundleLineInput = { productId: number; qty: number };
export type UpsertBundleRequest = { code: string; nameEn: string; nameAr: string | null; bundlePrice: number; lines: BundleLineInput[] };

export function useCreateBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertBundleRequest) => apiPost<BundleDto>("/api/catalog/bundles", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "bundles"] }),
  });
}

export function useUpdateBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertBundleRequest }) => apiPut<BundleDto>(`/api/catalog/bundles/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "bundles"] }),
  });
}

export function useSetBundleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Active" | "Inactive" }) => apiPut<BundleDto>(`/api/catalog/bundles/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "bundles"] }),
  });
}

export function mapBundles(rows: BundleDto[]): LiveTable {
  return {
    columns: ["Code", "Bundle", "Components", "Component Cost (ر.س)", "Bundle Price (ر.س)", "Margin", "Status"],
    statusCol: 6,
    ids: rows.map((b) => b.id),
    rows: rows.map((b) => {
      const margin = b.bundlePrice > 0 ? `${Math.round(((b.bundlePrice - b.componentCost) / b.bundlePrice) * 100)}%` : "—";
      return [
        b.code, `${b.nameEn}${b.nameAr ? ` / ${b.nameAr}` : ""}`, `${b.lines.length} SKUs`,
        b.componentCost.toFixed(2), b.bundlePrice.toFixed(2), margin, b.status,
      ];
    }),
    kpis: [
      { label: "Active Bundles", value: String(rows.filter((b) => b.status === "Active").length), sub: `${rows.length} total`, tone: "success" },
      { label: "Avg Components", value: rows.length ? (rows.reduce((s, b) => s + b.lines.length, 0) / rows.length).toFixed(1) : "0", sub: "Per bundle", tone: "info" },
      { label: "Avg Margin", value: rows.length ? `${Math.round(rows.reduce((s, b) => s + (b.bundlePrice > 0 ? (b.bundlePrice - b.componentCost) / b.bundlePrice : 0), 0) / rows.length * 100)}%` : "—", sub: "Bundle price vs cost", tone: "success" },
      { label: "Total Bundle Value", value: rows.reduce((s, b) => s + b.bundlePrice, 0).toLocaleString("en-US", { maximumFractionDigits: 0 }), sub: "Sum of bundle prices", tone: "info" },
    ],
  };
}
