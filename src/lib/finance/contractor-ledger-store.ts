// §88 Contractor Ledger - credit account master, running-balance transaction ledger, payment
// allocation, aging, credit holds and maker-checker adjustments. Local-persisted so the whole
// credit lifecycle is exercisable in preview without the .NET API.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";

export const CREDIT_TERMS = ["Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90", "Custom"] as const;
export const ACCOUNT_STATUSES = ["Active", "On Hold", "Suspended", "Closed"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export type LedgerTxnType =
  | "Invoice" | "Payment" | "Credit Note" | "Debit Note" | "Return Credit"
  | "Refund" | "Adjustment" | "Write-off" | "Opening Balance";

export type LedgerTxn = {
  id: string;
  accountId: string;
  date: string;
  dueDate?: string;
  type: LedgerTxnType;
  reference: string;
  project?: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  status: "Posted" | "Pending Approval" | "Rejected" | "Reversed";
  allocatedAmount?: number;
  createdBy: string;
  approvedBy?: string;
  reason?: string;
};

export type ContractorProject = {
  id: string;
  accountId: string;
  name: string;
  code: string;
  siteAddress: string;
  budget: number;
  consumed: number;
  status: "Active" | "Completed" | "On Hold";
};

export type LedgerAccount = {
  id: string;
  code: string;
  customerName: string;
  contactPerson: string;
  phone: string;
  vatNumber?: string;
  crNumber?: string;
  branch: string;
  creditLimit: number;
  creditTerms: (typeof CREDIT_TERMS)[number];
  graceDays: number;
  status: AccountStatus;
  holdReason?: string;
  openedOn: string;
  lastPaymentOn?: string;
  approvedBy?: string;
};

export type LedgerAdjustment = {
  id: string;
  accountId: string;
  type: "Adjustment" | "Write-off" | "Credit Limit Change" | "Credit Hold" | "Hold Release";
  amount: number;
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  status: "Pending Approval" | "Approved" | "Rejected";
  createdAt: string;
};

const SEED_ACCOUNTS: LedgerAccount[] = [
  { id: "LA-001", code: "CONTR-001", customerName: "Al Bina Contracting Est.", contactPerson: "Faisal Al-Zahrani", phone: "+966 55 123 4567", vatNumber: "300012345600003", crNumber: "1010123456", branch: "Riyadh Main Branch", creditLimit: 500000, creditTerms: "Net 30", graceDays: 5, status: "Active", openedOn: "2025-03-12", lastPaymentOn: "2026-01-18", approvedBy: "Maha Al-Rashid" },
  { id: "LA-002", code: "CONTR-002", customerName: "Riyadh Steel Works Co.", contactPerson: "Sultan Al-Ghamdi", phone: "+966 50 998 2211", vatNumber: "300099887700003", crNumber: "1010998877", branch: "Riyadh Main Branch", creditLimit: 250000, creditTerms: "Net 45", graceDays: 7, status: "Active", openedOn: "2025-06-02", lastPaymentOn: "2026-01-05", approvedBy: "Maha Al-Rashid" },
  { id: "LA-003", code: "CONTR-003", customerName: "Jeddah Coastal Developers", contactPerson: "Rami Al-Amoudi", phone: "+966 56 771 3344", vatNumber: "301122334400003", crNumber: "4030112233", branch: "Jeddah Branch", creditLimit: 300000, creditTerms: "Net 30", graceDays: 0, status: "On Hold", holdReason: "Overdue beyond 90 days", openedOn: "2025-01-20", lastPaymentOn: "2025-11-11", approvedBy: "Maha Al-Rashid" },
  { id: "LA-004", code: "CONTR-004", customerName: "Najd Infrastructure LLC", contactPerson: "Bandar Al-Subaie", phone: "+966 53 440 8890", vatNumber: "300556677800003", crNumber: "1010556677", branch: "Dammam Branch", creditLimit: 150000, creditTerms: "Net 15", graceDays: 3, status: "Active", openedOn: "2025-09-14", lastPaymentOn: "2026-01-22" },
  { id: "LA-005", code: "CONTR-005", customerName: "Gulf Interiors & Finishing", contactPerson: "Layla Al-Nasser", phone: "+966 54 220 7788", branch: "Riyadh Main Branch", creditLimit: 80000, creditTerms: "Net 7", graceDays: 0, status: "Suspended", holdReason: "Cheque returned twice", openedOn: "2025-10-01" },
];

const SEED_PROJECTS: ContractorProject[] = [
  { id: "PRJ-001", accountId: "LA-001", name: "Al Narjis Villas Phase 2", code: "NARJIS-P2", siteAddress: "Al Narjis, Riyadh", budget: 1200000, consumed: 428500, status: "Active" },
  { id: "PRJ-002", accountId: "LA-001", name: "King Fahd Road Tower Fit-out", code: "KFR-TWR", siteAddress: "King Fahd Rd, Riyadh", budget: 800000, consumed: 132000, status: "Active" },
  { id: "PRJ-003", accountId: "LA-002", name: "Industrial City Warehouse", code: "IND-WH1", siteAddress: "2nd Industrial City, Riyadh", budget: 640000, consumed: 288000, status: "Active" },
  { id: "PRJ-004", accountId: "LA-003", name: "Corniche Retail Block", code: "COR-RB", siteAddress: "Corniche, Jeddah", budget: 950000, consumed: 705000, status: "On Hold" },
  { id: "PRJ-005", accountId: "LA-004", name: "Dammam Ring Road Culverts", code: "DMM-CUL", siteAddress: "Ring Rd, Dammam", budget: 420000, consumed: 96000, status: "Active" },
];

function txn(p: Omit<LedgerTxn, "balance" | "status" | "createdBy"> & Partial<Pick<LedgerTxn, "status" | "createdBy">>): LedgerTxn {
  return { balance: 0, status: "Posted", createdBy: "Finance Officer", ...p } as LedgerTxn;
}

const SEED_TXNS: LedgerTxn[] = [
  txn({ id: "LT-0001", accountId: "LA-001", date: "2025-11-02", type: "Opening Balance", reference: "OPEN-LA-001", description: "Opening balance carried forward", debit: 60000, credit: 0 }),
  txn({ id: "LT-0002", accountId: "LA-001", date: "2025-11-18", dueDate: "2025-12-18", type: "Invoice", reference: "INV-2025-4411", project: "Al Narjis Villas Phase 2", description: "Cement 42.5N x 800 bags, rebar 12mm x 6t", debit: 186400, credit: 0 }),
  txn({ id: "LT-0003", accountId: "LA-001", date: "2025-12-14", type: "Payment", reference: "PAY-2025-0912", description: "Bank transfer - Al Rajhi", debit: 0, credit: 150000, allocatedAmount: 150000 }),
  txn({ id: "LT-0004", accountId: "LA-001", date: "2025-12-28", dueDate: "2026-01-27", type: "Invoice", reference: "INV-2025-4790", project: "King Fahd Road Tower Fit-out", description: "Gypsum boards, tiles, adhesives", debit: 132000, credit: 0 }),
  txn({ id: "LT-0005", accountId: "LA-001", date: "2026-01-06", type: "Return Credit", reference: "RET-2026-0031", description: "Damaged tile lot returned", debit: 0, credit: 8600 }),
  txn({ id: "LT-0006", accountId: "LA-001", date: "2026-01-18", type: "Payment", reference: "PAY-2026-0044", description: "Cheque 884120 cleared", debit: 0, credit: 90000, allocatedAmount: 90000 }),
  txn({ id: "LT-0007", accountId: "LA-002", date: "2025-10-05", type: "Opening Balance", reference: "OPEN-LA-002", description: "Opening balance carried forward", debit: 25000, credit: 0 }),
  txn({ id: "LT-0008", accountId: "LA-002", date: "2025-12-01", dueDate: "2026-01-15", type: "Invoice", reference: "INV-2025-4520", project: "Industrial City Warehouse", description: "Structural steel sections", debit: 288000, credit: 0 }),
  txn({ id: "LT-0009", accountId: "LA-002", date: "2026-01-05", type: "Payment", reference: "PAY-2026-0009", description: "Bank transfer - SNB", debit: 0, credit: 120000, allocatedAmount: 120000 }),
  txn({ id: "LT-0010", accountId: "LA-003", date: "2025-08-11", dueDate: "2025-09-10", type: "Invoice", reference: "INV-2025-3120", project: "Corniche Retail Block", description: "Ready-mix, blocks, waterproofing", debit: 452000, credit: 0 }),
  txn({ id: "LT-0011", accountId: "LA-003", date: "2025-11-11", type: "Payment", reference: "PAY-2025-0788", description: "Partial settlement", debit: 0, credit: 180000, allocatedAmount: 180000 }),
  txn({ id: "LT-0012", accountId: "LA-003", date: "2025-12-20", type: "Adjustment", reference: "ADJ-2025-0022", description: "Pricing correction on ready-mix rate", debit: 0, credit: 12000, reason: "Approved rate revision", approvedBy: "Maha Al-Rashid" }),
  txn({ id: "LT-0013", accountId: "LA-004", date: "2026-01-08", dueDate: "2026-01-23", type: "Invoice", reference: "INV-2026-0112", project: "Dammam Ring Road Culverts", description: "Aggregates, sand, cement", debit: 96000, credit: 0 }),
  txn({ id: "LT-0014", accountId: "LA-004", date: "2026-01-22", type: "Payment", reference: "PAY-2026-0061", description: "Bank transfer - Riyad Bank", debit: 0, credit: 60000, allocatedAmount: 60000 }),
  txn({ id: "LT-0015", accountId: "LA-005", date: "2025-11-30", dueDate: "2025-12-07", type: "Invoice", reference: "INV-2025-4655", description: "Paint, primer, finishing tools", debit: 46500, credit: 0 }),
];

const SEED_ADJUSTMENTS: LedgerAdjustment[] = [
  { id: "LADJ-0001", accountId: "LA-002", type: "Credit Limit Change", amount: 350000, reason: "Increase for warehouse phase 2", requestedBy: "Finance Officer", status: "Pending Approval", createdAt: "2026-01-25" },
  { id: "LADJ-0002", accountId: "LA-005", type: "Write-off", amount: 4650, reason: "Uncollectible balance after 120 days", requestedBy: "Finance Officer", status: "Pending Approval", createdAt: "2026-01-26" },
];

export function accountBalance(txns: LedgerTxn[], accountId: string) {
  return txns
    .filter((t) => t.accountId === accountId && t.status === "Posted")
    .reduce((sum, t) => sum + t.debit - t.credit, 0);
}

export function withRunningBalance(txns: LedgerTxn[], accountId: string) {
  let running = 0;
  return txns
    .filter((t) => t.accountId === accountId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      if (t.status === "Posted") running += t.debit - t.credit;
      return { ...t, balance: running };
    });
}

