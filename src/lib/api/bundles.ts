import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";
import { byStatus, type LiveTable } from "./admin";

export type BundleLineDto = {
  productId: number;
  sku: string;
  productName: string;
  qty: number;
  unitCost: number;
  sellingPrice: number;
  vatRate: number;
  barcode: string | null;
};
export type BundleDto = {
  id: number;
  code: string;
  nameEn: string;
  nameAr: string | null;
  bundlePrice: number;
  componentCost: number;
  // Raw persisted lifecycle value (Draft/PendingApproval/Active/Inactive/Archived) — prefer
  // effectiveStatus for anything user-facing (POS eligibility, status badges).
  status: string;
  lines: BundleLineDto[];
  // Module 8 (BRD §5): bundle type + individual price total — the POS card shows the savings from these.
  type: string;
  individualTotal: number;
  // Phase 4 (BRD §5.7 Business Controls): what status ACTUALLY means right now — Scheduled/Active/
  // Expired are computed from status=="Active" + startDate/endDate, never persisted as their own value.
  effectiveStatus: string;
  startDate: string | null;
  endDate: string | null;
  // Empty array = no restriction (every customer type / every branch is eligible).
  eligibleCustomerTypes: string[];
  eligibleBranchIds: number[];
  stackableDiscount: boolean;
};

export const useBundles = (enabled = true) =>
  useQuery({
    queryKey: ["catalog", "bundles"],
    queryFn: () => apiGet<BundleDto[]>("/api/catalog/bundles"),
    enabled,
  });

export type BundleLineInput = { productId: number; qty: number };
export type UpsertBundleRequest = {
  code: string;
  nameEn: string;
  nameAr: string | null;
  bundlePrice: number;
  lines: BundleLineInput[];
  type: string;
  // Phase 4: Create-only — true submits straight into the approval queue instead of saving as Draft.
  publish?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  eligibleCustomerTypes?: string[];
  eligibleBranchIds?: number[];
  stackableDiscount?: boolean;
};

export function useCreateBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertBundleRequest) =>
      apiPost<BundleDto>("/api/catalog/bundles", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "bundles"] }),
  });
}

export function useUpdateBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertBundleRequest }) =>
      apiPut<BundleDto>(`/api/catalog/bundles/${id}`, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "bundles"] }),
  });
}

// Phase 4 (BRD §5.7): the lifecycle transitions BundlesController.SetStatus actually accepts —
// Draft->PendingApproval (submit), PendingApproval->Draft (send back), PendingApproval->Active
// (approve — blocked server-side for the bundle's own creator unless they hold Approve permission),
// Active<->Inactive (disable/re-enable), and any non-Archived state -> Archived (terminal).
export type BundleStatus = "Draft" | "PendingApproval" | "Active" | "Inactive" | "Archived";

export function useSetBundleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: BundleStatus }) =>
      apiPut<BundleDto>(`/api/catalog/bundles/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["catalog", "bundles"] }),
  });
}

// Phase 5 (BRD §5.5/§5.8): fire-and-forget impressions feeding the Suggestion Report — no cache
// invalidation, nothing in the UI reads this data back in the same session.
export type BundleSuggestionEventType = "Shown" | "Accepted" | "Rejected";
export function useLogBundleSuggestionEvent() {
  return useMutation({
    mutationFn: ({
      bundleId,
      eventType,
      branchId,
    }: {
      bundleId: number;
      eventType: BundleSuggestionEventType;
      branchId: number | null;
    }) => apiPost(`/api/catalog/bundles/${bundleId}/suggestion-events`, { eventType, branchId }),
  });
}

export function mapBundles(rows: BundleDto[]): LiveTable {
  return {
    columns: [
      "Code",
      "Bundle",
      "Components",
      "Component Cost (ر.س)",
      "Bundle Price (ر.س)",
      "Margin",
      "Status",
    ],
    statusCol: 6,
    ids: rows.map((b) => b.id),
    rows: rows.map((b) => {
      const margin =
        b.bundlePrice > 0
          ? `${Math.round(((b.bundlePrice - b.componentCost) / b.bundlePrice) * 100)}%`
          : "—";
      return [
        b.code,
        `${b.nameEn}${b.nameAr ? ` / ${b.nameAr}` : ""}`,
        `${b.lines.length} SKUs`,
        b.componentCost.toFixed(2),
        b.bundlePrice.toFixed(2),
        margin,
        // Phase 4 (BRD §5.7): the grid shows what status ACTUALLY means right now (Scheduled/
        // Active/Expired computed from dates), not just the raw persisted lifecycle value.
        b.effectiveStatus,
      ];
    }),
    kpis: [
      {
        label: "Active Bundles",
        value: String(rows.filter((b) => b.effectiveStatus === "Active").length),
        sub: `${rows.length} total`,
        tone: "success",
        filter: byStatus(6, "Active"),
      },
      {
        label: "Avg Components",
        value: rows.length
          ? (rows.reduce((s, b) => s + b.lines.length, 0) / rows.length).toFixed(1)
          : "0",
        sub: "Per bundle",
        tone: "info",
      },
      {
        label: "Avg Margin",
        value: rows.length
          ? `${Math.round((rows.reduce((s, b) => s + (b.bundlePrice > 0 ? (b.bundlePrice - b.componentCost) / b.bundlePrice : 0), 0) / rows.length) * 100)}%`
          : "—",
        sub: "Bundle price vs cost",
        tone: "success",
      },
      {
        label: "Total Bundle Value",
        value: rows
          .reduce((s, b) => s + b.bundlePrice, 0)
          .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        sub: "Sum of bundle prices",
        tone: "info",
      },
    ],
  };
}
