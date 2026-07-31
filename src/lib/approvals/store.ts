/**
 * Maker-Checker Approval System (BRD §82).
 *
 * One central queue for every module that needs a second pair of eyes. The rules that matter are
 * enforced here, in the store, not in the UI: the maker can never be the checker, the checker must
 * hold an active role assignment that grants approval on the module, must cover the record's
 * branch, and must stay inside their financial limit. Decisions are appended to an immutable
 * history — nothing is ever deleted.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";

export const ROLES = [
  "Cashier",
  "Senior Cashier",
  "Supervisor",
  "Store Manager",
  "Inventory Officer",
  "Inventory Manager",
  "Procurement Manager",
  "Finance Manager",
  "HR Manager",
  "System Admin",
] as const;
export type Role = (typeof ROLES)[number];

/** Which roles may approve which modules, and up to what value. */
export const ROLE_APPROVAL_LIMITS: Record<string, { modules: string[]; limit: number }> = {
  Supervisor: { modules: ["Discounts", "Returns", "Refunds", "Shift Variance"], limit: 5_000 },
  "Store Manager": { modules: ["*"], limit: 250_000 },
  "Inventory Officer": { modules: [], limit: 0 },
  "Inventory Manager": { modules: ["Stock Adjustments", "Stock Taking", "Stock Transfers", "Supplier Returns"], limit: 150_000 },
  "Procurement Manager": { modules: ["Purchase Orders", "Supplier Returns"], limit: 200_000 },
  "Finance Manager": { modules: ["Customer Credit", "Refunds", "Expenses", "Purchase Orders", "Price Overrides", "Shift Variance"], limit: 500_000 },
  "HR Manager": { modules: ["Leave", "Attendance Adjustments"], limit: 100_000 },
  "System Admin": { modules: ["*"], limit: Number.POSITIVE_INFINITY },
  Cashier: { modules: [], limit: 0 },
  "Senior Cashier": { modules: [], limit: 0 },
};

export const APPROVAL_MODULES = ["Discounts", "Returns", "Refunds", "Customer Credit", "Stock Adjustments", "Stock Taking", "Stock Transfers", "Purchase Orders", "Supplier Returns", "Price Overrides", "Expenses", "Shift Variance", "Attendance Adjustments", "Leave", "User Access", "Role Changes", "Business Rules"];

export const BRANCH_LIST = ["Riyadh Main Branch", "Jeddah Branch", "Dammam Branch", "Khobar Building Materials Branch", "Central Warehouse"];
export const TERMINAL_LIST = ["POS-RYD-01", "POS-RYD-02", "POS-JED-01", "POS-DMM-01"];
export const PERMISSION_LIST = ["View", "Create", "Edit", "Delete", "Approve", "Post", "View Cost", "Override Price", "Manage Users"];

export type RoleAssignmentStatus = "Active" | "Scheduled" | "Expired" | "Suspended" | "Removed";

export type RoleAssignment = {
  id: string;
  userId: string;
  role: Role;
  branchScope: string[];
  terminalScope: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  reason: string;
  assignedBy: string;
  status: RoleAssignmentStatus;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  branch: string;
  active: boolean;
  permissions: string[];
  terminals: string[];
};

export type ApprovalLevel = {
  level: number;
  assignmentType: "Role-Based" | "User-Based";
  role?: Role;
  userId?: string;
  fallbackRole?: Role;
  status: "Not Started" | "Pending" | "Approved" | "Rejected";
  decidedBy?: string;
  decidedAt?: number;
  comment?: string;
};

export type ApprovalStatus =
  | "Pending Checker"
  | "In Progress"
  | "Approved"
  | "Rejected"
  | "Returned for Correction"
  | "Reassigned"
  | "Escalated"
  | "Cancelled";

export type ApprovalHistoryEntry = { ts: number; actor: string; action: string; detail?: string };