const NOW = new Date("2026-01-28");
function daysPast(due?: string) {
  if (!due) return 0;
  return Math.max(0, Math.round((NOW.getTime() - new Date(due).getTime()) / 86400000));
}

export type AgingBuckets = { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number; total: number };

/** Open invoice value bucketed by days past due (§88.7). Payments reduce the oldest invoice first. */
export function agingFor(txns: LedgerTxn[], accountId: string): AgingBuckets {
  const rows = txns.filter((t) => t.accountId === accountId && t.status === "Posted");
  const invoices = rows.filter((t) => t.debit > 0).sort((a, b) => a.date.localeCompare(b.date)).map((t) => ({ ...t, open: t.debit }));
  let credits = rows.filter((t) => t.credit > 0).reduce((s, t) => s + t.credit, 0);
  for (const inv of invoices) {
    if (credits <= 0) break;
    const applied = Math.min(credits, inv.open);
    inv.open -= applied;
    credits -= applied;
  }
  const b: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
  for (const inv of invoices) {
    if (inv.open <= 0) continue;
    const d = daysPast(inv.dueDate);
    if (d === 0) b.current += inv.open;
    else if (d <= 30) b.d1_30 += inv.open;
    else if (d <= 60) b.d31_60 += inv.open;
    else if (d <= 90) b.d61_90 += inv.open;
    else b.d90plus += inv.open;
    b.total += inv.open;
  }
  return b;
}

