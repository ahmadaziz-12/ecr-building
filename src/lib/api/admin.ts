import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import type { CashierShiftDto } from "./pos";

export type UserDto = {
  id: number; name: string; email: string; roleId: number; roleName: string;
  branchId: number | null; branchName: string | null; status: string; preferredLocale: string; lastLoginAt: string | null;
  hasPin: boolean; biometricEnabled: boolean;
};
export type ModulePermissionEntry = { module: string; level: string };

// Mirrors BRD §10.1's Cashier→Senior Cashier→Supervisor→Store Manager→System Admin ladder — see
// backend Role.cs / PosTier presets in DbSeeder.cs. A null ceiling means "no cap".
export type PosCeilingsDto = {
  discountCeilingPercent: number | null;
  surplusReturnCeilingAmount: number | null;
  canAuthorizeStandardReturnWithoutReceipt: boolean;
  canOverrideItemPrice: boolean;
  canAuthorizeDamagedReturns: boolean;
  canVoidTransactions: boolean;
  canViewXReport: boolean;
  canViewZReport: boolean;
  canConfigureReturnRulesAndFees: boolean;
  canManagePriceListAndUsers: boolean;
  canManageSystemConfiguration: boolean;
};

export type RoleDto = {
  id: number; name: string; description: string | null; approvalCap: number; isSystem: boolean;
  status: string; userCount: number; permissions: ModulePermissionEntry[]; posCeilings: PosCeilingsDto;
};

const NO_POS_CEILINGS: PosCeilingsDto = {
  discountCeilingPercent: 0, surplusReturnCeilingAmount: 0, canAuthorizeStandardReturnWithoutReceipt: false,
  canOverrideItemPrice: false, canAuthorizeDamagedReturns: false, canVoidTransactions: false, canViewXReport: false,
  canViewZReport: false, canConfigureReturnRulesAndFees: false, canManagePriceListAndUsers: false, canManageSystemConfiguration: false,
};

export const POS_TIER_PRESETS: Record<string, PosCeilingsDto> = {
  "None (no POS authorization)": NO_POS_CEILINGS,
  Cashier: { ...NO_POS_CEILINGS, discountCeilingPercent: 5, surplusReturnCeilingAmount: 500 },
  "Senior Cashier": {
    ...NO_POS_CEILINGS, discountCeilingPercent: 10, surplusReturnCeilingAmount: 1_000,
    canAuthorizeStandardReturnWithoutReceipt: true, canOverrideItemPrice: true,
  },
  Supervisor: {
    ...NO_POS_CEILINGS, discountCeilingPercent: 15, surplusReturnCeilingAmount: null,
    canAuthorizeStandardReturnWithoutReceipt: true, canOverrideItemPrice: true, canAuthorizeDamagedReturns: true,
    canVoidTransactions: true, canViewXReport: true,
  },
  "Store Manager": {
    ...NO_POS_CEILINGS, discountCeilingPercent: null, surplusReturnCeilingAmount: null,
    canAuthorizeStandardReturnWithoutReceipt: true, canOverrideItemPrice: true, canAuthorizeDamagedReturns: true,
    canVoidTransactions: true, canViewXReport: true, canViewZReport: true, canConfigureReturnRulesAndFees: true,
    canManagePriceListAndUsers: true,
  },
  "System Admin": {
    ...NO_POS_CEILINGS, discountCeilingPercent: null, surplusReturnCeilingAmount: null,
    canAuthorizeStandardReturnWithoutReceipt: true, canOverrideItemPrice: true, canAuthorizeDamagedReturns: true,
    canVoidTransactions: true, canViewXReport: true, canViewZReport: true, canConfigureReturnRulesAndFees: true,
    canManagePriceListAndUsers: true, canManageSystemConfiguration: true,
  },
};

export function posCeilingsFromTier(tier: string | undefined): PosCeilingsDto {
  return POS_TIER_PRESETS[tier ?? ""] ?? NO_POS_CEILINGS;
}

