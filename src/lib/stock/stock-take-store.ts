/**
 * Stock Taking (BRD §83) — physical counting, separate from Add Stock and Stock Adjustments.
 *
 * A session is created, counted (blind or open), submitted, variance-calculated against tolerance,
 * then either recounted or routed to a checker who is never the maker. Approval posts exactly one
 * stock adjustment that keeps links back to every count line.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";
import { registerApprovalHandler, useApprovalStore, type Role } from "@/lib/approvals/store";

export const COUNT_TYPES = ["Full Count", "Cycle Count", "Category Count", "Spot Count", "Recount"] as const;
export type CountType = (typeof COUNT_TYPES)[number];

export const SCOPES = ["All Products", "Selected Categories", "Selected Brands", "Selected SKUs", "Low-Stock Products", "High-Value Products", "Quarantine Stock"] as const;
export const STOCK_TYPES = ["Available Stock", "Reserved Stock", "Quarantine Stock", "All On-Hand Stock"] as const;

export const SESSION_STATUSES = ["Draft", "Scheduled", "In Progress", "Submitted", "Recount Required", "Pending Checker", "Approved", "Posted", "Rejected", "Cancelled"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const POSITIVE_REASONS = ["Unposted supplier receipt", "Unposted customer return", "Previous count error", "Incorrect UOM conversion", "Transfer received but not posted", "Data migration issue", "Other"];
export const NEGATIVE_REASONS = ["Breakage", "Damage", "Theft / Loss", "Unposted sale", "Incorrect UOM conversion", "Transfer dispatched but not posted", "Material used internally", "Previous count error", "Other"];
export const ZERO_REASON = "Count Matched";

export type LineStatus = "Not Counted" | "Counted" | "Matched" | "Within Tolerance" | "Recount Required" | "Pending Checker" | "Accepted" | "Not Found";

export type CountLine = {
  id: string;
  lineNo: number;
  sku: string;
  product: string;
  brand: string;
  category: string;
  uom: string;
  barcode: string;
  systemQty: number;
  unitCost: number;
  firstCount: number | null;
  recountQty: number | null;
  finalCount: number | null;
  reason: string;
  status: LineStatus;
  counter: string;
  lastCountedAt?: number;
};

export type StockTakeSession = {
  id: string;
  name: string;
  countDate: string;
  branch: string;
  countType: CountType;
  scope: string;
  scopeDetail: string[];
  stockType: string;
  blindCount: boolean;
  priority: "Low" | "Normal" | "High" | "Urgent";
  notes: string;
  makerId: string;
  counterIds: string[];
  checkerAssignment: "Role-Based" | "User-Based";
  checkerRole?: Role;
  checkerUserId?: string;
  qtyTolerance: number;
  pctTolerance: number;
  recountAboveTolerance: boolean;
  approvalRequired: boolean;
  autoAdjustment: boolean;
  status: SessionStatus;
  lines: CountLine[];
  approvalId?: string;
  adjustmentId?: string;
  updatedAt: number;
  createdAt: number;
  cancelReason?: string;
};

export type StockTakeAdjustment = {
  id: string;
  sessionId: string;
  branch: string;
  createdBy: string;
  approvedBy: string;
  status: "Posted";
  postedAt: number;
  lines: { sku: string; product: string; uom: string; qty: number; reason: string; firstCount: number | null; recount: number | null; finalCount: number | null }[];
};

export function variance(line: CountLine): number {
  const final = line.finalCount ?? line.recountQty ?? line.firstCount;
  if (final == null) return 0;
  return final - line.systemQty;
}
export function variancePct(line: CountLine): number {
  if (!line.systemQty) return 0;
  return (variance(line) / line.systemQty) * 100;
}

export function sessionProgress(s: StockTakeSession) {
  const counted = s.lines.filter((l) => l.firstCount != null || l.status === "Not Found").length;
  const varianceLines = s.lines.filter((l) => (l.firstCount != null || l.finalCount != null) && variance(l) !== 0);
  return {
    total: s.lines.length,
    counted,
    remaining: s.lines.length - counted,
    varianceSkus: varianceLines.length,
    positive: varianceLines.filter((l) => variance(l) > 0).length,
    negative: varianceLines.filter((l) => variance(l) < 0).length,
    netQty: varianceLines.reduce((a, l) => a + variance(l), 0),
    absQty: varianceLines.reduce((a, l) => a + Math.abs(variance(l)), 0),
    varianceValue: varianceLines.reduce((a, l) => a + variance(l) * l.unitCost, 0),
    pct: s.lines.length ? Math.round((counted / s.lines.length) * 100) : 0,
  };
}

// ————————————————————————— Seed data (§83.10 / §83.11) —————————————————————————

const PRODUCT_POOL: Omit<CountLine, "id" | "lineNo" | "firstCount" | "recountQty" | "finalCount" | "reason" | "status" | "counter">[] = [
  { sku: "CEM-OPC-50KG", product: "Ordinary Portland Cement 50kg", brand: "Saudi Cement", category: "Cement & Binders", uom: "Bag", barcode: "6281000123456", systemQty: 640, unitCost: 14.5 },
  { sku: "CEM-SRC-50KG", product: "Sulphate Resistant Cement 50kg", brand: "Yamama Cement", category: "Cement & Binders", uom: "Bag", barcode: "6281000123463", systemQty: 320, unitCost: 16.25 },
  { sku: "STEEL-RBR-12MM", product: "Rebar 12mm × 12m", brand: "SABIC Steel", category: "Steel & Reinforcement", uom: "Piece", barcode: "6281000223451", systemQty: 480, unitCost: 42.0 },
  { sku: "STEEL-RBR-16MM", product: "Rebar 16mm × 12m", brand: "Al Ittefaq Steel", category: "Steel & Reinforcement", uom: "Piece", barcode: "6281000223468", systemQty: 265, unitCost: 68.4 },
  { sku: "STEEL-MSH-6MM", product: "Steel Mesh 6mm 2×6m", brand: "SABIC Steel", category: "Steel & Reinforcement", uom: "Piece", barcode: "6281000223475", systemQty: 140, unitCost: 96.0 },
  { sku: "PLB-PVC-110", product: "PVC Drainage Pipe 110mm", brand: "Alfanar Tiles", category: "Plumbing & Drainage", uom: "Piece", barcode: "6281000323457", systemQty: 210, unitCost: 38.5 },
  { sku: "TOOL-DRL-18V", product: "Cordless Drill 18V", brand: "Bosch", category: "Power & Hand Tools", uom: "Piece", barcode: "6281000423458", systemQty: 46, unitCost: 385.0 },
  { sku: "TOOL-GRD-125", product: "Angle Grinder 125mm", brand: "Makita", category: "Power & Hand Tools", uom: "Piece", barcode: "6281000423465", systemQty: 38, unitCost: 295.0 },
];

function poolLines(count: number, counted: boolean, counter: string): CountLine[] {
  return Array.from({ length: count }).map((_, i) => {
    const p = PRODUCT_POOL[i % PRODUCT_POOL.length];
    const first = counted ? p.systemQty : null;
    return {
      ...p,
      sku: i < PRODUCT_POOL.length ? p.sku : `${p.sku}-${i}`,
      id: `L-${i + 1}-${p.sku}`,
      lineNo: i + 1,
      firstCount: first,
      recountQty: null,
      finalCount: first,
      reason: counted ? ZERO_REASON : "",
      status: counted ? "Matched" : "Not Counted",
      counter: counted ? counter : "",
      lastCountedAt: counted ? Date.now() - 86_400_000 : undefined,
    };
  });
}

const tileLines: CountLine[] = [
  { id: "L1", lineNo: 1, sku: "TILE-GRY-60X60", product: "Grey Porcelain Tile 60×60", brand: "Saudi Ceramics", category: "Tiles & Stone", uom: "Box", barcode: "6281000523451", systemQty: 185, unitCost: 62.0, firstCount: 179, recountQty: null, finalCount: 179, reason: "Cracked boxes not adjusted", status: "Recount Required", counter: "Noura Al-Salem", lastCountedAt: Date.now() - 90_000_000 },
  { id: "L2", lineNo: 2, sku: "TILE-WHT-60X60", product: "White Porcelain Tile 60×60", brand: "Alfanar Tiles", category: "Tiles & Stone", uom: "Box", barcode: "6281000523468", systemQty: 240, unitCost: 58.0, firstCount: 242, recountQty: null, finalCount: 242, reason: "Unposted customer return", status: "Within Tolerance", counter: "Noura Al-Salem", lastCountedAt: Date.now() - 89_000_000 },
  { id: "L3", lineNo: 3, sku: "TILE-BGE-30X60", product: "Beige Ceramic Tile 30×60", brand: "Arabian Tiles", category: "Tiles & Stone", uom: "Box", barcode: "6281000523475", systemQty: 118, unitCost: 44.0, firstCount: 118, recountQty: null, finalCount: 118, reason: ZERO_REASON, status: "Matched", counter: "Noura Al-Salem", lastCountedAt: Date.now() - 88_000_000 },
  { id: "L4", lineNo: 4, sku: "TILE-MOS-BLU", product: "Blue Mosaic Tile", brand: "Gulf Mosaic", category: "Tiles & Stone", uom: "Box", barcode: "6281000523482", systemQty: 42, unitCost: 120.0, firstCount: 39, recountQty: 40, finalCount: 40, reason: "Two boxes damaged", status: "Pending Checker", counter: "Noura Al-Salem", lastCountedAt: Date.now() - 87_000_000 },
  ...poolLines(31, true, "Faisal Al-Harbi").map((l, i) => ({ ...l, id: `T${i}`, lineNo: i + 5 })),
];

const baseSession = {
  scopeDetail: [] as string[],
  stockType: "All On-Hand Stock",
  priority: "Normal" as const,
  notes: "",
  counterIds: ["U-001", "U-004"],
  checkerAssignment: "Role-Based" as const,
  checkerRole: "Inventory Manager" as Role,
  qtyTolerance: 2,
  pctTolerance: 2,
  recountAboveTolerance: true,
  approvalRequired: true,
  autoAdjustment: true,
  createdAt: Date.now() - 200_000_000,
  updatedAt: Date.now() - 10_000_000,
};

const SEED_SESSIONS: StockTakeSession[] = [
  {
    ...baseSession, id: "STK-TAKE-2026-0041", name: "Riyadh Cement and Steel Cycle Count", countDate: "2026-07-31",
    branch: "Riyadh Main Branch", countType: "Cycle Count", scope: "Selected Categories",
    scopeDetail: ["Cement & Binders", "Steel & Reinforcement"], blindCount: true, makerId: "U-001",
    checkerUserId: "U-002", status: "In Progress",
    lines: poolLines(128, false, "").map((l, i) => (i < 96 ? { ...l, firstCount: l.systemQty + (i % 17 === 0 ? -3 : 0), finalCount: l.systemQty + (i % 17 === 0 ? -3 : 0), status: i % 17 === 0 ? "Counted" : "Matched", counter: "Noura Al-Salem", reason: i % 17 === 0 ? "Breakage" : ZERO_REASON, lastCountedAt: Date.now() - 3_600_000 } : l)),
  },
  {
    ...baseSession, id: "STK-TAKE-2026-0040", name: "Tile Stock Verification", countDate: "2026-07-30",
    branch: "Riyadh Main Branch", countType: "Category Count", scope: "Selected Categories",
    scopeDetail: ["Tiles & Stone"], blindCount: true, makerId: "U-001", checkerUserId: "U-002",
    status: "Pending Checker", approvalId: "APR-2026-0881", lines: tileLines,
  },
  {
    ...baseSession, id: "STK-TAKE-2026-0039", name: "Khobar Opening Stock Recount", countDate: "2026-07-29",
    branch: "Khobar Building Materials Branch", countType: "Recount", scope: "All Products", blindCount: false,
    makerId: "U-001", status: "Recount Required",
    lines: poolLines(58, true, "Faisal Al-Harbi").map((l, i) => (i < 2 ? { ...l, firstCount: l.systemQty - 4, finalCount: l.systemQty - 4, status: "Recount Required", reason: "Breakage" } : l)),
  },
  {
    ...baseSession, id: "STK-TAKE-2026-0038", name: "Power Tools Serial Count", countDate: "2026-07-28",
    branch: "Jeddah Branch", countType: "Spot Count", scope: "Selected Categories", scopeDetail: ["Power & Hand Tools"],
    blindCount: false, makerId: "U-004", checkerUserId: "U-005", status: "Approved",
    lines: poolLines(24, true, "Faisal Al-Harbi"),
  },
  {
    ...baseSession, id: "STK-TAKE-2026-0037", name: "Monthly Plumbing Cycle Count", countDate: "2026-07-25",
    branch: "Dammam Branch", countType: "Cycle Count", scope: "Selected Categories", scopeDetail: ["Plumbing & Drainage"],
    blindCount: true, makerId: "U-001", checkerUserId: "U-009", status: "Posted", adjustmentId: "ADJ-2026-0084",
    lines: poolLines(84, true, "Omar Al-Dossary").map((l, i) => (i % 14 === 0 ? { ...l, firstCount: l.systemQty - 2, finalCount: l.systemQty - 2, status: "Accepted", reason: "Damage" } : l)),
  },
];

function audit(event: string, recordId: string, detail?: string, severity: "info" | "warning" | "critical" = "info") {
  useAuditStore.getState().log({ module: "system", event, recordId, newValue: detail, severity });
}

type S = {
  sessions: StockTakeSession[];
  adjustments: StockTakeAdjustment[];
  seq: number;
  adjSeq: number;
  createSession: (input: Omit<StockTakeSession, "id" | "status" | "lines" | "createdAt" | "updatedAt"> & { skuCount: number }) => string;
  startSession: (id: string) => void;
  recordCount: (sessionId: string, lineId: string, qty: number | null, counter: string, reason?: string, notFound?: boolean) => void;
  addUnlistedSku: (sessionId: string, sku: string, product: string, qty: number, counter: string) => void;
  submitSession: (id: string, actorId: string) => { ok: boolean; error?: string; approvalId?: string };
  requestRecount: (id: string, lineIds: string[], actorId: string) => void;
  acceptVariance: (id: string, lineId: string) => void;
  changeReason: (id: string, lineId: string, reason: string) => void;
  cancelSession: (id: string, reason: string, actorId: string) => void;
  applyApprovalOutcome: (sessionId: string, outcome: "Approved" | "Rejected" | "Returned for Correction", approver: string) => void;
};

export const useStockTakeStore = create<S>()(
  persist(
    (set, get) => ({
      sessions: SEED_SESSIONS,
      adjustments: [
        {
          id: "ADJ-2026-0084", sessionId: "STK-TAKE-2026-0037", branch: "Dammam Branch", createdBy: "System",
          approvedBy: "Omar Al-Dossary", status: "Posted", postedAt: Date.now() - 400_000_000,
          lines: [{ sku: "PLB-PVC-110", product: "PVC Drainage Pipe 110mm", uom: "Piece", qty: -12, reason: "Damage", firstCount: 198, recount: null, finalCount: 198 }],
        },
      ],
      seq: 42,
      adjSeq: 88,

      createSession: (input) => {
        const { skuCount, ...rest } = input;
        const id = `STK-TAKE-2026-${String(get().seq).padStart(4, "0")}`;
        const session: StockTakeSession = {
          ...rest,
          id,
          status: new Date(rest.countDate).getTime() > Date.now() ? "Scheduled" : "Draft",
          lines: poolLines(Math.max(1, skuCount), false, ""),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => ({ sessions: [session, ...s.sessions], seq: s.seq + 1 }));
        audit("STOCK_TAKE_CREATED", id, `${session.name} · ${session.branch}`);
        if (session.status === "Scheduled") audit("STOCK_TAKE_SCHEDULED", id, session.countDate);
        return id;
      },

      startSession: (id) => {
        set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, status: "In Progress", updatedAt: Date.now() } : x)) }));
        audit("STOCK_TAKE_STARTED", id);
      },

      recordCount: (sessionId, lineId, qty, counter, reason, notFound) => {
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess;
            return {
              ...sess,
              updatedAt: Date.now(),
              lines: sess.lines.map((l) => {
                if (l.id !== lineId) return l;
                const isRecount = l.status === "Recount Required";
                const value = notFound ? 0 : qty;
                const next: CountLine = {
                  ...l,
                  firstCount: isRecount ? l.firstCount : value,
                  recountQty: isRecount ? value : l.recountQty,
                  finalCount: value,
                  counter,
                  reason: reason ?? l.reason,
                  status: notFound ? "Not Found" : "Counted",
                  lastCountedAt: Date.now(),
                };
                return next;
              }),
            };
          }),
        }));
        audit("STOCK_TAKE_LINE_COUNTED", sessionId, `${lineId} → ${notFound ? "not found" : qty}`);
      },

      addUnlistedSku: (sessionId, sku, product, qty, counter) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  lines: [
                    ...sess.lines,
                    {
                      id: `UL-${Date.now()}`, lineNo: sess.lines.length + 1, sku, product, brand: "—", category: "Unlisted",
                      uom: "Piece", barcode: "", systemQty: 0, unitCost: 0, firstCount: qty, recountQty: null, finalCount: qty,
                      reason: "Unposted supplier receipt", status: "Counted", counter, lastCountedAt: Date.now(),
                    },
                  ],
                  updatedAt: Date.now(),
                }
              : sess
          ),
        }));
        audit("STOCK_TAKE_LINE_COUNTED", sessionId, `Unlisted SKU added: ${sku}`, "warning");
      },

      submitSession: (id, actorId) => {
        const sess = get().sessions.find((s) => s.id === id);
        if (!sess) return { ok: false, error: "Session not found." };
        if (sess.status === "Posted" || sess.status === "Approved") return { ok: false, error: "A posted session can no longer be edited." };
        const uncounted = sess.lines.filter((l) => l.firstCount == null && l.status !== "Not Found");
        if (uncounted.length) return { ok: false, error: `${uncounted.length} line(s) are still uncounted.` };

        // Variance is calculated on submission — this is also the moment blind counts reveal system qty.
        const lines = sess.lines.map((l) => {
          const v = variance(l);
          const pct = Math.abs(variancePct(l));
          const withinTolerance = Math.abs(v) <= sess.qtyTolerance && pct <= sess.pctTolerance;
          const status: LineStatus = v === 0 ? "Matched" : withinTolerance ? "Within Tolerance" : sess.recountAboveTolerance && l.recountQty == null ? "Recount Required" : "Pending Checker";
          const reason = l.reason || (v === 0 ? ZERO_REASON : v > 0 ? "Previous count error" : "Breakage");
          return { ...l, status, reason };
        });
        const needsRecount = lines.some((l) => l.status === "Recount Required");
        const varianceLines = lines.filter((l) => variance(l) !== 0);
        audit("STOCK_TAKE_SUBMITTED", id, `${varianceLines.length} variance line(s)`);
        audit("STOCK_TAKE_VARIANCE_CALCULATED", id, `net ${lines.reduce((a, l) => a + variance(l), 0)} units`);

        if (needsRecount) {
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, lines, status: "Recount Required", updatedAt: Date.now() } : x)) }));
          audit("STOCK_TAKE_RECOUNT_REQUESTED", id, "Variance above tolerance", "warning");
          return { ok: true };
        }

        if (!sess.approvalRequired || !varianceLines.length) {
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, lines, status: "Approved", updatedAt: Date.now() } : x)) }));
          get().applyApprovalOutcome(id, "Approved", "System (no variance)");
          return { ok: true };
        }

        const approvals = useApprovalStore.getState();
        const maker = sess.makerId;
        void actorId;
        const approvalId = approvals.submitApproval({
          module: "Stock Taking",
          requestType: "Approve Stock Take Variance",
          recordRef: id,
          branch: sess.branch,
          makerId: maker,
          makerRole: "Inventory Officer",
          mode: "Single",
          priority: "High",
          variance: `${varianceLines.length} variance SKUs · net ${lines.reduce((a, l) => a + variance(l), 0)} units`,
          levels: [
            sess.checkerAssignment === "User-Based"
              ? { level: 1, assignmentType: "User-Based", userId: sess.checkerUserId, status: "Pending" }
              : { level: 1, assignmentType: "Role-Based", role: sess.checkerRole ?? "Inventory Manager", fallbackRole: "Store Manager", status: "Pending" },
          ],
          sourceRule: "RULE-STK-001",
          escalationHours: 8,
        });
        set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, lines, status: "Pending Checker", approvalId, updatedAt: Date.now() } : x)) }));
        audit("STOCK_TAKE_APPROVAL_ASSIGNED", id, approvalId);
        return { ok: true, approvalId };
      },

      requestRecount: (id, lineIds, actorId) => {
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === id
              ? { ...x, status: "Recount Required", updatedAt: Date.now(), lines: x.lines.map((l) => (lineIds.includes(l.id) ? { ...l, status: "Recount Required" } : l)) }
              : x
          ),
        }));
        audit("STOCK_TAKE_RECOUNT_REQUESTED", id, `${lineIds.length} line(s) by ${actorId}`, "warning");
      },

      acceptVariance: (id, lineId) => {
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, lines: x.lines.map((l) => (l.id === lineId ? { ...l, status: "Accepted" } : l)), updatedAt: Date.now() } : x)),
        }));
        audit("STOCK_TAKE_RECOUNT_COMPLETED", id, lineId);
      },

      changeReason: (id, lineId, reason) =>
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, lines: x.lines.map((l) => (l.id === lineId ? { ...l, reason } : l)), updatedAt: Date.now() } : x)),
        })),

      cancelSession: (id, reason, actorId) => {
        set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, status: "Cancelled", cancelReason: reason, updatedAt: Date.now() } : x)) }));
        audit("STOCK_TAKE_CANCELLED", id, `${reason} — ${actorId}`, "warning");
      },

      applyApprovalOutcome: (sessionId, outcome, approver) => {
        const sess = get().sessions.find((s) => s.id === sessionId);
        if (!sess) return;
        if (outcome === "Rejected") {
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, status: "Rejected", updatedAt: Date.now() } : x)) }));
          audit("STOCK_TAKE_REJECTED", sessionId, approver, "warning");
          return;
        }
        if (outcome === "Returned for Correction") {
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, status: "Recount Required", updatedAt: Date.now() } : x)) }));
          audit("STOCK_TAKE_RECOUNT_REQUESTED", sessionId, `Returned by ${approver}`, "warning");
          return;
        }

        audit("STOCK_TAKE_APPROVED", sessionId, approver);
        const varianceLines = sess.lines.filter((l) => variance(l) !== 0);
        if (!sess.autoAdjustment || !varianceLines.length) {
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, status: "Approved", updatedAt: Date.now() } : x)) }));
          return;
        }
        const adjId = `ADJ-2026-${String(get().adjSeq).padStart(4, "0")}`;
        const adjustment: StockTakeAdjustment = {
          id: adjId,
          sessionId,
          branch: sess.branch,
          createdBy: "System",
          approvedBy: approver,
          status: "Posted",
          postedAt: Date.now(),
          lines: varianceLines.map((l) => ({
            sku: l.sku, product: l.product, uom: l.uom, qty: variance(l), reason: l.reason,
            firstCount: l.firstCount, recount: l.recountQty, finalCount: l.finalCount ?? l.firstCount,
          })),
        };
        set((s) => ({
          adjustments: [adjustment, ...s.adjustments],
          adjSeq: s.adjSeq + 1,
          sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, status: "Posted", adjustmentId: adjId, updatedAt: Date.now() } : x)),
        }));
        audit("STOCK_TAKE_ADJUSTMENT_CREATED", adjId, `From ${sessionId}`);
        audit("STOCK_TAKE_ADJUSTMENT_POSTED", adjId, `${adjustment.lines.length} line(s)`);
      },
    }),
    { name: "buildpos-stock-take-v1" }
  )
);

// An approval decision on a Stock Taking request flows straight back into the session.
registerApprovalHandler("Stock Taking", (req, outcome) => {
  const approver = req.levels.find((l) => l.decidedBy)?.decidedBy ?? "Checker";
  const name = useApprovalStore.getState().users.find((u) => u.id === approver)?.name ?? approver;
  useStockTakeStore.getState().applyApprovalOutcome(req.recordRef, outcome, name);
});