export type CreditCheck = { allowed: boolean; reason?: string; available: number };

/** §88.9 credit check used at POS/checkout before an account-credit sale is accepted. */
export function creditCheck(account: LedgerAccount, txns: LedgerTxn[], amount: number): CreditCheck {
  const outstanding = accountBalance(txns, account.id);
  const available = account.creditLimit - outstanding;
  if (account.status !== "Active") return { allowed: false, reason: `Account is ${account.status}${account.holdReason ? ` - ${account.holdReason}` : ""}.`, available };
  const aging = agingFor(txns, account.id);
  if (aging.d90plus > 0) return { allowed: false, reason: "Invoices overdue beyond 90 days must be settled first.", available };
  if (amount > available) return { allowed: false, reason: `Exceeds available credit by ${(amount - available).toLocaleString()} SAR.`, available };
  return { allowed: true, available };
}

function logLedger(event: string, opts: { recordId?: string; user?: string; oldValue?: string; newValue?: string; reason?: string; severity?: "info" | "warning" | "critical" } = {}) {
  useAuditStore.getState().log({
    module: "system", event, recordId: opts.recordId, user: opts.user ?? "Finance Officer",
    oldValue: opts.oldValue, newValue: opts.newValue, reason: opts.reason, severity: opts.severity ?? "info",
  });
}