// Best-match reverse lookup for prefilling the Edit Role form's POS Tier select from a role's stored
// ceilings — falls back to the closest preset by shared field count rather than requiring an exact
// match, since a role's ceilings could in principle be hand-edited away from any single preset.
export function posTierFromCeilings(ceilings: PosCeilingsDto): string {
  const entries = Object.entries(POS_TIER_PRESETS);
  const exact = entries.find(([, preset]) => JSON.stringify(preset) === JSON.stringify(ceilings));
  if (exact) return exact[0];

  let best = entries[0][0];
  let bestScore = -1;
  for (const [tier, preset] of entries) {
    const score = Object.keys(preset).filter(
      (key) => preset[key as keyof PosCeilingsDto] === ceilings[key as keyof PosCeilingsDto],
    ).length;
    if (score > bestScore) {
      bestScore = score;
      best = tier;
    }
  }
  return best;
}
export type BranchDto = {
  id: number; code: string; nameEn: string; nameAr: string | null; city: string; address: string | null;
  businessHours: string | null; vatRegistrationNumber: string | null; managerName: string | null;
  warehouse: string | null; status: string; terminalCount: number; ordersCount: number;
};
export type TerminalDto = {
  id: number; code: string; name: string; branchId: number; branchName: string; type: string;
  assignedCashierId: number | null; assignedCashierName: string | null;
  offlineModeEnabled: boolean; ipAddress: string | null; macAddress: string | null; status: string;
  lastSyncAt: string | null; deviceCount: number;
  hasPairingSecret: boolean; hasLockdownPin: boolean; lockdownPinLength: number | null;
};
export type DeviceDto = {
  id: number; deviceCode: string; type: string; model: string; serial: string | null; terminalId: number;
  terminalName: string; branchId: number; branchName: string; connection: string; ipAddress: string | null;
  firmware: string | null; lastTestAt: string | null; status: string; syncStatus: string;
  behaviorProfile: string | null; qzPrinterName: string | null;
};
export type SettingDto = {
  id: number; category: string; group: string; key: string; value: string; scope: string;
  branchId: number | null; effectiveFrom: string; changedByName: string | null; status: string;
};
export type RuleDto = {
  id: number; name: string; domain: string; priority: number; whenTrigger: string; condition: string;
  action: string; approverName: string | null; active: boolean; notes: string | null; status: string;
};
export type ComplianceDto = {
  id: number; control: string; framework: string; owner: string; lastReview: string; nextDue: string;
  evidence: string | null; findings: string | null; status: string;
};
export type MaintenanceDto = {
  id: number; ticketNo: string; deviceOrModule: string; branchId: number | null; branchName: string | null;
  severity: string; owner: string; slaHours: number; status: string; createdAt: string; resolvedAt: string | null;
};
export type SubscriptionDto = {
  id: number; planName: string; billingCycle: string; startedAt: string; renewsAt: string; status: string;
  usage: { feature: string; usage: number; limit: number; overageRate: number; nextResetAt: string }[];
};

export type CreateUserRequest = { name: string; email: string; password: string; roleId: number; branchId: number | null };
export type UpdateUserRequest = { name: string; roleId: number; branchId: number | null; status: string };
export type UpsertRoleRequest = { name: string; description: string | null; approvalCap: number; permissions: Record<string, string>; posCeilings: PosCeilingsDto };
export type UpsertBranchRequest = {
  code: string; nameEn: string; nameAr: string | null; city: string; address: string | null; businessHours: string | null;
  vatRegistrationNumber: string | null; managerName: string | null; warehouse: string | null;
};
export type UpdateBranchRequest = UpsertBranchRequest & { status: string };
export type UpsertTerminalRequest = {
  code: string; name: string; branchId: number; type: string; assignedCashierId: number | null;
  offlineModeEnabled: boolean; ipAddress: string | null; macAddress: string | null;
};
export type PairDeviceRequest = {
  type: string; model: string; serial: string | null; terminalId: number; connection: string;
  ipAddress: string | null; behaviorProfile: string | null;
};
export type UpdateDeviceRequest = {
  terminalId: number; model: string; serial: string | null; connection: string; ipAddress: string | null;
  behaviorProfile: string | null;
};
export type GenerateKioskPairingResponse = { terminalCode: string; pairingSecret: string };