export type ApprovalRequest = {
  id: string;
  module: string;
  requestType: string;
  recordRef: string;
  branch: string;
  makerId: string;
  makerRole: string;
  mode: "Sequential" | "Parallel" | "Single";
  priority: "Low" | "Normal" | "High" | "Urgent";
  amount?: number;
  variance?: string;
  requestedAt: number;
  dueAt: number;
  status: ApprovalStatus;
  levels: ApprovalLevel[];
  comments: { ts: number; author: string; text: string }[];
  history: ApprovalHistoryEntry[];
  sourceRule?: string;
  pinRequired?: boolean;
};

export type MatrixEntry = {
  id: string;
  name: string;
  module: string;
  transactionType: string;
  assignmentType: "Role-Based" | "User-Based" | "Multi-Level";
  makerRole: Role;
  checkerRole?: Role;
  checkerUserId?: string;
  branchScope: string[];
  minAmount?: number;
  maxAmount?: number;
  minVariance?: number;
  maxVariance?: number;
  sequence: "Sequential" | "Parallel";
  pinRequired: boolean;
  attachmentRequired: boolean;
  reasonRequired: boolean;
  escalationHours: number;
  fallbackRole?: Role;
  active: boolean;
};

const HOUR = 3_600_000;
const now = Date.now();

const SEED_USERS: AppUser[] = [
  { id: "U-001", name: "Noura Al-Salem", email: "noura@ecr.sa", branch: "Riyadh Main Branch", active: true, permissions: ["View", "Create", "Edit"], terminals: [] },
  { id: "U-002", name: "Abdullah Al-Rashid", email: "abdullah@ecr.sa", branch: "Riyadh Main Branch", active: true, permissions: ["View", "Create", "Edit", "Approve", "Post", "View Cost"], terminals: [] },
  { id: "U-003", name: "Maha Al-Rashid", email: "maha@ecr.sa", branch: "Riyadh Main Branch", active: true, permissions: ["View", "Create", "Approve", "View Cost"], terminals: [] },
  { id: "U-004", name: "Faisal Al-Harbi", email: "faisal@ecr.sa", branch: "Riyadh Main Branch", active: true, permissions: ["View", "Create"], terminals: ["POS-RYD-02"] },
  { id: "U-005", name: "Ahmed Al-Harbi", email: "ahmed@ecr.sa", branch: "Jeddah Branch", active: true, permissions: ["View", "Create", "Edit", "Approve"], terminals: [] },
  { id: "U-006", name: "Sara Al-Mansour", email: "sara@ecr.sa", branch: "Riyadh Main Branch", active: true, permissions: ["View", "Create"], terminals: [] },
  { id: "U-007", name: "Jawad Al-Qahtani", email: "jawad@ecr.sa", branch: "Riyadh Main Branch", active: true, permissions: ["View", "Approve", "Manage Users"], terminals: [] },
  { id: "U-008", name: "System Administrator", email: "ahmad.aziz@mytm.co", branch: "Riyadh Main Branch", active: true, permissions: [...PERMISSION_LIST], terminals: [...TERMINAL_LIST] },
  { id: "U-009", name: "Omar Al-Dossary", email: "omar@ecr.sa", branch: "Dammam Branch", active: true, permissions: ["View", "Create", "Approve"], terminals: ["POS-DMM-01"] },
];

const ra = (id: string, userId: string, role: Role, branches: string[], status: RoleAssignmentStatus = "Active"): RoleAssignment => ({
  id,
  userId,
  role,
  branchScope: branches,
  terminalScope: [],
  effectiveFrom: "2026-01-01",
  reason: "Initial provisioning",
  assignedBy: "System Administrator",
  status,
});

const SEED_ASSIGNMENTS: RoleAssignment[] = [
  ra("RA-001", "U-001", "Inventory Officer", ["Riyadh Main Branch"]),
  ra("RA-002", "U-002", "Inventory Manager", ["Riyadh Main Branch", "Central Warehouse"]),
  ra("RA-003", "U-003", "Procurement Manager", ["Riyadh Main Branch"]),
  ra("RA-004", "U-004", "Senior Cashier", ["Riyadh Main Branch"]),
  ra("RA-005", "U-005", "Store Manager", ["Jeddah Branch"]),
  ra("RA-006", "U-006", "Cashier", ["Riyadh Main Branch"]),
  ra("RA-007", "U-007", "Finance Manager", ["Riyadh Main Branch", "Jeddah Branch", "Dammam Branch"]),
  ra("RA-008", "U-008", "System Admin", [...BRANCH_LIST]),
  ra("RA-009", "U-009", "Store Manager", ["Dammam Branch"]),
];

