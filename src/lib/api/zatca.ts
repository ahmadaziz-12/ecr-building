import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";
import type { LiveTable } from "./admin";

// Model B (per-branch CSID): every branch is its own EGS device with its own identity/CSID/chain.
export type ZatcaIdentityDto = { branchId: number; branchName: string; egsSerial: string; environment: string; phase2Enabled: boolean; onboardingStatus: string; lastIcv: number; hasCsr: boolean; hasComplianceCsid: boolean; hasProductionCsid: boolean; csr: string | null };
export type ZatcaSettingsDto = { branchId: number; branchName: string; vatRegistrationNumber: string; sellerName: string; crNumber: string | null; street: string; city: string; postalCode: string; buildingNumber: string };
export type UpsertZatcaSettingsRequest = { branchId: number; vatRegistrationNumber: string; sellerName: string; crNumber: string | null; street: string; city: string; postalCode: string; buildingNumber: string };
export type ZatcaInvoiceDto = { id: number; orderId: number; orderNo: string; invoiceNumber: string; type: string; issueDate: string; totalAmount: number; taxAmount: number; icv: number; invoiceHash: string; qrCodeBase64: string | null; status: string; zatcaResponse: string | null };
export type ZatcaComplianceTestDto = { documentType: string; zatcaStatus: string; passed: boolean };
export type ZatcaProductionOnboardingResultDto = { identity: ZatcaIdentityDto; complianceTests: ZatcaComplianceTestDto[] };

export const useZatcaIdentities = (enabled = true) => useQuery({ queryKey: ["zatca", "identities"], queryFn: () => apiGet<ZatcaIdentityDto[]>("/api/zatca/identities"), enabled });
export const useZatcaIdentity = (branchId: number | null, enabled = true) =>
  useQuery({
    queryKey: ["zatca", "identity", branchId],
    queryFn: () => apiGet<ZatcaIdentityDto>(`/api/zatca/identity/${branchId}`),
    enabled: enabled && branchId !== null,
  });
export const useZatcaSettings = (enabled = true) => useQuery({ queryKey: ["zatca", "settings"], queryFn: () => apiGet<ZatcaSettingsDto[]>("/api/zatca/settings"), enabled });
export const useZatcaInvoices = (branchId?: number, enabled = true) =>
  useQuery({
    queryKey: ["zatca", "invoices", branchId ?? "all"],
    queryFn: () => apiGet<ZatcaInvoiceDto[]>(`/api/zatca/invoices${branchId ? `?branchId=${branchId}` : ""}`),
    enabled,
  });

export function useUpsertZatcaSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertZatcaSettingsRequest) => apiPut<ZatcaSettingsDto>("/api/zatca/settings", request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["zatca", "settings"] }),
  });
}

export function useGenerateZatcaCsr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branchId: number) => apiPost<ZatcaIdentityDto>(`/api/zatca/onboarding/${branchId}/csr`),
    onSuccess: (_, branchId) => {
      queryClient.invalidateQueries({ queryKey: ["zatca", "identity", branchId] });
      queryClient.invalidateQueries({ queryKey: ["zatca", "identities"] });
    },
  });
}

export function useZatcaComplianceCsid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, otp }: { branchId: number; otp: string }) =>
      apiPost<ZatcaIdentityDto>(`/api/zatca/onboarding/${branchId}/compliance-csid`, { otp }),
    onSuccess: (_, { branchId }) => {
      queryClient.invalidateQueries({ queryKey: ["zatca", "identity", branchId] });
      queryClient.invalidateQueries({ queryKey: ["zatca", "identities"] });
    },
  });
}

export function useZatcaProductionOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branchId: number) => apiPost<ZatcaProductionOnboardingResultDto>(`/api/zatca/onboarding/${branchId}/production-csid`),
    onSuccess: (_, branchId) => {
      queryClient.invalidateQueries({ queryKey: ["zatca", "identity", branchId] });
      queryClient.invalidateQueries({ queryKey: ["zatca", "identities"] });
    },
  });
}

export function useSetZatcaEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, environment }: { branchId: number; environment: string }) =>
      apiPut<ZatcaIdentityDto>(`/api/zatca/identity/${branchId}/environment`, { environment }),
    onSuccess: (_, { branchId }) => {
      queryClient.invalidateQueries({ queryKey: ["zatca", "identity", branchId] });
      queryClient.invalidateQueries({ queryKey: ["zatca", "identities"] });
    },
  });
}

export function useSubmitZatcaInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: number) => apiPost<ZatcaInvoiceDto>(`/api/zatca/invoices/${orderId}/submit`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["zatca", "invoices"] }),
  });
}

// Orders-module gate (not Finance) — any cashier can look up the invoice/QR for the receipt
// they just printed, regardless of whether their role can manage ZATCA settings.
export const useZatcaInvoiceByOrder = (orderId: number | undefined) =>
  useQuery({
    queryKey: ["zatca", "invoice-by-order", orderId],
    queryFn: () => apiGet<ZatcaInvoiceDto>(`/api/zatca/invoices/by-order/${orderId}`),
    enabled: !!orderId,
    retry: false,
  });

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function mapZatcaInvoices(rows: ZatcaInvoiceDto[]): LiveTable {
  return {
    columns: ["Invoice", "Order", "Type", "Amount", "VAT", "QR", "Hash / UUID", "Submitted", "Status"],
    statusCol: 8,
    ids: rows.map((i) => i.id),
    rows: rows.map((i) => [
      i.invoiceNumber, i.orderNo, i.type, `${i.totalAmount.toFixed(2)} ر.س`, `${i.taxAmount.toFixed(2)} ر.س`,
      i.qrCodeBase64 ? "OK" : "—", `${i.invoiceHash.slice(0, 4)}…${i.invoiceHash.slice(-4)}`, fmtDateTime(i.issueDate), i.status,
    ]),
  };
}