export const TERMINAL_TYPE_TO_BACKEND: Record<string, string> = {
  "Fixed POS": "Fixed", "Mobile POS": "Mobile", Kiosk: "Kiosk", "Back-office": "BackOffice",
};
export const TERMINAL_TYPE_TO_FRONTEND: Record<string, string> = Object.fromEntries(Object.entries(TERMINAL_TYPE_TO_BACKEND).map(([k, v]) => [v, k]));
export const DEVICE_TYPE_TO_BACKEND: Record<string, string> = {
  "Receipt Printer": "ReceiptPrinter", "Label Printer": "LabelPrinter", "Barcode Scanner": "BarcodeScanner",
  "Cash Drawer": "CashDrawer", "Weighing Scale": "WeighingScale", "Card Reader (Mada)": "CardReader", "Customer Display": "CustomerDisplay",
};
export const CONNECTION_TO_BACKEND: Record<string, string> = {
  USB: "Usb", Bluetooth: "Bluetooth", "Network (LAN)": "Lan", "Wi-Fi": "WiFi",
};
export const CONNECTION_TO_FRONTEND: Record<string, string> = Object.fromEntries(Object.entries(CONNECTION_TO_BACKEND).map(([k, v]) => [v, k]));

export const RULE_DOMAIN_TO_BACKEND: Record<string, string> = {
  "Pricing & Discount": "Finance", "Refund & Return": "Orders", "Credit & Payment": "Finance",
  "Inventory Movement": "Inventory", POS: "Pos", Approvals: "Admin", Compliance: "Admin",
};
export const RULE_DOMAIN_TO_FRONTEND: Record<string, string> = {
  Finance: "Pricing & Discount", Orders: "Refund & Return", Inventory: "Inventory Movement", Pos: "POS", Admin: "Approvals",
};
export const RULE_PRIORITY_TO_NUMBER: Record<string, number> = { Low: 10, Normal: 20, High: 30, Critical: 40 };
export const RULE_PRIORITY_TO_FRONTEND: Record<number, string> = { 10: "Low", 20: "Normal", 30: "High", 40: "Critical" };
export function rulePriorityLabel(priority: number): string {
  return RULE_PRIORITY_TO_FRONTEND[priority] ?? (priority >= 30 ? "High" : priority >= 20 ? "Normal" : "Low");
}

export const useUsers = (enabled = true) => useQuery({ queryKey: ["admin", "users"], queryFn: () => apiGet<UserDto[]>("/api/admin/users"), enabled });
export const useRoles = (enabled = true) => useQuery({ queryKey: ["admin", "roles"], queryFn: () => apiGet<RoleDto[]>("/api/admin/roles"), enabled });
export const useBranches = (enabled = true) => useQuery({ queryKey: ["network", "branches"], queryFn: () => apiGet<BranchDto[]>("/api/network/branches"), enabled });
export const useTerminals = (enabled = true) => useQuery({ queryKey: ["network", "terminals"], queryFn: () => apiGet<TerminalDto[]>("/api/network/terminals"), enabled });
export const useDevices = (enabled = true) => useQuery({ queryKey: ["network", "devices"], queryFn: () => apiGet<DeviceDto[]>("/api/network/devices"), enabled });
export function useUpdateDeviceQzMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, qzPrinterName }: { deviceId: number; qzPrinterName: string | null }) =>
      apiPut<DeviceDto>(`/api/network/devices/${deviceId}/qz-mapping`, { qzPrinterName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["network", "devices"] }),
  });
}
export const useSettings = (category: "System" | "Pos", enabled = true) =>
  useQuery({ queryKey: ["admin", "settings", category], queryFn: () => apiGet<SettingDto[]>(`/api/admin/settings?category=${category}`), enabled });
