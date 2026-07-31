/**
 * Rule Engine store (BRD §81) — evaluation, versions, execution logs, test mode.
 *
 * Evaluation mirrors what a server would do: types are validated against the registry, rules run in
 * priority order, effective dates and branch scope are honoured, and processing stops at the first
 * matched blocking action. Every run writes an execution log.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";
import {
  BLOCKING_ACTIONS,
  DATA_POINTS,
  dataPointById,
  eventById,
  type RuleStatus,
} from "./registry";

export type Condition = {
  id: string;
  kind: "condition";
  dataPointId: string;
  operator: string;
  value: string | string[];
  value2?: string;
};

export type ConditionGroup = {
  id: string;
  kind: "group";
  combinator: "AND" | "OR";
  children: (Condition | ConditionGroup)[];
};

export type RuleAction = {
  id: string;
  type: string;
  message?: string;
  role?: string;
  userId?: string;
  amount?: string;
  status?: string;
  priority?: string;
};

export type ApprovalRouting = {
  mode: "No Approval" | "Role-Based" | "User-Based" | "Approval Workflow";
  role?: string;
  fallbackRole?: string;
  userId?: string;
  workflowType?: "Sequential" | "Parallel";
  levels?: { level: number; role: string }[];
  pinRequired?: boolean;
};

export type RuleVersion = { version: number; ts: number; author: string; note: string; snapshot: Omit<Rule, "versions" | "id"> };

export type Rule = {
  id: string;
  name: string;
  code: string;
  category: string;
  description: string;
  priority: number;
  scope: "All Branches" | "Selected Branches";
  branches: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  status: RuleStatus;
  triggerEvent: string;
  conditions: ConditionGroup;
  actions: RuleAction[];
  approval: ApprovalRouting;
  version: number;
  versions: RuleVersion[];
  updatedAt: number;
};

export type ExecutionLog = {
  id: string;
  ruleId: string;
  ruleName: string;
  ts: number;
  mode: "Test" | "Live";
  result: "Passed" | "Failed" | "Approval Required" | "Blocked" | "Warning Generated" | "No Match";
  matched: string[];
  unmatched: string[];
  actions: string[];
  approvers: string[];
  record?: string;
  actor: string;
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export function emptyGroup(): ConditionGroup {
  return { id: uid(), kind: "group", combinator: "AND", children: [] };
}

export function newCondition(dataPointId = "", operator = ""): Condition {
  return { id: uid(), kind: "condition", dataPointId, operator, value: "" };
}

// ————————————————————————— Evaluation —————————————————————————

const num = (v: unknown) => Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
const asDate = (v: unknown) => new Date(String(v ?? "")).getTime();

export function evaluateCondition(c: Condition, sample: Record<string, string>): boolean {
  const dp = dataPointById(c.dataPointId);
  if (!dp) return false;
  const raw = sample[c.dataPointId] ?? "";
  const list = Array.isArray(c.value) ? c.value : String(c.value).split(",").map((s) => s.trim()).filter(Boolean);
  const one = Array.isArray(c.value) ? (c.value[0] ?? "") : String(c.value ?? "");

  switch (c.operator) {
    case "Is Empty": return raw.trim() === "";
    case "Is Not Empty": return raw.trim() !== "";
    case "Is True": return /^(true|yes|1)$/i.test(raw.trim());
    case "Is False": return /^(false|no|0)$/i.test(raw.trim());
  }

  if (dp.type === "currency" || dp.type === "number" || dp.type === "percentage") {
    const n = num(raw);
    const a = num(one);
    const b = num(c.value2);
    if (Number.isNaN(n)) return false;
    switch (c.operator) {
      case "Equals": return n === a;
      case "Does Not Equal": return n !== a;
      case "Greater Than": return n > a;
      case "Greater Than or Equal To": return n >= a;
      case "Less Than": return n < a;
      case "Less Than or Equal To": return n <= a;
      case "Between": return n >= a && n <= b;
      case "Not Between": return n < a || n > b;
      case "In List": return list.map(num).includes(n);
      case "Not In List": return !list.map(num).includes(n);
      default: return false;
    }
  }

  if (dp.type === "date") {
    const d = asDate(raw);
    const a = asDate(one);
    const b = asDate(c.value2);
    const today = new Date().setHours(0, 0, 0, 0);
    switch (c.operator) {
      case "On": return new Date(d).toDateString() === new Date(a).toDateString();
      case "Before": return d < a;
      case "After": return d > a;
      case "On or Before": return d <= a;
      case "On or After": return d >= a;
      case "Between": return d >= a && d <= b;
      case "Within Last": return d >= Date.now() - num(one) * 86_400_000 && d <= Date.now();
      case "Within Next": return d >= Date.now() && d <= Date.now() + num(one) * 86_400_000;
      case "Is Today": return new Date(d).setHours(0, 0, 0, 0) === today;
      case "Is Overdue": return d < Date.now();
      default: return false;
    }
  }

  if (dp.type === "collection") {
    const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
    switch (c.operator) {
      case "Contains Any": return list.some((v) => items.includes(v));
      case "Contains All": return list.every((v) => items.includes(v));
      case "Does Not Contain": return !list.some((v) => items.includes(v));
      case "Count Equals": return items.length === num(one);
      case "Count Greater Than": return items.length > num(one);
      case "Count Less Than": return items.length < num(one);
      default: return false;
    }
  }

  // text + enum
  const value = raw.trim().toLowerCase();
  const target = one.trim().toLowerCase();
  const lowerList = list.map((v) => v.toLowerCase());
  switch (c.operator) {
    case "Equals": return value === target;
    case "Does Not Equal": return value !== target;
    case "Contains": return value.includes(target);
    case "Does Not Contain": return !value.includes(target);
    case "Starts With": return value.startsWith(target);
    case "Ends With": return value.endsWith(target);
    case "In":
    case "In List": return lowerList.includes(value);
    case "Not In":
    case "Not In List": return !lowerList.includes(value);
    default: return false;
  }
}

export type EvalTrace = { matched: string[]; unmatched: string[]; result: boolean };

export function evaluateGroup(group: ConditionGroup, sample: Record<string, string>, trace: EvalTrace): boolean {
  if (!group.children.length) return true;
  const results = group.children.map((child) => {
    if (child.kind === "group") return evaluateGroup(child, sample, trace);
    const ok = evaluateCondition(child, sample);
    (ok ? trace.matched : trace.unmatched).push(describeCondition(child));
    return ok;
  });
  return group.combinator === "AND" ? results.every(Boolean) : results.some(Boolean);
}

export function describeCondition(c: Condition): string {
  const dp = dataPointById(c.dataPointId);
  const val = Array.isArray(c.value) ? c.value.join(", ") : c.value;
  const tail = c.value2 ? `${val} and ${c.value2}` : val;
  return `${dp?.label ?? "—"} ${c.operator}${tail ? ` ${tail}` : ""}`.trim();
}

export function describeGroup(g: ConditionGroup): string {
  if (!g.children.length) return "no conditions (always true)";
  return g.children
    .map((c) => (c.kind === "group" ? `(${describeGroup(c)})` : describeCondition(c)))
    .join(g.combinator === "AND" ? " and " : " or ");
}

/** The readable sentence shown under the builder (§81.6). */
export function describeRule(rule: Pick<Rule, "triggerEvent" | "conditions" | "actions" | "approval">): string {
  const event = eventById(rule.triggerEvent)?.label ?? "the selected event";
  const conditions = describeGroup(rule.conditions);
  const actions = rule.actions.length ? rule.actions.map((a) => a.type.toLowerCase() + (a.message ? ` (“${a.message}”)` : "")).join(", ") : "take no action";
  const approval =
    rule.approval.mode === "No Approval"
      ? ""
      : rule.approval.mode === "Role-Based"
        ? `, routed to the ${rule.approval.role ?? "assigned"} role`
        : rule.approval.mode === "User-Based"
          ? `, routed to a named approver`
          : `, routed through a ${rule.approval.workflowType ?? "sequential"} approval workflow`;
  return `When ${event.toLowerCase()} and ${conditions}, ${actions}${approval}.`;
}

