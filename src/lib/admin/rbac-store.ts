// §87 Roles & Permissions — operational RBAC layer that EXTENDS the existing role/permission
// implementation (backend RolesController + PERMISSION_PAGES page grid) with the richer
// Module -> Submodule -> Feature -> Action -> Scope -> Limit model, multi-role user assignments,
// direct user allow/deny exceptions and approval authority rows. Persisted locally so every
// action survives a refresh in preview.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";

export const PERMISSION_ACTIONS = [
  "Create", "Read", "Update", "Delete", "Submit", "Approve", "Reject", "Post", "Export", "Print", "Override", "Full Control",
] as const;
export type PermissionActionKey = (typeof PERMISSION_ACTIONS)[number];

export type PermFeature = { key: string; module: string; submodule: string; feature: string };

function feat(module: string, submodule: string, features: string[]): PermFeature[] {
  return features.map((f) => ({
    key: `${module}.${submodule}.${f}`.toLowerCase().replace(/[^a-z0-9.]+/g, "-"),
    module, submodule, feature: f,
  }));
}

// §87.4 permission categories.
export const PERMISSION_CATALOG: PermFeature[] = [
  ...feat("Dashboard", "KPIs", ["View Dashboard", "Sales KPIs", "Inventory KPIs", "Financial KPIs", "Delivery KPIs", "HR KPIs", "Customize Cards", "Export Dashboard"]),
  ...feat("Products", "Product Master", ["Product Record", "Duplicate Product", "Category", "Brand", "Attributes", "UOM", "Dimensions", "Tax", "Loyalty", "Return Rules", "Credit Eligibility", "Assign Supplier"]),
  ...feat("Products", "Sensitive", ["View Product Cost", "View Product Margin", "Print Barcode", "Print Label", "Audit History"]),
  ...feat("POS & Sales", "Checkout", ["Access POS", "Sale", "Hold Sale", "Resume Sale", "Void Sale", "Cancel Sale", "Reprint Receipt", "View Other Cashier Sales"]),
  ...feat("POS & Sales", "Quotations", ["Quotation", "Convert Quotation"]),
  ...feat("POS & Sales", "Pricing Control", ["Line Discount", "Invoice Discount", "Approve Discount", "Override Price", "Approve Price Override", "Add Delivery", "Select Account Credit"]),
  ...feat("Payments", "Tenders", ["Cash", "Card", "Wallet", "Bank Transfer", "Account Credit", "Loyalty Points", "Store Credit", "Split Payment"]),
  ...feat("Payments", "Control", ["Confirm Bank Transfer", "Reject Bank Transfer", "Reverse Payment", "Payment Details", "Export Payments"]),
  ...feat("Customers & Contractors", "Customer Master", ["Customer Record", "Deactivate Customer", "View Customer PII", "Purchase History", "Return History", "Customer Documents"]),
  ...feat("Customers & Contractors", "Loyalty", ["View Loyalty", "Adjust Loyalty Points"]),
  ...feat("Customers & Contractors", "Contractor Ledger", ["View Contractor Ledger", "Export Statement", "Enable Customer Credit", "Change Credit Limit", "Approve Credit Limit", "Place Credit Hold", "Release Credit Hold", "Ledger Adjustment"]),
  ...feat("Customers & Contractors", "Projects", ["Create Project", "Assign Project Rate"]),
  ...feat("Inventory", "Stock Visibility", ["View Stock", "View Other Branch Stock", "Stock Movement History", "Stock Value", "Export Inventory Reports"]),
  ...feat("Inventory", "Stock Adjustments", ["Adjustment", "Approve Adjustment", "Post Adjustment"]),
  ...feat("Inventory", "Stock Intake", ["Receive Stock", "Opening Stock"]),
  ...feat("Inventory", "Stock Transfers", ["Transfer", "Approve Transfer", "Dispatch Transfer", "Receive Transfer"]),
  ...feat("Inventory", "Reservations & Quarantine", ["Reserve Stock", "Release Reserved Stock", "Move Quarantine Stock", "Release Quarantine Stock"]),
  ...feat("Inventory", "Stock Counting", ["Perform Stock Count", "Approve Stock Count", "Post Count Adjustment"]),
  ...feat("Purchasing", "Purchase Orders", ["Purchase Order", "Submit PO", "Approve PO", "Reject PO", "Cancel PO", "Receive PO", "View Purchase Cost", "Compare Supplier Offers"]),
  ...feat("Purchasing", "Supplier Returns", ["Supplier Return", "Approve Supplier Return", "Supplier Credit Note", "Supplier Performance", "Export Purchase Reports"]),
  ...feat("Delivery & Dispatch", "Delivery Orders", ["Delivery", "Assign Driver", "Assign Vehicle", "Start Loading", "Confirm Loading", "Dispatch Delivery", "Complete Delivery", "Partial Delivery", "Failed Delivery", "Reschedule Delivery"]),
  ...feat("Delivery & Dispatch", "Internal Movements", ["Internal Movement", "Receive Internal Movement", "Override Vehicle Capacity", "Delivery Reports"]),
  ...feat("Returns & Refunds", "Returns", ["Return", "Submit Return", "Approve Return", "Reject Return", "Override Return Policy", "Restock Returned Product", "Quarantine Returned Product", "Return Reports"]),
  ...feat("Returns & Refunds", "Refunds", ["Process Refund", "Approve Refund", "Approve Restocking Fee", "Waive Restocking Fee"]),
  ...feat("HRMS", "Workforce", ["HR Dashboard", "Employee Record", "Deactivate Employee", "Department", "Assign Department", "Shift", "Assign Shift"]),
  ...feat("HRMS", "Attendance & Leave", ["Manual Attendance", "Approve Attendance Adjustment", "Submit Leave", "Approve Leave", "Reject Leave"]),
  ...feat("HRMS", "Documents", ["Upload Employee Document", "View Sensitive HR Documents", "Contract", "Renew Contract", "HR Activity Logs"]),
  ...feat("Administration", "Network", ["Branch", "Terminal", "Pair Device", "Unpair Device"]),
  ...feat("Administration", "Users & Roles", ["User", "Deactivate User", "Role", "Assign Role", "Remove Role", "Assign Direct Permission", "Remove Direct Permission"]),
  ...feat("Administration", "Governance", ["Configure Rules", "Approve Rules", "Approval Matrix", "View Audit Logs", "Export Audit Logs", "System Settings"]),
];