const SEED_MATRIX: MatrixEntry[] = [
  {
    id: "AMX-001", name: "Stock Take Variance Approval", module: "Stock Taking", transactionType: "Stock Take Variance",
    assignmentType: "Role-Based", makerRole: "Inventory Officer", checkerRole: "Inventory Manager", branchScope: [...BRANCH_LIST],
    minVariance: 5, sequence: "Sequential", pinRequired: false, attachmentRequired: false, reasonRequired: true,
    escalationHours: 8, fallbackRole: "Store Manager", active: true,
  },
  {
    id: "AMX-002", name: "High-Value Purchase Order", module: "Purchase Orders", transactionType: "Purchase Order Submission",
    assignmentType: "Multi-Level", makerRole: "Procurement Manager", checkerRole: "Finance Manager", branchScope: [...BRANCH_LIST],
    minAmount: 100_000, sequence: "Sequential", pinRequired: true, attachmentRequired: true, reasonRequired: false,
    escalationHours: 24, fallbackRole: "Store Manager", active: true,
  },
  {
    id: "AMX-003", name: "Contractor Credit Exposure", module: "Customer Credit", transactionType: "Account Credit Payment",
    assignmentType: "User-Based", makerRole: "Cashier", checkerUserId: "U-007", branchScope: ["Riyadh Main Branch"],
    minAmount: 10_000, sequence: "Sequential", pinRequired: true, attachmentRequired: false, reasonRequired: true,
    escalationHours: 4, fallbackRole: "Finance Manager", active: true,
  },
  {
    id: "AMX-004", name: "Role Change Authorisation", module: "Role Changes", transactionType: "Role Assignment",
    assignmentType: "User-Based", makerRole: "System Admin", checkerUserId: "U-007", branchScope: [...BRANCH_LIST],
    sequence: "Sequential", pinRequired: false, attachmentRequired: false, reasonRequired: true,
    escalationHours: 12, fallbackRole: "Store Manager", active: true,
  },
];

const SEED_REQUESTS: ApprovalRequest[] = [
  {
    id: "APR-2026-0881", module: "Stock Taking", requestType: "Approve Stock Take Variance", recordRef: "STK-TAKE-2026-0040",
    branch: "Riyadh Main Branch", makerId: "U-001", makerRole: "Inventory Officer", mode: "Single", priority: "High",
    variance: "4 variance SKUs · net -24 units", requestedAt: now - 3 * HOUR, dueAt: now + 5 * HOUR, status: "Pending Checker",
    levels: [{ level: 1, assignmentType: "Role-Based", role: "Inventory Manager", fallbackRole: "Store Manager", status: "Pending" }],
    comments: [], sourceRule: "RULE-STK-001",
    history: [{ ts: now - 3 * HOUR, actor: "Noura Al-Salem", action: "Submitted", detail: "Rule matched: High Stock-Take Variance Approval" }],
  },
  {
    id: "APR-2026-0882", module: "Purchase Orders", requestType: "Approve Purchase Order", recordRef: "PO-2026-0568",
    branch: "Riyadh Main Branch", makerId: "U-003", makerRole: "Procurement Manager", mode: "Sequential", priority: "High",
    amount: 148_500, requestedAt: now - 26 * HOUR, dueAt: now - 2 * HOUR, status: "In Progress", pinRequired: true,
    levels: [
      { level: 1, assignmentType: "Role-Based", role: "Procurement Manager", status: "Approved", decidedBy: "U-005", decidedAt: now - 20 * HOUR, comment: "Pricing verified against offer comparison." },
      { level: 2, assignmentType: "Role-Based", role: "Finance Manager", status: "Pending" },
      { level: 3, assignmentType: "Role-Based", role: "Store Manager", status: "Not Started" },
    ],
    comments: [], sourceRule: "RULE-PO-002",
    history: [
      { ts: now - 26 * HOUR, actor: "Maha Al-Rashid", action: "Submitted", detail: "SAR 148,500 exceeds SAR 100,000 threshold" },
      { ts: now - 20 * HOUR, actor: "Ahmed Al-Harbi", action: "Approved Level 1" },
    ],
  },
  {
    id: "APR-2026-0883", module: "User Access", requestType: "Assign Finance Manager Role", recordRef: "USR-CHG-2026-0114",
    branch: "Riyadh Main Branch", makerId: "U-008", makerRole: "System Admin", mode: "Single", priority: "Normal",
    requestedAt: now - 40 * 60_000, dueAt: now + 11 * HOUR, status: "Pending Checker",
    levels: [{ level: 1, assignmentType: "User-Based", userId: "U-007", status: "Pending" }],
    comments: [], history: [{ ts: now - 40 * 60_000, actor: "System Administrator", action: "Submitted", detail: "User: Sara Al-Mansour" }],
  },
];

