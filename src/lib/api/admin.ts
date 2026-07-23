import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "./client";

export type UserDto = {
  id: number; name: string; email: string; roleId: number; roleName: string;
  branchId: number | null; branchName: string | null; status: string; preferredLocale: string; lastLoginAt: string | null;
};
export type ModulePermissionEntry = { module: string; level: string };
export type RoleDto = {
  id: number; name: string; description: string | null; approvalCap: number; isSystem: boolean;
  status: string; userCount: number; permissions: ModulePermissionEntry[];
};
export type BranchDto = {
  id: number; code: string; nameEn: string; nameAr: string | null; city: string; address: string | null;
  businessHours: string | null; vatRegistrationNumber: string | null; managerName: string | null;
  warehouse: string | null; status: string; terminalCount: number;
};
export type TerminalDto = {
  id: number; code: string; name: string; branchId: number; branchName: string; type: string;
  offlineModeEnabled: boolean; ipAddress: string | null; macAddress: string | null; status: string;
  lastSyncAt: string | null; deviceCount: number;
};
export type DeviceDto = {
  id: number; deviceCode: string; type: string; model: string; serial: string | null; terminalId: number;
  terminalName: string; connection: string; ipAddress: string | null; firmware: string | null;
  lastTestAt: string | null; status: string; qzPrinterName: string | null;
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

export type AuditLogDto = { id: number; createdAt: string; module: string; event: string; recordId: string | null; userName: string | null; branchId: number | null; severity: string };
export const useAuditLogs = (enabled = true) => useQuery({ queryKey: ["admin", "audit-logs"], queryFn: () => apiGet<AuditLogDto[]>("/api/admin/audit-logs"), enabled });

function fmtDate(iso: string | null): string {
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
// ids[i] is the DB id of rows[i] — lets ModulePage's row menu act on the exact record without
// re-deriving it from display text (which is lossy, e.g. duplicate names).
export type LiveTable = { columns: string[]; rows: (string | number)[][]; statusCol: number; kpis?: LiveKpi[]; ids?: number[] };

export function mapUsers(users: UserDto[]): LiveTable {
  return {
    columns: ["Employee ID", "Name", "Role", "Branch", "Email", "PIN", "Biometric", "Last Login", "Status"],
    statusCol: 8,
    rows: users.map((u) => [
      `USR-${String(u.id).padStart(3, "0")}`, u.name, u.roleName, u.branchName ?? "All Branches", u.email,
      "Set", "No", u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Never", u.status,
    ]),
  };
}

export function mapRoles(roles: RoleDto[]): LiveTable {
  return {
    columns: ["Role", "Users", "POS", "Orders", "Inventory", "Finance", "Admin", "Approval Cap (ر.س)", "Status"],
    statusCol: 8,
    rows: roles.map((r) => [
      r.name, r.userCount, permLevel(r, "Pos"), permLevel(r, "Orders"), permLevel(r, "Inventory"),
      permLevel(r, "Finance"), permLevel(r, "Admin"),
      r.approvalCap >= 999_999 ? "Unlimited" : r.approvalCap.toLocaleString("en-US"), r.status,
    ]),
  };
}

export function mapBranches(branches: BranchDto[]): LiveTable {
  return {
    columns: ["Code", "Branch", "City", "Business Hours", "VAT No.", "Sales Today", "Terminals", "Low Stock", "Status"],
    statusCol: 8,
    rows: branches.map((b) => [
      b.code, b.nameEn, b.city, b.businessHours ?? "—", b.vatRegistrationNumber ?? "—", "—", b.terminalCount, "—", b.status,
    ]),
  };
}

export function mapTerminals(terminals: TerminalDto[]): LiveTable {
  return {
    columns: ["Terminal", "Branch", "Cashier", "IP / MAC", "Uptime", "Tx Today", "Sales Today", "Offline Queue", "Last Sync", "Status"],
    statusCol: 9,
    rows: terminals.map((t) => [
      t.code, t.branchName, "—", `${t.ipAddress ?? "—"} / ${t.macAddress ?? "—"}`, "—", "—", "—", 0, fmtDate(t.lastSyncAt), t.status,
    ]),
  };
}

export function mapDevices(devices: DeviceDto[]): LiveTable {
  return {
    columns: ["Device ID", "Type", "Terminal", "Branch", "Model", "Firmware", "Last Test", "Health", "Status"],
    statusCol: 8,
    rows: devices.map((d) => [
      d.deviceCode, d.type, d.terminalName, "—", d.model, d.firmware ?? "—", fmtDate(d.lastTestAt),
      d.status === "Healthy" ? "OK" : d.status, d.status,
    ]),
  };
}

export function mapSystemSettings(settings: SettingDto[]): LiveTable {
  return {
    columns: ["Setting", "Group", "Value", "Last Changed", "Changed By", "Validation", "Status"],
    statusCol: 6,
    rows: settings.map((s) => [s.key, s.group, s.value, fmtDate(s.effectiveFrom), s.changedByName ?? "—", "OK", s.status]),
  };
}

export function mapPosSettings(settings: SettingDto[]): LiveTable {
  return {
    columns: ["Setting", "Group", "Scope", "Value", "Effective From", "Changed By", "Status"],
    statusCol: 6,
    rows: settings.map((s) => [s.key, s.group, s.scope, s.value, fmtDate(s.effectiveFrom), s.changedByName ?? "—", s.status]),
  };
}

export function mapRules(rules: RuleDto[]): LiveTable {
  return {
    columns: ["Rule ID", "Module", "Trigger", "Condition", "Action", "Priority", "Approver", "Status"],
    statusCol: 7,
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
    rows: rows.map((c) => [c.control, c.framework, c.owner, fmtDate(c.lastReview), fmtDate(c.nextDue), c.evidence ?? "—", c.findings ?? "0", c.status]),
  };
}

export function mapMaintenance(rows: MaintenanceDto[]): LiveTable {
  return {
    columns: ["Ticket #", "Device / Module", "Branch", "Severity", "Owner", "Created", "SLA", "Age", "Status"],
    statusCol: 8,
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
    rows: rows.map((a) => [
      `EV-${String(a.id).padStart(5, "0")}`,
      new Date(a.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      a.module, a.event, a.recordId ?? "—", a.userName ?? "system", a.branchId ?? "—", a.severity,
    ]),
  };
}

export function mapPlans(sub: SubscriptionDto): LiveTable {
  return {
    columns: ["Module / Feature", "Entitlement", "Usage", "Limit", "Overage Rate", "Next Reset", "Status"],
    statusCol: 6,
    rows: sub.usage.map((u) => [
      u.feature, "Included", u.usage, u.limit, `${u.overageRate.toLocaleString("en-US")} ر.س`, fmtDate(u.nextResetAt), "OK",
    ]),
  };
}