export const PERMISSION_MODULES = [...new Set(PERMISSION_CATALOG.map((f) => f.module))];

export const BRANCH_SCOPES = ["All Branches", "Selected Branches", "Assigned Branch Only", "No Branch Access"] as const;
export const TERMINAL_SCOPES = ["All Terminals", "Selected Terminals", "Assigned Terminal Only", "No Terminal Access"] as const;
export const RECORD_SCOPES = ["All Records", "Own Records", "Team Records", "Department Records", "Branch Records", "Assigned Records", "Created by User", "Submitted by User", "Approval Assigned to User"] as const;
export const ROLE_TYPES = ["System Role", "Operational Role", "Managerial Role", "Approval Role", "Vendor Role", "Custom Role"] as const;
export const ROLE_STATUSES = ["Draft", "Pending Approval", "Active", "Inactive"] as const;

export type ApprovalLimit = {
  id: string;
  roleId: string;
  module: string;
  transactionType: string;
  minAmount: number;
  maxAmount: number;
  maxDiscountPercent?: number;
  branchScope: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: "Active" | "Inactive";
};

export type RbacRole = {
  id: string;
  name: string;
  arabicName?: string;
  code: string;
  description: string;
  type: (typeof ROLE_TYPES)[number];
  parentRoleId?: string;
  branchScope: string;
  branches: string[];
  terminalScope: string;
  terminals: string[];
  recordScope: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: (typeof ROLE_STATUSES)[number];
  /** featureKey -> action -> allowed */
  permissions: Record<string, Partial<Record<PermissionActionKey, boolean>>>;
};

export type RoleAssignment = {
  id: string;
  userName: string;
  roleId: string;
  branchScope: string;
  terminalScope: string;
  effectiveFrom: string;
  effectiveTo?: string;
  temporary: boolean;
  reason: string;
  assignedBy: string;
  status: "Draft" | "Pending Approval" | "Scheduled" | "Active" | "Suspended" | "Expired" | "Removed";
};