export type EligibilityResult = { eligible: boolean; reason?: string };

type Handler = (req: ApprovalRequest, outcome: "Approved" | "Rejected" | "Returned for Correction") => void;
const handlers = new Map<string, Handler>();
/** Modules register here so an approval decision flows back into the source record. */
export function registerApprovalHandler(module: string, fn: Handler) {
  handlers.set(module, fn);
}

type S = {
  users: AppUser[];
  assignments: RoleAssignment[];
  requests: ApprovalRequest[];
  matrix: MatrixEntry[];
  currentUserId: string;
  seq: number;

  setCurrentUser: (id: string) => void;
  submitApproval: (input: Omit<ApprovalRequest, "id" | "requestedAt" | "dueAt" | "status" | "comments" | "history"> & { escalationHours?: number }) => string;
  decide: (id: string, actorId: string, action: "approve" | "reject" | "return", comment?: string) => { ok: boolean; error?: string };
  reassign: (id: string, level: number, toUserId: string, actorId: string, reason: string) => { ok: boolean; error?: string };
  escalate: (id: string, actorId: string) => void;
  addComment: (id: string, actorId: string, text: string) => void;

  assignRole: (input: Omit<RoleAssignment, "id" | "status"> & { status?: RoleAssignmentStatus }) => void;
  removeRole: (assignmentId: string, actorId: string) => void;
  suspendRole: (assignmentId: string, actorId: string) => void;
  reactivateRole: (assignmentId: string) => void;
  setUserActive: (userId: string, active: boolean) => void;
  togglePermission: (userId: string, permission: string) => void;
  toggleTerminal: (userId: string, terminal: string) => void;
  addUser: (u: Omit<AppUser, "id">) => string;

  upsertMatrix: (m: MatrixEntry) => void;
  toggleMatrix: (id: string) => void;
};