// ————————————————————————— Seed rules (§81.10) —————————————————————————

const cond = (dataPointId: string, operator: string, value: string): Condition => ({ id: uid(), kind: "condition", dataPointId, operator, value });
// Registry IDs are generated, so seeds resolve by module + label to stay readable.
const dpId = (module: string, label: string) => DATA_POINTS.find((d) => d.module === module && d.label === label)?.id ?? "";

const seedRules = (): Rule[] => {
  const base = {
    scope: "All Branches" as const,
    branches: [] as string[],
    effectiveFrom: "2026-01-01",
    version: 1,
    versions: [] as RuleVersion[],
    updatedAt: Date.now(),
  };
  return [
    {
      ...base,
      id: "RULE-STK-001",
      code: "RULE-STK-001",
      name: "High Stock-Take Variance Approval",
      category: "Stock Taking",
      description: "Sends stock-take sessions with material variance to a maker-checker review.",
      priority: 10,
      status: "Active",
      triggerEvent: "STOCK_TAKE_VARIANCE_CALCULATED",
      conditions: {
        id: uid(), kind: "group", combinator: "OR",
        children: [
          cond(dpId("Stock Taking", "Absolute Variance Quantity"), "Greater Than", "5"),
          cond(dpId("Stock Taking", "Variance Percentage"), "Greater Than", "3"),
        ],
      },
      actions: [{ id: uid(), type: "Require Maker-Checker" }],
      approval: { mode: "Role-Based", role: "Inventory Manager", fallbackRole: "Store Manager" },
    },
    {
      ...base,
      id: "RULE-PO-002",
      code: "RULE-PO-002",
      name: "High-Value Purchase Order",
      category: "Purchase Orders",
      description: "Purchase orders at or above SAR 100,000 need three sequential sign-offs.",
      priority: 20,
      status: "Active",
      triggerEvent: "PURCHASE_ORDER_SUBMITTED",
      conditions: {
        id: uid(), kind: "group", combinator: "AND",
        children: [cond(dpId("Purchase Order", "Purchase Order Amount"), "Greater Than or Equal To", "100000")],
      },
      actions: [{ id: uid(), type: "Require Approval" }],
      approval: {
        mode: "Approval Workflow", workflowType: "Sequential", pinRequired: true,
        levels: [
          { level: 1, role: "Procurement Manager" },
          { level: 2, role: "Finance Manager" },
          { level: 3, role: "Store Manager" },
        ],
      },
    },
    {
      ...base,
      id: "RULE-RET-003",
      code: "RULE-RET-003",
      name: "Custom Product Return Block",
      category: "Returns",
      description: "Customised and cut-to-size material can never be returned.",
      priority: 5,
      status: "Active",
      triggerEvent: "RETURN_ITEM_SELECTED",
      conditions: {
        id: uid(), kind: "group", combinator: "OR",
        children: [
          cond(dpId("Return", "Custom Product"), "Is True", ""),
          cond(dpId("Return", "Cut-to-Size Product"), "Is True", ""),
        ],
      },
      actions: [{ id: uid(), type: "Block", message: "This customized product is not eligible for return." }],
      approval: { mode: "No Approval" },
    },
    {
      ...base,
      id: "RULE-CRD-004",
      code: "RULE-CRD-004",
      name: "Contractor Credit Exposure",
      category: "Customer Credit",
      description: "Credit payments from contractors with heavy overdue exposure need finance sign-off.",
      priority: 15,
      status: "Active",
      triggerEvent: "PAYMENT_STARTED",
      conditions: {
        id: uid(), kind: "group", combinator: "AND",
        children: [
          cond(dpId("Sales", "Payment Method"), "Equals", "Account Credit"),
          cond(dpId("Customer", "Overdue Amount"), "Greater Than", "10000"),
        ],
      },
      actions: [{ id: uid(), type: "Require Approval" }],
      approval: { mode: "User-Based", userId: "U-003" },
    },
  ];
};