export type DirectPermission = {
  id: string;
  userName: string;
  featureKey: string;
  action: PermissionActionKey;
  mode: "Allow" | "Deny";
  branch: string;
  terminal: string;
  financialLimit?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  status: "Pending Approval" | "Active" | "Rejected" | "Removed";
};

export type EffectiveState = "Direct Deny" | "Direct Allow" | "Inherited" | "Denied";

const today = "2026-01-01";

function grant(features: PermFeature[], actions: PermissionActionKey[]) {
  const out: RbacRole["permissions"] = {};
  for (const f of features) out[f.key] = Object.fromEntries(actions.map((a) => [a, true]));
  return out;
}
const byModule = (...mods: string[]) => PERMISSION_CATALOG.filter((f) => mods.includes(f.module));
const bySub = (sub: string) => PERMISSION_CATALOG.filter((f) => f.submodule === sub);

function role(p: Partial<RbacRole> & { id: string; name: string; code: string }): RbacRole {
  return {
    description: "", type: "Operational Role", branchScope: "Assigned Branch Only", branches: [],
    terminalScope: "All Terminals", terminals: [], recordScope: "Branch Records",
    effectiveFrom: today, status: "Active", permissions: {}, ...p,
  } as RbacRole;
}

// §87.5 / §87.12 default role roster + pseudo data.
const SEED_ROLES: RbacRole[] = [
  role({ id: "ROLE-000", name: "System Administrator", code: "SYSADMIN", type: "System Role", description: "Full system configuration, users, roles, branches, terminals, devices, rules, audit logs.", branchScope: "All Branches", recordScope: "All Records", permissions: grant(PERMISSION_CATALOG, ["Create", "Read", "Update", "Delete", "Submit", "Approve", "Reject", "Post", "Export", "Print", "Override", "Full Control"]) }),
  role({ id: "ROLE-001", name: "Store Manager", code: "STOREMGR", type: "Managerial Role", description: "Full branch operations, contractor ledger, inventory & returns approval, reports.", branches: ["Riyadh Main Branch"], permissions: grant(byModule("Dashboard", "POS & Sales", "Payments", "Customers & Contractors", "Inventory", "Delivery & Dispatch", "Returns & Refunds", "Purchasing"), ["Create", "Read", "Update", "Submit", "Approve", "Export", "Print"]) }),
  role({ id: "ROLE-006", name: "Branch Manager", code: "BRANCHMGR", type: "Managerial Role", description: "Branch operations oversight.", permissions: grant(byModule("Dashboard", "POS & Sales", "Inventory", "Delivery & Dispatch"), ["Read", "Update", "Approve", "Export"]) }),
  role({ id: "ROLE-007", name: "Supervisor", code: "SUPERVISOR", type: "Approval Role", description: "POS supervision, cashier monitoring, return review, shift review.", permissions: { ...grant(byModule("POS & Sales"), ["Read", "Create", "Approve", "Override"]), ...grant(bySub("Returns"), ["Read", "Approve"]), ...grant(bySub("Stock Visibility"), ["Read"]) } }),
  role({ id: "ROLE-008", name: "Senior Cashier", code: "SRCASHIER", description: "POS, customers, payments, basic returns, quotations, stock enquiry.", recordScope: "Own Records", permissions: { ...grant(byModule("POS & Sales", "Payments"), ["Create", "Read", "Print"]), ...grant(bySub("Customer Master"), ["Create", "Read"]), ...grant(bySub("Returns"), ["Create", "Submit"]), ...grant(bySub("Stock Visibility"), ["Read"]) } }),
  role({ id: "ROLE-002", name: "Cashier", code: "CASHIER", description: "POS, customer search, retail customer creation, payments, own transactions only.", terminalScope: "Assigned Terminal Only", recordScope: "Own Records", branches: ["Riyadh Main Branch"], permissions: { ...grant(bySub("Checkout"), ["Create", "Read", "Print"]), ...grant(bySub("Tenders"), ["Create", "Read"]), ...grant(bySub("Customer Master"), ["Create", "Read"]), ...grant(bySub("Stock Visibility"), ["Read"]) } }),
  role({ id: "ROLE-009", name: "Sales Representative", code: "SALESREP", description: "Customer sales, quotations and follow-up.", recordScope: "Own Records", permissions: grant(byModule("POS & Sales", "Customers & Contractors"), ["Create", "Read", "Submit"]) }),
  role({ id: "ROLE-010", name: "Contractor Sales Officer", code: "CONSALES", description: "Contractor customers, projects, quotations, project rates, contractor statements.", permissions: { ...grant(bySub("Contractor Ledger"), ["Read", "Export"]), ...grant(bySub("Projects"), ["Create", "Read", "Update"]), ...grant(bySub("Quotations"), ["Create", "Read", "Submit"]), ...grant(bySub("Customer Master"), ["Create", "Read", "Update"]) } }),
  role({ id: "ROLE-003", name: "Inventory Officer", code: "INVOFF", description: "Add stock, adjustments, transfers, stock taking, quarantine.", branches: ["Riyadh Main Branch"], permissions: grant(byModule("Inventory"), ["Create", "Read", "Submit"]) }),
  role({ id: "ROLE-011", name: "Inventory Manager", code: "INVMGR", type: "Managerial Role", description: "All inventory operations plus adjustment, count and transfer approval.", permissions: grant(byModule("Inventory"), ["Create", "Read", "Update", "Submit", "Approve", "Post", "Export"]) }),
  role({ id: "ROLE-012", name: "Stock Location Staff", code: "LOCSTAFF", description: "Bin-level put-away, picking and quarantine movement.", permissions: grant(bySub("Reservations & Quarantine").concat(bySub("Stock Visibility")), ["Read", "Update"]) }),
  role({ id: "ROLE-013", name: "Procurement Officer", code: "PROCOFF", description: "Supplier search, offers, PO creation, supplier returns.", permissions: grant(byModule("Purchasing"), ["Create", "Read", "Submit"]) }),
  role({ id: "ROLE-014", name: "Procurement Manager", code: "PROCMGR", type: "Managerial Role", description: "Supplier management, purchase and supplier-return approval, performance.", permissions: grant(byModule("Purchasing"), ["Create", "Read", "Update", "Submit", "Approve", "Reject", "Export"]) }),
  role({ id: "ROLE-015", name: "Finance Officer", code: "FINOFF", description: "Customer payments, bank-transfer confirmation, contractor ledgers, statements, aging.", permissions: { ...grant(bySub("Contractor Ledger"), ["Create", "Read", "Submit", "Export"]), ...grant(bySub("Control"), ["Read", "Update"]) } }),
  role({ id: "ROLE-004", name: "Finance Manager", code: "FINMGR", type: "Approval Role", description: "Contractor credit approval, ledger adjustment approval, payment reversal, credit holds.", branchScope: "Selected Branches", branches: ["Riyadh Main Branch", "Jeddah Branch"], permissions: { ...grant(bySub("Contractor Ledger"), ["Create", "Read", "Update", "Approve", "Post", "Export"]), ...grant(bySub("Control"), ["Read", "Update", "Approve"]) } }),
  role({ id: "ROLE-016", name: "Delivery Coordinator", code: "DELCOORD", description: "Delivery planning, driver and vehicle assignment, dispatch.", permissions: grant(byModule("Delivery & Dispatch"), ["Create", "Read", "Update", "Submit"]) }),
  role({ id: "ROLE-017", name: "Driver", code: "DRIVER", description: "Assigned delivery execution and proof of delivery.", recordScope: "Assigned Records", permissions: grant(bySub("Delivery Orders"), ["Read", "Update"]) }),
  role({ id: "ROLE-018", name: "HR Officer", code: "HROFF", description: "Employee records, attendance, leave submission, documents.", permissions: grant(byModule("HRMS"), ["Create", "Read", "Update", "Submit"]) }),
  role({ id: "ROLE-019", name: "HR Manager", code: "HRMGR", type: "Managerial Role", description: "HR approvals, contracts, sensitive HR documents.", permissions: grant(byModule("HRMS"), ["Create", "Read", "Update", "Submit", "Approve", "Reject", "Export"]) }),
  role({ id: "ROLE-020", name: "Auditor", code: "AUDITOR", description: "Read-only access across modules plus audit-log export.", branchScope: "All Branches", recordScope: "All Records", permissions: grant(PERMISSION_CATALOG, ["Read", "Export"]) }),
  role({ id: "ROLE-005", name: "Vendor User", code: "VENDOR", type: "Vendor Role", description: "Own supplier profile, own products and POs, invoice and certificate upload.", branchScope: "No Branch Access", terminalScope: "No Terminal Access", recordScope: "Own Records", permissions: { ...grant(bySub("Purchase Orders"), ["Read", "Submit"]), ...grant(bySub("Supplier Returns"), ["Read", "Create"]) } }),
];