export const useApprovalStore = create<S>()(
  persist(
    (set, get) => ({
      users: SEED_USERS,
      assignments: SEED_ASSIGNMENTS,
      requests: SEED_REQUESTS,
      matrix: SEED_MATRIX,
      currentUserId: "U-002",
      seq: 884,

      setCurrentUser: (id) => set({ currentUserId: id }),

      submitApproval: (input) => {
        const seq = get().seq;
        const id = `APR-2026-${String(seq).padStart(4, "0")}`;
        const ts = Date.now();
        const levels = input.levels.map((l, i) => ({
          ...l,
          status: l.status ?? (i === 0 || input.mode === "Parallel" ? ("Pending" as const) : ("Not Started" as const)),
        }));
        const req: ApprovalRequest = {
          ...input,
          levels,
          id,
          requestedAt: ts,
          dueAt: ts + (input.escalationHours ?? 8) * HOUR,
          status: input.mode === "Sequential" && levels.length > 1 ? "In Progress" : "Pending Checker",
          comments: [],
          history: [{ ts, actor: userName(get().users, input.makerId), action: "Submitted", detail: input.sourceRule ? `Rule matched: ${input.sourceRule}` : undefined }],
        };
        set((s) => ({ requests: [req, ...s.requests], seq: s.seq + 1 }));
        audit("APPROVAL_REQUEST_CREATED", id, `${input.module} · ${input.recordRef}`, "info");
        return id;
      },

      decide: (id, actorId, action, comment) => {
        const state = get();
        const req = state.requests.find((r) => r.id === id);
        if (!req) return { ok: false, error: "Approval request not found." };
        const check = checkEligibility(state, req, actorId);
        if (!check.eligible) return { ok: false, error: check.reason };
        const actor = userName(state.users, actorId);
        const ts = Date.now();

        set((s) => ({
          requests: s.requests.map((r) => {
            if (r.id !== id) return r;
            if (action !== "approve") {
              const status: ApprovalStatus = action === "reject" ? "Rejected" : "Returned for Correction";
              return {
                ...r,
                status,
                levels: r.levels.map((l) => (l.status === "Pending" ? { ...l, status: "Rejected" as const, decidedBy: actorId, decidedAt: ts, comment } : l)),
                history: [...r.history, { ts, actor, action: action === "reject" ? "Rejected" : "Returned for Correction", detail: comment }],
              };
            }
            const pendingIdx = r.levels.findIndex((l) => l.status === "Pending" && levelAllowsUser(s, l, actorId, r.branch));
            const levels = r.levels.map((l, i) =>
              i === pendingIdx ? { ...l, status: "Approved" as const, decidedBy: actorId, decidedAt: ts, comment } : l
            );
            // Sequential: open the next level. Parallel: everything is already pending.
            if (r.mode === "Sequential") {
              const next = levels.findIndex((l) => l.status === "Not Started");
              if (next >= 0) levels[next] = { ...levels[next], status: "Pending" };
            }
            const allDone = levels.every((l) => l.status === "Approved");
            return {
              ...r,
              levels,
              status: allDone ? ("Approved" as ApprovalStatus) : ("In Progress" as ApprovalStatus),
              history: [...r.history, { ts, actor, action: `Approved Level ${levels[pendingIdx]?.level ?? 1}`, detail: comment }],
            };
          }),
        }));

        const updated = get().requests.find((r) => r.id === id)!;
        audit(
          action === "approve" ? "APPROVAL_APPROVED" : action === "reject" ? "APPROVAL_REJECTED" : "APPROVAL_RETURNED",
          id,
          `${updated.module} · ${updated.recordRef} · by ${actor}`,
          action === "approve" ? "info" : "warning"
        );
        if (updated.status === "Approved" || updated.status === "Rejected" || updated.status === "Returned for Correction") {
          handlers.get(updated.module)?.(updated, updated.status);
        }
        return { ok: true };
      },

      reassign: (id, level, toUserId, actorId, reason) => {
        const state = get();
        const req = state.requests.find((r) => r.id === id);
        if (!req) return { ok: false, error: "Approval request not found." };
        if (toUserId === req.makerId) return { ok: false, error: "The maker cannot be assigned as checker." };
        const ts = Date.now();
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "Reassigned",
                  levels: r.levels.map((l) => (l.level === level ? { ...l, assignmentType: "User-Based" as const, userId: toUserId, role: undefined, status: "Pending" as const } : l)),
                  history: [...r.history, { ts, actor: userName(s.users, actorId), action: `Reassigned Level ${level}`, detail: `${userName(s.users, toUserId)} — ${reason}` }],
                }
              : r
          ),
        }));
        audit("APPROVAL_REASSIGNED", id, `Level ${level} → ${userName(state.users, toUserId)}`, "warning");
        return { ok: true };
      },

      escalate: (id, actorId) => {
        const ts = Date.now();
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "Escalated",
                  levels: r.levels.map((l) => (l.status === "Pending" && l.fallbackRole ? { ...l, role: l.fallbackRole, assignmentType: "Role-Based" as const } : l)),
                  history: [...r.history, { ts, actor: userName(s.users, actorId), action: "Escalated", detail: "Escalated to fallback approver" }],
                }
              : r
          ),
        }));
        audit("APPROVAL_ESCALATED", id, "Escalated to fallback approver", "warning");
      },

      addComment: (id, actorId, text) =>
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? { ...r, comments: [...r.comments, { ts: Date.now(), author: userName(s.users, actorId), text }], history: [...r.history, { ts: Date.now(), actor: userName(s.users, actorId), action: "Comment added", detail: text }] }
              : r
          ),
        })),

      assignRole: (input) => {
        const id = `RA-${String(Date.now()).slice(-6)}`;
        const status = input.status ?? (new Date(input.effectiveFrom).getTime() > Date.now() ? "Scheduled" : "Active");
        set((s) => ({ assignments: [...s.assignments, { ...input, id, status }] }));
        audit("ROLE_ASSIGNED", id, `${input.role} → ${input.userId}`, "info");
      },

      removeRole: (assignmentId, actorId) => {
        const state = get();
        const assignment = state.assignments.find((a) => a.id === assignmentId);
        set((s) => ({ assignments: s.assignments.map((a) => (a.id === assignmentId ? { ...a, status: "Removed" } : a)) }));
        if (!assignment) return;
        // Access is revoked immediately, so any approval still waiting on this person/role must be
        // pushed back to the fallback role rather than sitting with someone who can no longer act.
        const affected = get().requests.filter((r) =>
          r.levels.some((l) => l.status === "Pending" && ((l.assignmentType === "User-Based" && l.userId === assignment.userId) || (l.assignmentType === "Role-Based" && l.role === assignment.role)))
        );
        if (affected.length) {
          set((s) => ({
            requests: s.requests.map((r) =>
              affected.some((a) => a.id === r.id)
                ? {
                    ...r,
                    status: "Reassigned",
                    levels: r.levels.map((l) =>
                      l.status === "Pending" && ((l.assignmentType === "User-Based" && l.userId === assignment.userId) || (l.assignmentType === "Role-Based" && l.role === assignment.role))
                        ? { ...l, assignmentType: "Role-Based" as const, role: l.fallbackRole ?? "Store Manager", userId: undefined }
                        : l
                    ),
                    history: [...r.history, { ts: Date.now(), actor: userName(s.users, actorId), action: "Auto-reassigned", detail: `${assignment.role} access removed from ${userName(s.users, assignment.userId)}` }],
                  }
                : r
            ),
          }));
        }
        audit("ROLE_REMOVED", assignmentId, `${assignment.role} removed · ${affected.length} approval(s) reassigned`, "warning");
      },

      suspendRole: (assignmentId, actorId) => {
        set((s) => ({ assignments: s.assignments.map((a) => (a.id === assignmentId ? { ...a, status: "Suspended" } : a)) }));
        audit("ROLE_SUSPENDED", assignmentId, `Suspended by ${userName(get().users, actorId)}`, "warning");
      },
      reactivateRole: (assignmentId) => {
        set((s) => ({ assignments: s.assignments.map((a) => (a.id === assignmentId ? { ...a, status: "Active" } : a)) }));
        audit("ROLE_REACTIVATED", assignmentId, "Role assignment reactivated", "info");
      },
      setUserActive: (userId, active) => {
        set((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, active } : u)) }));
        audit(active ? "USER_REACTIVATED" : "USER_DEACTIVATED", userId, userName(get().users, userId), active ? "info" : "warning");
      },
      togglePermission: (userId, permission) => {
        set((s) => ({
          users: s.users.map((u) =>
            u.id === userId ? { ...u, permissions: u.permissions.includes(permission) ? u.permissions.filter((p) => p !== permission) : [...u.permissions, permission] } : u
          ),
        }));
        audit("PERMISSION_CHANGED", userId, permission, "warning");
      },
      toggleTerminal: (userId, terminal) => {
        set((s) => ({
          users: s.users.map((u) =>
            u.id === userId ? { ...u, terminals: u.terminals.includes(terminal) ? u.terminals.filter((t) => t !== terminal) : [...u.terminals, terminal] } : u
          ),
        }));
        audit("TERMINAL_ACCESS_CHANGED", userId, terminal, "info");
      },
      addUser: (u) => {
        const id = `U-${String(Date.now()).slice(-4)}`;
        set((s) => ({ users: [...s.users, { ...u, id }] }));
        audit("USER_CREATED", id, u.name, "info");
        return id;
      },

      upsertMatrix: (m) =>
        set((s) => ({ matrix: s.matrix.some((x) => x.id === m.id) ? s.matrix.map((x) => (x.id === m.id ? m : x)) : [...s.matrix, m] })),
      toggleMatrix: (id) => set((s) => ({ matrix: s.matrix.map((m) => (m.id === id ? { ...m, active: !m.active } : m)) })),
    }),
    { name: "buildpos-approvals-v1" }
  )
);