// ————————————————————————— Store —————————————————————————

type S = {
  rules: Rule[];
  logs: ExecutionLog[];
  saveRule: (rule: Rule, author: string, note: string) => void;
  deleteRule: (id: string) => void;
  setStatus: (id: string, status: RuleStatus, actor: string) => void;
  rollback: (id: string, version: number, actor: string) => void;
  runTest: (rule: Rule, sample: Record<string, string>, actor: string, record?: string) => ExecutionLog;
  evaluateEvent: (eventId: string, sample: Record<string, string>, branch: string, actor: string, record?: string) => ExecutionLog[];
  clearLogs: () => void;
};

function ruleOutcome(rule: Rule, matchedAll: boolean): ExecutionLog["result"] {
  if (!matchedAll) return "No Match";
  const types = rule.actions.map((a) => a.type);
  if (types.some((t) => BLOCKING_ACTIONS.includes(t))) return "Blocked";
  if (types.some((t) => t.startsWith("Require") || t.startsWith("Assign Approval") || t === "Escalate Approval")) return "Approval Required";
  if (types.includes("Show Warning") || types.includes("Create Alert")) return "Warning Generated";
  return "Passed";
}

function approversOf(rule: Rule): string[] {
  const a = rule.approval;
  if (a.mode === "Role-Based") return [`Role: ${a.role ?? "—"}${a.fallbackRole ? ` (fallback ${a.fallbackRole})` : ""}`];
  if (a.mode === "User-Based") return [`User: ${a.userId ?? "—"}`];
  if (a.mode === "Approval Workflow") return (a.levels ?? []).map((l) => `Level ${l.level}: ${l.role}`);
  return [];
}

let logSeq = 1;