const SEED_ASSIGNMENTS: RoleAssignment[] = [
  { id: "ASG-0001", userName: "Ahmed Al-Harbi", roleId: "ROLE-001", branchScope: "Riyadh Main Branch", terminalScope: "All Terminals", effectiveFrom: today, temporary: false, reason: "Branch leadership", assignedBy: "System Administrator", status: "Active" },
  { id: "ASG-0002", userName: "Sara Al-Otaibi", roleId: "ROLE-002", branchScope: "Riyadh Main Branch", terminalScope: "Assigned Terminal Only", effectiveFrom: today, temporary: false, reason: "Front counter", assignedBy: "Ahmed Al-Harbi", status: "Active" },
  { id: "ASG-0003", userName: "Khalid Al-Mutairi", roleId: "ROLE-002", branchScope: "Riyadh Main Branch", terminalScope: "Assigned Terminal Only", effectiveFrom: today, temporary: false, reason: "Front counter", assignedBy: "Ahmed Al-Harbi", status: "Active" },
  { id: "ASG-0004", userName: "Noura Al-Salem", roleId: "ROLE-003", branchScope: "Riyadh Main Branch", terminalScope: "No Terminal Access", effectiveFrom: today, temporary: false, reason: "Stockroom operations", assignedBy: "Ahmed Al-Harbi", status: "Active" },
  { id: "ASG-0005", userName: "Maha Al-Rashid", roleId: "ROLE-004", branchScope: "Riyadh, Jeddah", terminalScope: "No Terminal Access", effectiveFrom: today, temporary: false, reason: "Credit control", assignedBy: "System Administrator", status: "Active" },
  { id: "ASG-0006", userName: "Yousef Al-Qahtani", roleId: "ROLE-005", branchScope: "Own Supplier Only", terminalScope: "No Terminal Access", effectiveFrom: today, temporary: false, reason: "Vendor portal", assignedBy: "System Administrator", status: "Active" },
  { id: "ASG-0007", userName: "Omar Al-Dossari", roleId: "ROLE-005", branchScope: "Own Supplier Only", terminalScope: "No Terminal Access", effectiveFrom: today, temporary: false, reason: "Vendor portal", assignedBy: "System Administrator", status: "Active" },
  { id: "ASG-0008", userName: "Mansour Al-Harbi", roleId: "ROLE-005", branchScope: "Own Supplier Only", terminalScope: "No Terminal Access", effectiveFrom: today, temporary: false, reason: "Vendor portal", assignedBy: "System Administrator", status: "Active" },
];