// ————————————————————————— Helpers —————————————————————————

function audit(event: string, recordId: string, detail: string, severity: "info" | "warning" | "critical") {
  useAuditStore.getState().log({ module: "system", event, recordId, newValue: detail, severity });
}

export function userName(users: AppUser[], id?: string) {
  return users.find((u) => u.id === id)?.name ?? id ?? "—";
}

/** The roles a user currently holds (active assignments only). */
export function activeRoles(assignments: RoleAssignment[], userId: string): Role[] {
  const today = new Date().toISOString().slice(0, 10);
  return assignments
    .filter((a) => a.userId === userId && a.status === "Active" && a.effectiveFrom <= today && (!a.effectiveTo || a.effectiveTo >= today))
    .map((a) => a.role);
}

export function branchScopeOf(assignments: RoleAssignment[], userId: string): string[] {
  return Array.from(
    new Set(assignments.filter((a) => a.userId === userId && a.status === "Active").flatMap((a) => a.branchScope))
  );
}

function levelAllowsUser(state: Pick<S, "assignments" | "users">, level: ApprovalLevel, userId: string, branch: string): boolean {
  if (level.assignmentType === "User-Based") return level.userId === userId;
  const roles = activeRoles(state.assignments, userId);
  if (!level.role) return false;
  if (!roles.includes(level.role)) return false;
  return branchScopeOf(state.assignments, userId).includes(branch);
}