type S = {
  accounts: LedgerAccount[];
  txns: LedgerTxn[];
  projects: ContractorProject[];
  adjustments: LedgerAdjustment[];
  createAccount: (a: Omit<LedgerAccount, "id">) => void;
  updateAccount: (id: string, patch: Partial<LedgerAccount>) => void;
  recordPayment: (p: { accountId: string; date: string; amount: number; method: string; reference: string; note?: string; allocations: string[] }) => void;
  addInvoice: (p: { accountId: string; date: string; dueDate: string; amount: number; reference: string; project?: string; description: string }) => void;
  reverseTxn: (id: string, reason: string) => void;
  requestAdjustment: (a: Omit<LedgerAdjustment, "id" | "status" | "createdAt">) => void;
  decideAdjustment: (id: string, approve: boolean, checker: string) => string | null;
  setHold: (accountId: string, hold: boolean, reason: string) => void;
  addProject: (p: Omit<ContractorProject, "id" | "consumed">) => void;
};

let seq = 100;
const nid = (p: string) => `${p}-${String(++seq).padStart(4, "0")}`;

export const useLedgerStore = create<S>()(
  persist(
    (set, get) => ({
      accounts: SEED_ACCOUNTS,
      txns: SEED_TXNS,
      projects: SEED_PROJECTS,
      adjustments: SEED_ADJUSTMENTS,

      createAccount: (a) => {
        const id = nid("LA");
        set((s) => ({ accounts: [...s.accounts, { ...a, id }] }));
        logLedger("LEDGER_ACCOUNT_CREATED", { recordId: id, newValue: a.customerName });
      },
      updateAccount: (id, patch) => {
        const prev = get().accounts.find((a) => a.id === id);
        set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
        logLedger("LEDGER_ACCOUNT_UPDATED", { recordId: id, oldValue: prev ? `Limit ${prev.creditLimit}` : undefined, newValue: JSON.stringify(patch) });
      },
      recordPayment: ({ accountId, date, amount, method, reference, note, allocations }) => {
        const id = nid("LT");
        set((s) => ({
          txns: [...s.txns, txn({ id, accountId, date, type: "Payment", reference, description: `${method}${note ? ` - ${note}` : ""}`, debit: 0, credit: amount, allocatedAmount: amount })],
          accounts: s.accounts.map((a) => (a.id === accountId ? { ...a, lastPaymentOn: date } : a)),
        }));
        logLedger("LEDGER_PAYMENT_RECORDED", { recordId: id, newValue: `${amount} SAR via ${method}`, reason: allocations.length ? `Allocated to ${allocations.join(", ")}` : "Unallocated (on account)" });
      },
      addInvoice: ({ accountId, date, dueDate, amount, reference, project, description }) => {
        const id = nid("LT");
        set((s) => ({ txns: [...s.txns, txn({ id, accountId, date, dueDate, type: "Invoice", reference, project, description, debit: amount, credit: 0 })] }));
        logLedger("LEDGER_INVOICE_POSTED", { recordId: id, newValue: `${reference} ${amount} SAR` });
      },
      reverseTxn: (id, reason) => {
        set((s) => ({ txns: s.txns.map((t) => (t.id === id ? { ...t, status: "Reversed", reason } : t)) }));
        logLedger("LEDGER_TXN_REVERSED", { recordId: id, reason, severity: "warning" });
      },
      requestAdjustment: (a) => {
        const id = nid("LADJ");
        set((s) => ({ adjustments: [{ ...a, id, status: "Pending Approval", createdAt: new Date().toISOString().slice(0, 10) }, ...s.adjustments] }));
        logLedger("LEDGER_ADJUSTMENT_REQUESTED", { recordId: id, user: a.requestedBy, newValue: `${a.type} ${a.amount}`, reason: a.reason });
      },
      // Maker-Checker: the requester cannot approve their own ledger adjustment (§88.13).
      decideAdjustment: (id, approve, checker) => {
        const adj = get().adjustments.find((a) => a.id === id);
        if (!adj) return "Adjustment not found.";
        if (approve && checker.trim().toLowerCase() === adj.requestedBy.trim().toLowerCase()) {
          return "Maker-Checker: the requester cannot approve their own ledger adjustment.";
        }
        set((s) => ({ adjustments: s.adjustments.map((a) => (a.id === id ? { ...a, status: approve ? "Approved" : "Rejected", approvedBy: checker } : a)) }));
        if (approve) {
          if (adj.type === "Credit Limit Change") {
            set((s) => ({ accounts: s.accounts.map((a) => (a.id === adj.accountId ? { ...a, creditLimit: adj.amount, approvedBy: checker } : a)) }));
          } else if (adj.type === "Adjustment" || adj.type === "Write-off") {
            const tid = nid("LT");
            set((s) => ({
              txns: [...s.txns, txn({ id: tid, accountId: adj.accountId, date: new Date().toISOString().slice(0, 10), type: adj.type === "Write-off" ? "Write-off" : "Adjustment", reference: adj.id, description: adj.reason, debit: 0, credit: adj.amount, approvedBy: checker, reason: adj.reason })],
            }));
          }
        }
        logLedger(approve ? "LEDGER_ADJUSTMENT_APPROVED" : "LEDGER_ADJUSTMENT_REJECTED", { recordId: id, user: checker, newValue: `${adj.type} ${adj.amount}`, reason: adj.reason, severity: approve ? "info" : "warning" });
        return null;
      },
      setHold: (accountId, hold, reason) => {
        set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? { ...a, status: hold ? "On Hold" : "Active", holdReason: hold ? reason : undefined } : a)) }));
        logLedger(hold ? "CREDIT_HOLD_PLACED" : "CREDIT_HOLD_RELEASED", { recordId: accountId, reason, severity: hold ? "warning" : "info" });
      },
      addProject: (p) => {
        const id = nid("PRJ");
        set((s) => ({ projects: [...s.projects, { ...p, id, consumed: 0 }] }));
        logLedger("CONTRACTOR_PROJECT_CREATED", { recordId: id, newValue: p.name });
      },
    }),
    { name: "buildpos-contractor-ledger-v1", version: 1 }
  )
);