const SEED_DIRECT: DirectPermission[] = [
  { id: "DP-0001", userName: "Sara Al-Otaibi", featureKey: "pos-sales.quotations.quotation", action: "Create", mode: "Allow", branch: "Riyadh Main Branch", terminal: "T-RYD-01", effectiveFrom: today, reason: "Covers contractor counter on weekends", requestedBy: "Ahmed Al-Harbi", approvedBy: "System Administrator", status: "Active" },
  { id: "DP-0002", userName: "Noura Al-Salem", featureKey: "products.sensitive.view-product-cost", action: "Read", mode: "Allow", branch: "Riyadh Main Branch", terminal: "-", effectiveFrom: today, reason: "Cost reconciliation during stock take", requestedBy: "Ahmed Al-Harbi", status: "Pending Approval" },
  { id: "DP-0003", userName: "Ahmed Al-Harbi", featureKey: "returns-refunds.refunds.approve-refund", action: "Approve", mode: "Deny", branch: "Riyadh Main Branch", terminal: "-", effectiveFrom: today, reason: "Segregation of duties during audit period", requestedBy: "Maha Al-Rashid", approvedBy: "System Administrator", status: "Active" },
];

const SEED_LIMITS: ApprovalLimit[] = [
  { id: "AL-0001", roleId: "ROLE-002", module: "POS & Sales", transactionType: "Discount", minAmount: 0, maxAmount: 0, maxDiscountPercent: 5, branchScope: "Assigned Branch Only", effectiveFrom: today, status: "Active" },
  { id: "AL-0002", roleId: "ROLE-007", module: "POS & Sales", transactionType: "Discount", minAmount: 0, maxAmount: 0, maxDiscountPercent: 15, branchScope: "Assigned Branch Only", effectiveFrom: today, status: "Active" },
  { id: "AL-0003", roleId: "ROLE-007", module: "Returns & Refunds", transactionType: "Refund", minAmount: 0, maxAmount: 5000, branchScope: "Assigned Branch Only", effectiveFrom: today, status: "Active" },
  { id: "AL-0004", roleId: "ROLE-001", module: "Returns & Refunds", transactionType: "Refund", minAmount: 0, maxAmount: 25000, branchScope: "Selected Branches", effectiveFrom: today, status: "Active" },
  { id: "AL-0005", roleId: "ROLE-001", module: "Purchasing", transactionType: "Purchase Order", minAmount: 0, maxAmount: 250000, branchScope: "Selected Branches", effectiveFrom: today, status: "Active" },
  { id: "AL-0006", roleId: "ROLE-011", module: "Inventory", transactionType: "Stock Adjustment", minAmount: 0, maxAmount: 100000, branchScope: "All Branches", effectiveFrom: today, status: "Active" },
  { id: "AL-0007", roleId: "ROLE-014", module: "Purchasing", transactionType: "Purchase Order", minAmount: 0, maxAmount: 500000, branchScope: "All Branches", effectiveFrom: today, status: "Active" },
  { id: "AL-0008", roleId: "ROLE-004", module: "Customers & Contractors", transactionType: "Contractor Credit Limit", minAmount: 0, maxAmount: 500000, branchScope: "Selected Branches", effectiveFrom: today, status: "Active" },
  { id: "AL-0009", roleId: "ROLE-004", module: "Customers & Contractors", transactionType: "Ledger Adjustment", minAmount: 0, maxAmount: 100000, branchScope: "Selected Branches", effectiveFrom: today, status: "Active" },
];