/** The full §82.2 maker-checker gate. */
export function checkEligibility(
  state: Pick<S, "assignments" | "users">,
  req: ApprovalRequest,
  userId: string
): EligibilityResult {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return { eligible: false, reason: "Unknown user." };
  if (!user.active) return { eligible: false, reason: "Your account is inactive." };
  if (req.makerId === userId) return { eligible: false, reason: "The maker cannot approve their own request." };
  if (req.status === "Approved" || req.status === "Rejected" || req.status === "Cancelled")
    return { eligible: false, reason: "This request is already closed." };
  if (!user.permissions.includes("Approve")) return { eligible: false, reason: "You do not hold the Approve permission." };

  const pending = req.levels.filter((l) => l.status === "Pending");
  if (!pending.length) return { eligible: false, reason: "No level is currently awaiting a decision." };
  const mine = pending.find((l) => levelAllowsUser(state, l, userId, req.branch));
  if (!mine) return { eligible: false, reason: "This level is assigned to another checker." };

  const roles = activeRoles(state.assignments, userId);
  if (!branchScopeOf(state.assignments, userId).includes(req.branch))
    return { eligible: false, reason: `You have no access to ${req.branch}.` };
  const moduleOk = roles.some((r) => {
    const cfg = ROLE_APPROVAL_LIMITS[r];
    return cfg && (cfg.modules.includes("*") || cfg.modules.includes(req.module));
  });
  if (!moduleOk) return { eligible: false, reason: `Your role cannot approve ${req.module}.` };
  const limit = Math.max(...roles.map((r) => ROLE_APPROVAL_LIMITS[r]?.limit ?? 0));
  if (req.amount != null && req.amount > limit)
    return { eligible: false, reason: `Amount exceeds your approval limit of SAR ${limit.toLocaleString()}.` };
  return { eligible: true };
}