export const useRuleStore = create<S>()(
  persist(
    (set, get) => ({
      rules: seedRules(),
      logs: [],

      saveRule: (rule, author, note) =>
        set((s) => {
          const existing = s.rules.find((r) => r.id === rule.id);
          const version = existing ? existing.version + 1 : 1;
          const { versions: _v, id: _i, ...snapshot } = rule;
          void _v; void _i;
          const next: Rule = {
            ...rule,
            version,
            updatedAt: Date.now(),
            versions: [{ version, ts: Date.now(), author, note, snapshot }, ...(existing?.versions ?? [])],
          };
          useAuditStore.getState().log({ module: "system", event: existing ? "RULE_UPDATED" : "RULE_CREATED", recordId: rule.id, newValue: `${rule.name} · v${version}`, severity: "info" });
          return { rules: existing ? s.rules.map((r) => (r.id === rule.id ? next : r)) : [next, ...s.rules] };
        }),

      deleteRule: (id) => {
        useAuditStore.getState().log({ module: "system", event: "RULE_DELETED", recordId: id, severity: "warning" });
        set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
      },

      setStatus: (id, status, actor) => {
        useAuditStore.getState().log({ module: "system", event: "RULE_STATUS_CHANGED", recordId: id, newValue: status, user: actor, severity: "info" });
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, status, updatedAt: Date.now() } : r)) }));
      },

      rollback: (id, version, actor) =>
        set((s) => ({
          rules: s.rules.map((r) => {
            if (r.id !== id) return r;
            const v = r.versions.find((x) => x.version === version);
            if (!v) return r;
            useAuditStore.getState().log({ module: "system", event: "RULE_ROLLED_BACK", recordId: id, newValue: `to v${version}`, user: actor, severity: "warning" });
            const restored = { ...v.snapshot, id: r.id, versions: r.versions, version: r.version + 1, updatedAt: Date.now() } as Rule;
            return {
              ...restored,
              versions: [{ version: r.version + 1, ts: Date.now(), author: actor, note: `Rolled back to v${version}`, snapshot: v.snapshot }, ...r.versions],
            };
          }),
        })),

      runTest: (rule, sample, actor, record) => {
        const trace: EvalTrace = { matched: [], unmatched: [], result: false };
        const matchedAll = evaluateGroup(rule.conditions, sample, trace);
        const log: ExecutionLog = {
          id: `EXE-${Date.now().toString(36)}-${logSeq++}`,
          ruleId: rule.id,
          ruleName: rule.name,
          ts: Date.now(),
          mode: "Test",
          result: ruleOutcome(rule, matchedAll),
          matched: trace.matched,
          unmatched: trace.unmatched,
          actions: matchedAll ? rule.actions.map((a) => a.type) : [],
          approvers: matchedAll ? approversOf(rule) : [],
          record,
          actor,
        };
        set((s) => ({ logs: [log, ...s.logs].slice(0, 300) }));
        useAuditStore.getState().log({ module: "system", event: "RULE_TESTED", recordId: rule.id, newValue: log.result, user: actor, severity: "info" });
        return log;
      },

      evaluateEvent: (eventId, sample, branch, actor, record) => {
        const today = new Date().toISOString().slice(0, 10);
        const candidates = get()
          .rules.filter((r) => r.status === "Active" && r.triggerEvent === eventId)
          .filter((r) => r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today))
          .filter((r) => r.scope === "All Branches" || r.branches.includes(branch))
          .sort((a, b) => a.priority - b.priority);

        const produced: ExecutionLog[] = [];
        const fired = new Set<string>();
        for (const rule of candidates) {
          const trace: EvalTrace = { matched: [], unmatched: [], result: false };
          const matchedAll = evaluateGroup(rule.conditions, sample, trace);
          // Duplicate action execution is prevented across rules in the same evaluation pass.
          const actions = matchedAll ? rule.actions.map((a) => a.type).filter((t) => !fired.has(`${rule.id}:${t}`)) : [];
          actions.forEach((t) => fired.add(`${rule.id}:${t}`));
          const log: ExecutionLog = {
            id: `EXE-${Date.now().toString(36)}-${logSeq++}`,
            ruleId: rule.id,
            ruleName: rule.name,
            ts: Date.now(),
            mode: "Live",
            result: ruleOutcome(rule, matchedAll),
            matched: trace.matched,
            unmatched: trace.unmatched,
            actions,
            approvers: matchedAll ? approversOf(rule) : [],
            record,
            actor,
          };
          produced.push(log);
          if (log.result === "Blocked") break; // stop processing on the first blocking match
        }
        if (produced.length) set((s) => ({ logs: [...produced, ...s.logs].slice(0, 300) }));
        return produced;
      },

      clearLogs: () => set({ logs: [] }),
    }),
    { name: "buildpos-rules-v1" }
  )
);