export function logPermissionEvent(event: string, opts: { recordId?: string; user?: string; oldValue?: string; newValue?: string; reason?: string; severity?: "info" | "warning" | "critical" } = {}) {
  useAuditStore.getState().log({
    module: "system", event, recordId: opts.recordId, user: opts.user ?? "System Administrator",
    oldValue: opts.oldValue, newValue: opts.newValue, reason: opts.reason, severity: opts.severity ?? "info",
  });
}

type S = {
  roles: RbacRole[];
  assignments: RoleAssignment[];
  direct: DirectPermission[];
  limits: ApprovalLimit[];
  createRole: (r: Omit<RbacRole, "id">) => RbacRole;
  updateRole: (id: string, patch: Partial<RbacRole>) => void;
  duplicateRole: (id: string) => RbacRole | null;
  setRoleStatus: (id: string, status: RbacRole["status"]) => void;
  togglePermission: (roleId: string, featureKey: string, action: PermissionActionKey) => void;
  bulkSet: (roleId: string, featureKeys: string[], actions: PermissionActionKey[], value: boolean) => void;
  copyPermissions: (fromRoleId: string, toRoleId: string) => void;
  assignRole: (a: Omit<RoleAssignment, "id">) => void;
  setAssignmentStatus: (id: string, status: RoleAssignment["status"]) => void;
  addDirect: (d: Omit<DirectPermission, "id" | "status">) => void;
  decideDirect: (id: string, approve: boolean, checker: string) => string | null;
  removeDirect: (id: string) => void;
  addLimit: (l: Omit<ApprovalLimit, "id">) => void;
  updateLimit: (id: string, patch: Partial<ApprovalLimit>) => void;
};