export const useRules = (enabled = true) => useQuery({ queryKey: ["admin", "rules"], queryFn: () => apiGet<RuleDto[]>("/api/admin/rules"), enabled });
export const useCompliance = (enabled = true) => useQuery({ queryKey: ["admin", "compliance"], queryFn: () => apiGet<ComplianceDto[]>("/api/admin/compliance"), enabled });
export const useMaintenance = (enabled = true) => useQuery({ queryKey: ["admin", "maintenance"], queryFn: () => apiGet<MaintenanceDto[]>("/api/admin/maintenance"), enabled });
export const useSubscription = (enabled = true) => useQuery({ queryKey: ["admin", "subscription"], queryFn: () => apiGet<SubscriptionDto>("/api/admin/plans/subscription"), enabled });

export type UpsertRuleRequest = {
  name: string; domain: string; priority: number; whenTrigger: string; condition: string; action: string;
  approverUserId: number | null; active: boolean; notes: string | null;
};
export type UpsertComplianceRequest = {
  control: string; framework: string; owner: string; lastReview: string; nextDue: string;
  evidence: string | null; findings: string | null; status: string;
};
export type CreateMaintenanceRequest = { deviceOrModule: string; branchId: number | null; severity: string; owner: string; slaHours: number };
export type UpdateMaintenanceStatusRequest = { status: string };
export type UpsertSettingRequest = { category: string; group: string; key: string; value: string; scope: string; branchId: number | null; effectiveFrom: string | null };

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertRuleRequest) => apiPost<RuleDto>("/api/admin/rules", request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "rules"] }),
  });
}
export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertRuleRequest }) => apiPut<RuleDto>(`/api/admin/rules/${id}`, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "rules"] }),
  });
}
export function useCreateCompliance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertComplianceRequest) => apiPost<ComplianceDto>("/api/admin/compliance", request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "compliance"] }),
  });
}
export function useUpdateCompliance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertComplianceRequest }) => apiPut<ComplianceDto>(`/api/admin/compliance/${id}`, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "compliance"] }),
  });
}
export function useCreateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateMaintenanceRequest) => apiPost<MaintenanceDto>("/api/admin/maintenance", request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "maintenance"] }),
  });
}
export function useUpdateMaintenanceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiPut<MaintenanceDto>(`/api/admin/maintenance/${id}/status`, { status } satisfies UpdateMaintenanceStatusRequest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "maintenance"] }),
  });
}
export function useUpsertSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertSettingRequest) => apiPut<SettingDto>("/api/admin/settings", request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "settings"] }),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateUserRequest) => apiPost<UserDto>("/api/admin/users", request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpdateUserRequest }) => apiPut<UserDto>(`/api/admin/users/${id}`, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}
export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertRoleRequest) => apiPost<RoleDto>("/api/admin/roles", request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "roles"] }),
  });
}
export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertRoleRequest }) => apiPut<RoleDto>(`/api/admin/roles/${id}`, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "roles"] }),
  });
}
export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertBranchRequest) => apiPost<BranchDto>("/api/network/branches", request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "branches"] }),
  });
}
export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpdateBranchRequest }) => apiPut<BranchDto>(`/api/network/branches/${id}`, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "branches"] }),
  });
}
export function useCreateTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertTerminalRequest) => apiPost<TerminalDto>("/api/network/terminals", request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "terminals"] }),
  });
}
export function useUpdateTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpsertTerminalRequest }) => apiPut<TerminalDto>(`/api/network/terminals/${id}`, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "terminals"] }),
  });
}
export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: PairDeviceRequest) => apiPost<DeviceDto>("/api/network/devices/pair", request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "devices"] }),
  });
}
export function useUpdateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpdateDeviceRequest }) => apiPut<DeviceDto>(`/api/network/devices/${id}`, request),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "devices"] }),
  });
}
export function useSetTerminalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Online" | "Offline" }) => apiPut<TerminalDto>(`/api/network/terminals/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "terminals"] }),
  });
}
export function useSetDeviceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, syncStatus }: { id: number; status: "Healthy" | "Disconnected" | "Faulty"; syncStatus?: "Synced" | "Pending" | "Failed" }) =>
      apiPut<DeviceDto>(`/api/network/devices/${id}/status`, { status, syncStatus: syncStatus ?? null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "devices"] }),
  });
}
export function useSetBranchStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "Active" | "Inactive" }) => apiPut<BranchDto>(`/api/network/branches/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "branches"] }),
  });
}
export function useAssignCashier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cashierUserId }: { id: number; cashierUserId: number | null }) =>
      apiPut<TerminalDto>(`/api/network/terminals/${id}/assign-cashier`, { cashierUserId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "terminals"] }),
  });
}
export function useForceSyncTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPost<TerminalDto>(`/api/network/terminals/${id}/force-sync`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "terminals"] }),
  });
}
export function useOpenDrawer() {
  return useMutation({
    mutationFn: (id: number) => apiPost<{ message: string }>(`/api/network/devices/${id}/open-drawer`),
  });
}
export function useResetPin() {
  return useMutation({
    mutationFn: (id: number) => apiPost<{ pin: string }>(`/api/admin/users/${id}/reset-pin`),
  });
}
export type RuleTestResult = { passed: boolean; messages: string[] };
export function useTestRule() {
  return useMutation({
    mutationFn: (id: number) => apiPost<RuleTestResult>(`/api/admin/rules/${id}/test`),
  });
}
export function useAssignMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, owner }: { id: number; owner: string }) => apiPut<MaintenanceDto>(`/api/admin/maintenance/${id}/assign`, { owner }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "maintenance"] }),
  });
}
export function useSignOffCompliance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => apiPut<ComplianceDto>(`/api/admin/compliance/${id}/sign-off`, { note: note ?? null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "compliance"] }),
  });
}

export function useGenerateKioskPairing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (terminalId: number) => apiPost<GenerateKioskPairingResponse>(`/api/network/terminals/${terminalId}/kiosk-pairing`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "terminals"] }),
  });
}
export function useSetKioskLockdownPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ terminalId, pin }: { terminalId: number; pin: string }) =>
      apiPut<TerminalDto>(`/api/network/terminals/${terminalId}/kiosk-lockdown-pin`, { pin }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "terminals"] }),
  });
}
export function useClearKioskLockdownPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (terminalId: number) => apiDelete<TerminalDto>(`/api/network/terminals/${terminalId}/kiosk-lockdown-pin`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network", "terminals"] }),
  });
}

export type SessionLogFilters = { terminalId?: number; branchId?: number; cashierId?: number; status?: string; dateFrom?: string; dateTo?: string };
export const useSessionLogs = (enabled = true, filters?: SessionLogFilters) =>
  useQuery({
    queryKey: ["network", "session-logs", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.terminalId) params.set("terminalId", String(filters.terminalId));
      if (filters?.branchId) params.set("branchId", String(filters.branchId));
      if (filters?.cashierId) params.set("cashierId", String(filters.cashierId));
      if (filters?.status) params.set("status", filters.status);
      if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters?.dateTo) params.set("dateTo", filters.dateTo);
      const qs = params.toString();
      return apiGet<CashierShiftDto[]>(`/api/network/session-logs${qs ? `?${qs}` : ""}`);
    },
    enabled,
  });

export type AuditLogDto = { id: number; createdAt: string; module: string; event: string; recordId: string | null; userName: string | null; branchId: number | null; severity: string };
export const useAuditLogs = (module?: string, enabled = true) =>
  useQuery({
    queryKey: ["admin", "audit-logs", module ?? "all"],
    queryFn: () => apiGet<AuditLogDto[]>(module ? `/api/admin/audit-logs?module=${encodeURIComponent(module)}` : "/api/admin/audit-logs"),
    enabled,
  });

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ageFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function permLevel(role: RoleDto, module: string): string {
  return role.permissions.find((p) => p.module === module)?.level ?? "None";
}

export type LiveKpi = { label: string; value: string; sub: string; tone: "critical" | "warning" | "success" | "info" | "muted" };
export type LiveProgressStat = { label: string; pct: number; tone: "critical" | "warning" | "success" | "info" | "muted" };
// ids[i] is the DB id of rows[i] — lets ModulePage's row menu act on the exact record without
// re-deriving it from display text (which is lossy, e.g. duplicate names).
export type LiveTable = {
  columns: string[]; rows: (string | number)[][]; statusCol: number; kpis?: LiveKpi[]; ids?: number[];
  progressStats?: LiveProgressStat[];
};

export function mapUsers(users: UserDto[]): LiveTable {
  const active = users.filter((u) => u.status === "Active").length;
  const suspended = users.filter((u) => u.status === "Suspended").length;
  const inactive = users.filter((u) => u.status === "Inactive").length;
  const biometric = users.filter((u) => u.biometricEnabled).length;
  const total = users.length || 1;
  return {
    columns: ["Employee ID", "Name", "Role", "Branch", "Email", "PIN", "Biometric", "Last Login", "Status"],
    statusCol: 8,
    ids: users.map((u) => u.id),
    kpis: [
      { label: "Total Users", value: String(users.length), sub: `${new Set(users.map((u) => u.roleId)).size} roles`, tone: "info" },
      { label: "Active", value: String(active), sub: `${Math.round((active / total) * 100)}%`, tone: "success" },
      { label: "Suspended", value: String(suspended), sub: suspended > 0 ? "Needs review" : "None", tone: suspended > 0 ? "warning" : "muted" },
      { label: "Inactive", value: String(inactive), sub: "Left / deactivated", tone: "muted" },
      { label: "Biometric Enabled", value: String(biometric), sub: `${Math.round((biometric / total) * 100)}% coverage`, tone: "info" },
    ],
    rows: users.map((u) => [
      `USR-${String(u.id).padStart(3, "0")}`, u.name, u.roleName, u.branchName ?? "All Branches", u.email,
      u.hasPin ? "Set" : "Not Set", u.biometricEnabled ? "Yes" : "No", u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Never", u.status,
    ]),
  };
}

export function mapRoles(roles: RoleDto[]): LiveTable {
  return {
    columns: ["Role", "Users", "POS Tier", "Discount Ceiling", "Surplus Ceiling", "POS", "Orders", "Inventory", "Finance", "Admin", "Approval Cap (ر.س)", "Status"],
    statusCol: 11,
    ids: roles.map((r) => r.id),
    rows: roles.map((r) => [
      r.name, r.userCount, posTierFromCeilings(r.posCeilings),
      r.posCeilings.discountCeilingPercent === null ? "Unlimited" : `${r.posCeilings.discountCeilingPercent}%`,
      r.posCeilings.surplusReturnCeilingAmount === null ? "Any value" : r.posCeilings.surplusReturnCeilingAmount.toLocaleString("en-US"),
      permLevel(r, "Pos"), permLevel(r, "Orders"), permLevel(r, "Inventory"),
      permLevel(r, "Finance"), permLevel(r, "Admin"),
      r.approvalCap >= 999_999 ? "Unlimited" : r.approvalCap.toLocaleString("en-US"), r.status,
    ]),
  };
}

export function mapBranches(branches: BranchDto[]): LiveTable {
  const activeCount = branches.filter((b) => b.status === "Active").length;
  const totalOrders = branches.reduce((sum, b) => sum + b.ordersCount, 0);
  const totalTerminals = branches.reduce((sum, b) => sum + b.terminalCount, 0);
  return {
    columns: ["Code", "Branch", "City", "Business Hours", "VAT No.", "Terminals", "Orders", "Status"],
    statusCol: 7,
    ids: branches.map((b) => b.id),
    kpis: [
      { label: "Active Branches", value: String(activeCount), sub: `${activeCount}/${branches.length} branches`, tone: "success" },
      { label: "Total Orders", value: totalOrders.toLocaleString("en-US"), sub: "All branches", tone: "info" },
      { label: "Total Terminals", value: String(totalTerminals), sub: "Registered", tone: "info" },
    ],
    rows: branches.map((b) => [
      b.code, b.nameEn, b.city, b.businessHours ?? "—", b.vatRegistrationNumber ?? "—", b.terminalCount, b.ordersCount, b.status,
    ]),
  };
}

export function mapTerminals(terminals: TerminalDto[]): LiveTable {
  const online = terminals.filter((t) => t.status === "Online").length;
  const offline = terminals.filter((t) => t.status === "Offline").length;
  const idle = terminals.filter((t) => t.status === "Idle").length;
  return {
    columns: ["Terminal", "Branch", "Cashier", "IP / MAC", "Last Sync", "Status"],
    statusCol: 5,
    ids: terminals.map((t) => t.id),
    kpis: [
      { label: "Total Terminals", value: String(terminals.length), sub: `${new Set(terminals.map((t) => t.branchId)).size} branches`, tone: "info" },
      { label: "Online", value: String(online), sub: terminals.length ? `${Math.round((online / terminals.length) * 100)}% uptime` : "—", tone: "success" },
      { label: "Offline", value: String(offline), sub: offline > 0 ? "Needs attention" : "All clear", tone: offline > 0 ? "critical" : "success" },
      { label: "Idle", value: String(idle), sub: "No activity", tone: idle > 0 ? "warning" : "muted" },
    ],
    rows: terminals.map((t) => [
      t.code, t.branchName, t.assignedCashierName ?? "Unassigned", `${t.ipAddress ?? "—"} / ${t.macAddress ?? "—"}`,
      fmtDate(t.lastSyncAt), t.status,
    ]),
  };
}

export function mapDevices(devices: DeviceDto[]): LiveTable {
  const healthy = devices.filter((d) => d.status === "Healthy").length;
  const faulty = devices.filter((d) => d.status === "Faulty").length;
  const disconnected = devices.filter((d) => d.status === "Disconnected").length;
  const synced = devices.filter((d) => d.syncStatus === "Synced").length;
  const total = devices.length || 1;
  return {
    columns: ["Device ID", "Type", "Terminal", "Branch", "Model", "Sync", "Last Test", "Status"],
    statusCol: 7,
    ids: devices.map((d) => d.id),
    kpis: [
      { label: "Total Devices", value: String(devices.length), sub: `${new Set(devices.map((d) => d.terminalId)).size} terminals`, tone: "info" },
      { label: "Healthy", value: String(healthy), sub: `${Math.round((healthy / total) * 100)}%`, tone: "success" },
      { label: "Needs Attention", value: String(faulty), sub: faulty > 0 ? "Maintenance ticket" : "None", tone: faulty > 0 ? "warning" : "muted" },
      { label: "Network OK", value: `${synced}/${devices.length}`, sub: "Synced", tone: synced === devices.length ? "success" : "warning" },
    ],
    progressStats: [
      { label: "Device Health", pct: Math.round((healthy / total) * 100), tone: "success" },
      { label: "Network Sync", pct: Math.round((synced / total) * 100), tone: "info" },
      { label: "Connected", pct: Math.round(((devices.length - disconnected) / total) * 100), tone: "success" },
    ],
    rows: devices.map((d) => [
      d.deviceCode, d.type, d.terminalName, d.branchName, d.model, d.syncStatus, fmtDate(d.lastTestAt), d.status,
    ]),
  };
}

export function mapSystemSettings(settings: SettingDto[]): LiveTable {
  return {
    columns: ["Setting", "Group", "Value", "Last Changed", "Changed By", "Validation", "Status"],
    statusCol: 6,
    ids: settings.map((s) => s.id),
    rows: settings.map((s) => [s.key, s.group, s.value, fmtDate(s.effectiveFrom), s.changedByName ?? "—", "OK", s.status]),
  };
}

export function mapPosSettings(settings: SettingDto[]): LiveTable {
  return {
    columns: ["Setting", "Group", "Scope", "Value", "Effective From", "Changed By", "Status"],
    statusCol: 6,
    ids: settings.map((s) => s.id),
    rows: settings.map((s) => [s.key, s.group, s.scope, s.value, fmtDate(s.effectiveFrom), s.changedByName ?? "—", s.status]),
  };
}

export function mapRules(rules: RuleDto[]): LiveTable {
  return {
    columns: ["Rule ID", "Module", "Trigger", "Condition", "Action", "Priority", "Approver", "Status"],
    statusCol: 7,
    ids: rules.map((r) => r.id),
    rows: rules.map((r) => [
      `RUL-${String(r.id).padStart(3, "0")}`, r.domain, r.whenTrigger, r.condition, r.action, r.priority,
      r.approverName ?? "—", r.active ? "Active" : "Inactive",
    ]),
  };
}

export function mapCompliance(rows: ComplianceDto[]): LiveTable {
  return {
    columns: ["Control", "Framework", "Owner", "Last Review", "Next Due", "Evidence", "Findings", "Status"],
    statusCol: 7,
    ids: rows.map((c) => c.id),
    rows: rows.map((c) => [c.control, c.framework, c.owner, fmtDate(c.lastReview), fmtDate(c.nextDue), c.evidence ?? "—", c.findings ?? "0", c.status]),
  };
}

export function mapMaintenance(rows: MaintenanceDto[]): LiveTable {
  return {
    columns: ["Ticket #", "Device / Module", "Branch", "Severity", "Owner", "Created", "SLA", "Age", "Status"],
    statusCol: 8,
    ids: rows.map((t) => t.id),
    rows: rows.map((t) => [
      t.ticketNo, t.deviceOrModule, t.branchName ?? "All Branches", t.severity, t.owner, fmtDate(t.createdAt),
      `${t.slaHours}h`, ageFrom(t.createdAt), t.status,
    ]),
  };
}

export function mapAuditLogs(rows: AuditLogDto[]): LiveTable {
  return {
    columns: ["Event #", "Time", "Module", "Action", "Record", "User", "Branch", "Severity"],
    statusCol: 7,
    ids: rows.map((a) => a.id),
    rows: rows.map((a) => [
      `EV-${String(a.id).padStart(5, "0")}`,
      new Date(a.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      a.module, a.event, a.recordId ?? "—", a.userName ?? "system", a.branchId ?? "—", a.severity,
    ]),
  };
}

export function mapPlans(sub: SubscriptionDto): LiveTable {
  const kpiTone = (usage: number, limit: number): LiveKpi["tone"] => {
    if (limit <= 0) return "info";
    if (usage > limit) return "critical";
    return usage / limit >= 0.9 ? "warning" : "success";
  };
  return {
    columns: ["Module / Feature", "Entitlement", "Usage", "Limit", "Overage Rate", "Next Reset", "Status"],
    statusCol: 6,
    kpis: [
      { label: "Current Plan", value: sub.planName, sub: `Renews ${fmtDate(sub.renewsAt)}`, tone: sub.status === "Active" ? "success" : "warning" },
      ...sub.usage.map((u) => ({
        label: u.feature, value: `${u.usage.toLocaleString("en-US")} / ${u.limit.toLocaleString("en-US")}`,
        sub: u.usage > u.limit ? "Over limit" : "In plan", tone: kpiTone(u.usage, u.limit),
      })),
    ],
    rows: sub.usage.map((u) => {
      const pct = u.limit > 0 ? u.usage / u.limit : 0;
      const status = u.usage > u.limit ? "Over Limit" : pct >= 0.9 ? "Near Limit" : "OK";
      return [
        u.feature, `${u.limit.toLocaleString("en-US")} included`, u.usage, u.limit,
        `${u.overageRate.toLocaleString("en-US")} ر.س`, fmtDate(u.nextResetAt), status,
      ];
    }),
  };
}