let seq = 100;
const nid = (p: string) => `${p}-${String(++seq).padStart(4, "0")}`;

export const useRbacStore = create<S>()(
  persist(
    (set, get) => ({
      roles: SEED_ROLES,
      assignments: SEED_ASSIGNMENTS,
      direct: SEED_DIRECT,
      limits: SEED_LIMITS,

      createRole: (r) => {
        const id = nid("ROLE");
        const created: RbacRole = { ...r, id };
        set((s) => ({ roles: [...s.roles, created] }));
        logPermissionEvent("ROLE_CREATED", { recordId: id, newValue: r.name });
        return created;
      },
      updateRole: (id, patch) => {
        set((s) => ({ roles: s.roles.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
        logPermissionEvent("ROLE_UPDATED", { recordId: id, newValue: Object.keys(patch).join(", ") });
      },
      duplicateRole: (id) => {
        const src = get().roles.find((r) => r.id === id);
        if (!src) return null;
        const copy: RbacRole = { ...src, id: nid("ROLE"), name: `${src.name} (Copy)`, code: `${src.code}-C`, status: "Draft", permissions: JSON.parse(JSON.stringify(src.permissions)) };
        set((s) => ({ roles: [...s.roles, copy] }));
        logPermissionEvent("ROLE_DUPLICATED", { recordId: copy.id, oldValue: src.name, newValue: copy.name });
        return copy;
      },
      setRoleStatus: (id, status) => {
        const prev = get().roles.find((r) => r.id === id)?.status;
        set((s) => ({ roles: s.roles.map((r) => (r.id === id ? { ...r, status } : r)) }));
        logPermissionEvent(status === "Active" ? "ROLE_ACTIVATED" : "ROLE_DEACTIVATED", { recordId: id, oldValue: prev, newValue: status, severity: status === "Active" ? "info" : "warning" });
      },
      togglePermission: (roleId, featureKey, action) => {
        set((s) => ({
          roles: s.roles.map((r) => {
            if (r.id !== roleId) return r;
            const cell = { ...(r.permissions[featureKey] ?? {}) };
            cell[action] = !cell[action];
            return { ...r, permissions: { ...r.permissions, [featureKey]: cell } };
          }),
        }));
        logPermissionEvent("PERMISSION_MATRIX_UPDATED", { recordId: roleId, newValue: `${featureKey} / ${action}` });
      },
      bulkSet: (roleId, featureKeys, actions, value) => {
        set((s) => ({
          roles: s.roles.map((r) => {
            if (r.id !== roleId) return r;
            const perms = { ...r.permissions };
            for (const key of featureKeys) {
              const cell = { ...(perms[key] ?? {}) };
              for (const a of actions) cell[a] = value;
              perms[key] = cell;
            }
            return { ...r, permissions: perms };
          }),
        }));
        logPermissionEvent("PERMISSION_MATRIX_UPDATED", { recordId: roleId, newValue: `${value ? "Granted" : "Cleared"} ${featureKeys.length} feature(s)` });
      },
      copyPermissions: (fromRoleId, toRoleId) => {
        const src = get().roles.find((r) => r.id === fromRoleId);
        if (!src) return;
        set((s) => ({ roles: s.roles.map((r) => (r.id === toRoleId ? { ...r, permissions: JSON.parse(JSON.stringify(src.permissions)) } : r)) }));
        logPermissionEvent("PERMISSION_MATRIX_UPDATED", { recordId: toRoleId, oldValue: fromRoleId, newValue: `Copied from ${src.name}` });
      },
      assignRole: (a) => {
        const id = nid("ASG");
        set((s) => ({ assignments: [{ ...a, id }, ...s.assignments] }));
        logPermissionEvent("ROLE_ASSIGNED", { recordId: id, user: a.userName, newValue: a.roleId, reason: a.reason });
      },
      setAssignmentStatus: (id, status) => {
        const a = get().assignments.find((x) => x.id === id);
        set((s) => ({ assignments: s.assignments.map((x) => (x.id === id ? { ...x, status } : x)) }));
        const evt = status === "Removed" ? "ROLE_REMOVED" : status === "Suspended" ? "ROLE_SUSPENDED" : "ROLE_ASSIGNED";
        logPermissionEvent(evt, { recordId: id, user: a?.userName, oldValue: a?.status, newValue: status, severity: status === "Active" ? "info" : "warning" });
      },
      addDirect: (d) => {
        const id = nid("DP");
        set((s) => ({ direct: [{ ...d, id, status: "Pending Approval" }, ...s.direct] }));
        logPermissionEvent("ACCESS_REQUEST_SUBMITTED", { recordId: id, user: d.userName, newValue: `${d.mode} / ${d.action}`, reason: d.reason });
      },
      // Maker-Checker: the requester may never approve their own access request (§87.10).
      decideDirect: (id, approve, checker) => {
        const d = get().direct.find((x) => x.id === id);
        if (!d) return "Request not found.";
        if (approve && checker.trim().toLowerCase() === d.requestedBy.trim().toLowerCase()) {
          return "Maker-Checker: the requester cannot approve their own access request.";
        }
        set((s) => ({ direct: s.direct.map((x) => (x.id === id ? { ...x, status: approve ? "Active" : "Rejected", approvedBy: checker } : x)) }));
        logPermissionEvent(approve ? "ACCESS_REQUEST_APPROVED" : "ACCESS_REQUEST_REJECTED", { recordId: id, user: d.userName, newValue: `${d.mode} ${d.action}`, reason: `Checker: ${checker}`, severity: approve ? "info" : "warning" });
        if (approve) logPermissionEvent(d.mode === "Allow" ? "DIRECT_PERMISSION_GRANTED" : "DIRECT_PERMISSION_DENIED", { recordId: id, user: d.userName, newValue: d.featureKey });
        return null;
      },
      removeDirect: (id) => {
        const d = get().direct.find((x) => x.id === id);
        set((s) => ({ direct: s.direct.filter((x) => x.id !== id) }));
        logPermissionEvent("DIRECT_PERMISSION_REMOVED", { recordId: id, user: d?.userName, oldValue: d?.featureKey, severity: "warning" });
      },
      addLimit: (l) => {
        const id = nid("AL");
        set((s) => ({ limits: [{ ...l, id }, ...s.limits] }));
        logPermissionEvent("APPROVAL_LIMIT_CHANGED", { recordId: id, newValue: `${l.transactionType} <= ${l.maxAmount}` });
      },
      updateLimit: (id, patch) => {
        set((s) => ({ limits: s.limits.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
        logPermissionEvent("APPROVAL_LIMIT_CHANGED", { recordId: id, newValue: JSON.stringify(patch) });
      },
    }),
    { name: "buildpos-rbac-v1", version: 1 }
  )
);

/** Effective access for a user on one feature/action - direct deny beats inherited allow (§87.8). */
export function effectiveState(
  state: Pick<S, "roles" | "assignments" | "direct">,
  userName: string,
  featureKey: string,
  action: PermissionActionKey
): EffectiveState {
  const directRows = state.direct.filter((d) => d.userName === userName && d.featureKey === featureKey && d.action === action && d.status === "Active");
  if (directRows.some((d) => d.mode === "Deny")) return "Direct Deny";
  if (directRows.some((d) => d.mode === "Allow")) return "Direct Allow";
  const activeRoleIds = state.assignments.filter((a) => a.userName === userName && a.status === "Active").map((a) => a.roleId);
  const inherited = state.roles.some((r) => activeRoleIds.includes(r.id) && r.status === "Active" && Boolean(r.permissions[featureKey]?.[action] || r.permissions[featureKey]?.["Full Control"]));
  return inherited ? "Inherited" : "Denied";
}

export function usersWithRoles(state: Pick<S, "assignments">) {
  return [...new Set(state.assignments.map((a) => a.userName))].sort();
}
