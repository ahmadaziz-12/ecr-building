/**
 * Stock Intake (BRD §79) — functional, browser-persisted store.
 *
 * Everything the Add Stock process needs lives here: intake records, their lifecycle, the derived
 * stock movements, per-branch balances (available / reserved / quarantine / inspection hold /
 * supplier-return hold) and the source documents (purchase orders, transfers, customer returns,
 * quarantine records) that an intake can be raised against. Posting an intake is the only thing
 * that mutates balances, so the numbers on every tab reconcile by construction.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";

export const INTAKE_SOURCES = [
  "Purchase Order Receipt",
  "Stock Transfer Receipt",
  "Opening Stock",
  "Manual Stock Addition",
  "Customer Return Restock",
  "Quarantine Release",
  "Stock Count Surplus",
  "Data Migration",
  "Supplier Replacement",
  "Other Authorized Receipt",
] as const;
export type IntakeSource = (typeof INTAKE_SOURCES)[number];

export const INTAKE_STATUSES = [
  "Draft",
  "Submitted",
  "Pending Approval",
  "Approved",
  "Partially Received",
  "Inspection Required",
  "Posted",
  "Rejected",
  "Cancelled",
  "Discrepancy Review",
] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const DISPOSITIONS = [
  "Sellable Stock",
  "Inspection Hold",
  "Quarantine",
  "Supplier Return Hold",
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const DAMAGE_CODES = [
  "Cracked",
  "Broken",
  "Leaking",
  "Rusted",
  "Bent",
  "Wet",
  "Torn Packaging",
  "Expired",
  "Incorrect Specification",
  "Incorrect Color",
  "Incorrect Size",
  "Quantity Short",
  "Other",
] as const;

export const BRANCHES = [
  "Riyadh Main Branch",
  "Jeddah Branch",
  "Dammam Branch",
  "Makkah Branch",
  "Madinah Branch",
  "Khobar Building Materials Branch",
] as const;

export const SUPPLIERS = [
  "Al Noor Cement Company",
  "Gulf Steel Supply",
  "Saudi Tiles Trading",
  "ColorPro Paints",
  "FlowLine Trading",
  "Arabian Building Solutions",
] as const;

export type ProductRef = {
  sku: string;
  name: string;
  nameAr: string;
  category: string;
  stockUom: string;
  /** Receiving UOM -> how many stock UOM it converts into. Always includes the stock UOM at 1. */
  uoms: Record<string, number>;
  unitCost: number;
  vatRate: number;
  batchTracked?: boolean;
  expiryTracked?: boolean;
  serialTracked?: boolean;
  lowStockLevel: number;
};

export const PRODUCTS: ProductRef[] = [
  { sku: "CEM-OPC-50KG", name: "OPC Cement 50KG", nameAr: "أسمنت بورتلاندي ٥٠ كجم", category: "Cement", stockUom: "Bag", uoms: { Bag: 1, Pallet: 50 }, unitCost: 18.4, vatRate: 15, batchTracked: true, lowStockLevel: 200 },
  { sku: "STL-RB-16MM", name: "Steel Rebar 16MM", nameAr: "حديد تسليح ١٦ مم", category: "Steel", stockUom: "Bar", uoms: { Bar: 1, Bundle: 12 }, unitCost: 46, vatRate: 15, batchTracked: true, lowStockLevel: 150 },
  { sku: "TILE-GRY-60X60", name: "Grey Porcelain Tile 60×60", nameAr: "بلاط بورسلين رمادي", category: "Tiles", stockUom: "Box", uoms: { Box: 1, Pallet: 40 }, unitCost: 38, vatRate: 15, lowStockLevel: 80 },
  { sku: "PAINT-WHT-20L", name: "Interior White Paint 20L", nameAr: "دهان داخلي أبيض ٢٠ لتر", category: "Paints", stockUom: "Tin", uoms: { Tin: 1, Pallet: 24 }, unitCost: 105, vatRate: 15, batchTracked: true, expiryTracked: true, lowStockLevel: 40 },
  { sku: "PIPE-UPVC-2IN", name: "UPVC Pipe 2 Inch", nameAr: "أنبوب يو بي في سي ٢ بوصة", category: "Plumbing", stockUom: "Piece", uoms: { Piece: 1, Bundle: 20 }, unitCost: 21, vatRate: 15, lowStockLevel: 100 },
  { sku: "CBL-2.5MM", name: "Electric Cable 2.5MM", nameAr: "كابل كهرباء ٢.٥ مم", category: "Electrical", stockUom: "Metre", uoms: { Metre: 1, Roll: 100 }, unitCost: 4.3, vatRate: 15, lowStockLevel: 500 },
  { sku: "TOOL-DRL-500W", name: "Bosch Drill 500W", nameAr: "مثقاب بوش ٥٠٠ واط", category: "Tools", stockUom: "Unit", uoms: { Unit: 1, Carton: 6 }, unitCost: 210, vatRate: 15, serialTracked: true, lowStockLevel: 10 },
  { sku: "GLS-CLR-8MM", name: "Clear Glass 8MM", nameAr: "زجاج شفاف ٨ مم", category: "Glass", stockUom: "Sheet", uoms: { Sheet: 1, Crate: 10 }, unitCost: 165, vatRate: 15, lowStockLevel: 15 },
  { sku: "SAND-WSH-M3", name: "Washed Sand", nameAr: "رمل مغسول", category: "Aggregates", stockUom: "Ton", uoms: { Ton: 1, "m³": 1.6 }, unitCost: 62, vatRate: 15, lowStockLevel: 30 },
  { sku: "WPF-LIQ-20L", name: "Liquid Waterproof Membrane 20L", nameAr: "عازل مائي سائل ٢٠ لتر", category: "Waterproofing", stockUom: "Tin", uoms: { Tin: 1, Pallet: 24 }, unitCost: 142, vatRate: 15, batchTracked: true, expiryTracked: true, lowStockLevel: 30 },
  { sku: "INS-RW-50MM", name: "Rockwool Insulation 50MM", nameAr: "عزل صوف صخري ٥٠ مم", category: "Insulation", stockUom: "Slab", uoms: { Slab: 1, Pallet: 60 }, unitCost: 27, vatRate: 15, batchTracked: true, lowStockLevel: 100 },
];

export const CATEGORIES = Array.from(new Set(PRODUCTS.map((p) => p.category)));

export function findProduct(sku: string): ProductRef | undefined {
  return PRODUCTS.find((p) => p.sku === sku);
}

/* ---------------- Source documents ---------------- */

export type PoLineRef = { sku: string; orderedQty: number; receivedQty: number; uom: string; unitCost: number };
export type PurchaseOrderRef = {
  id: string;
  supplier: string;
  branch: string;
  status: "Approved" | "Partially Received" | "Received";
  lines: PoLineRef[];
};

export type TransferLineRef = { sku: string; dispatchedQty: number; receivedQty: number; uom: string };
export type TransferRef = {
  id: string;
  fromBranch: string;
  toBranch: string;
  status: "Dispatched" | "Partially Dispatched" | "Received" | "Received with Damage";
  lines: TransferLineRef[];
};

export type ReturnLineRef = { sku: string; approvedQty: number; restockedQty: number; uom: string };
export type CustomerReturnRef = {
  id: string;
  invoiceNo: string;
  customer: string;
  branch: string;
  restocked: boolean;
  lines: ReturnLineRef[];
};

export type QuarantineRecord = {
  id: string;
  sku: string;
  branch: string;
  qty: number;
  released: number;
  reason: string;
  sourceRef: string;
  createdAt: number;
};

/* ---------------- Intake ---------------- */

export type IntakeLine = {
  key: string;
  sku: string;
  recvUom: string;
  recvQty: number;
  acceptedQty: number;
  damagedQty: number;
  rejectedQty: number;
  shortQty: number;
  freeQty: number;
  batchNo: string;
  serials: string;
  mfgDate: string;
  expiryDate: string;
  disposition: Disposition;
  damageCode: string;
  unitCost: number;
  discountPct: number;
  vatRate: number;
  notes: string;
  /** Populated when the line came from a PO / transfer so the form can show what's outstanding. */
  orderedQty?: number;
  remainingQty?: number;
  dispatchedQty?: number;
};

export type IntakeHistoryEntry = { ts: number; event: string; user: string; note?: string };

export type StockIntake = {
  id: string;
  grn: string;
  source: IntakeSource;
  sourceRef: string;
  externalRef: string;
  sourceDate: string;
  branch: string;
  fromBranch?: string;
  locationRef: string;
  receiptDate: string;
  receiptTime: string;
  supplier: string;
  deliveryNote: string;
  invoiceNo: string;
  receivedBy: string;
  inspectionRequired: boolean;
  defaultDisposition: Disposition;
  reason: string;
  internalNotes: string;
  supplierNotes: string;
  approvalComments: string;
  attachments: string[];
  lines: IntakeLine[];
  status: IntakeStatus;
  createdBy: string;
  approvedBy: string;
  postedAt: number | null;
  createdAt: number;
  history: IntakeHistoryEntry[];
};

export type StockMovement = {
  id: string;
  ts: number;
  type: string;
  sku: string;
  branch: string;
  locationRef: string;
  qty: number;
  stockUom: string;
  availableChange: number;
  quarantineChange: number;
  unitCost: number;
  totalValue: number;
  sourceRecord: string;
  sourceRef: string;
  createdBy: string;
  approvedBy: string;
  status: "Posted";
};

export type BranchStock = {
  available: number;
  reserved: number;
  quarantine: number;
  inspectionHold: number;
  supplierReturnHold: number;
};

export const EMPTY_STOCK: BranchStock = { available: 0, reserved: 0, quarantine: 0, inspectionHold: 0, supplierReturnHold: 0 };

export function onHand(s: BranchStock): number {
  return s.available + s.reserved + s.quarantine + s.inspectionHold + s.supplierReturnHold;
}

export const MOVEMENT_TYPE_BY_SOURCE: Record<IntakeSource, string> = {
  "Purchase Order Receipt": "Purchase Receipt",
  "Stock Transfer Receipt": "Transfer Receipt",
  "Opening Stock": "Opening Stock",
  "Manual Stock Addition": "Manual Addition",
  "Customer Return Restock": "Customer Return Restock",
  "Quarantine Release": "Quarantine Release",
  "Stock Count Surplus": "Stock Count Surplus",
  "Data Migration": "Manual Addition",
  "Supplier Replacement": "Supplier Replacement",
  "Other Authorized Receipt": "Manual Addition",
};

/* ---------------- Line math ---------------- */

export function conversionFactor(sku: string, recvUom: string): number {
  const p = findProduct(sku);
  return p?.uoms[recvUom] ?? 1;
}

export function convertedQty(line: IntakeLine): number {
  return round4(line.recvQty * conversionFactor(line.sku, line.recvUom));
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function lineNet(line: IntakeLine): number {
  const gross = convertedQty(line) * line.unitCost;
  return round2(gross * (1 - (line.discountPct || 0) / 100));
}
export function lineVat(line: IntakeLine): number {
  return round2((lineNet(line) * (line.vatRate || 0)) / 100);
}

export type IntakeTotals = {
  received: number;
  accepted: number;
  damaged: number;
  rejected: number;
  quarantine: number;
  net: number;
  vat: number;
  total: number;
  acceptedValue: number;
  quarantineValue: number;
  rejectedValue: number;
};

export function intakeTotals(intake: Pick<StockIntake, "lines">): IntakeTotals {
  return intake.lines.reduce<IntakeTotals>(
    (acc, l) => {
      const conv = convertedQty(l);
      const unit = conv > 0 ? lineNet(l) / conv : 0;
      acc.received += conv;
      acc.accepted += l.acceptedQty;
      acc.damaged += l.damagedQty;
      acc.rejected += l.rejectedQty;
      acc.quarantine += l.damagedQty + (l.disposition === "Quarantine" ? l.acceptedQty : 0);
      acc.net = round2(acc.net + lineNet(l));
      acc.vat = round2(acc.vat + lineVat(l));
      acc.total = round2(acc.net + acc.vat);
      acc.acceptedValue = round2(acc.acceptedValue + l.acceptedQty * unit);
      acc.quarantineValue = round2(acc.quarantineValue + l.damagedQty * unit);
      acc.rejectedValue = round2(acc.rejectedValue + l.rejectedQty * unit);
      return acc;
    },
    { received: 0, accepted: 0, damaged: 0, rejected: 0, quarantine: 0, net: 0, vat: 0, total: 0, acceptedValue: 0, quarantineValue: 0, rejectedValue: 0 },
  );
}

/** §79.6 line reconciliation + batch/expiry/serial rules. Returns human-readable blockers. */
export function validateIntake(intake: StockIntake): string[] {
  const errs: string[] = [];
  if (!intake.branch) errs.push("Receiving branch is mandatory.");
  if (intake.lines.length === 0) errs.push("At least one product is required.");
  if (intake.source === "Purchase Order Receipt" && !intake.sourceRef) errs.push("Purchase order is required for a PO receipt.");
  if (intake.source === "Stock Transfer Receipt" && !intake.sourceRef) errs.push("Transfer number is required for a transfer receipt.");
  if (intake.source === "Customer Return Restock" && !intake.sourceRef) errs.push("Customer return number is required.");
  if (intake.source === "Quarantine Release" && !intake.sourceRef) errs.push("Quarantine record is required.");
  if (intake.source === "Stock Count Surplus" && !intake.sourceRef) errs.push("Stock-count reference is required.");
  if (intake.source === "Opening Stock" && (!intake.sourceDate || !intake.reason))
    errs.push("Opening stock requires an opening date and reason.");
  if (intake.source === "Manual Stock Addition" && !intake.reason)
    errs.push("Manual stock addition requires a reason and supporting reference.");

  const seenSerials = new Set<string>();
  intake.lines.forEach((l, i) => {
    const p = findProduct(l.sku);
    const label = `Line ${i + 1} (${l.sku || "no SKU"})`;
    if (!p) return errs.push(`${label}: SKU is not in the active product master.`);
    if (l.recvQty <= 0) errs.push(`${label}: received quantity must be greater than zero.`);
    if (!p.uoms[l.recvUom]) errs.push(`${label}: receiving UOM "${l.recvUom}" is not configured for this product.`);
    if (conversionFactor(l.sku, l.recvUom) <= 0) errs.push(`${label}: conversion factor must be greater than zero.`);
    const conv = convertedQty(l);
    const sum = round4(l.acceptedQty + l.damagedQty + l.rejectedQty + l.shortQty);
    if (sum !== round4(conv)) errs.push(`${label}: accepted + damaged + rejected + short (${sum}) must equal received ${conv} ${p.stockUom}.`);
    if (p.batchTracked && !l.batchNo.trim()) errs.push(`${label}: batch number is required.`);
    if (p.expiryTracked && !l.expiryDate) errs.push(`${label}: expiry date is required.`);
    if (p.expiryTracked && l.expiryDate && new Date(l.expiryDate) < new Date() && l.disposition === "Sellable Stock")
      errs.push(`${label}: expired stock cannot be received as sellable.`);
    if (p.serialTracked) {
      const serials = l.serials.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      if (serials.length !== l.acceptedQty)
        errs.push(`${label}: serial-tracked product needs one serial per accepted unit (${serials.length}/${l.acceptedQty}).`);
      serials.forEach((s) => {
        if (seenSerials.has(s)) errs.push(`${label}: duplicate serial number ${s}.`);
        seenSerials.add(s);
      });
    }
    if (l.remainingQty !== undefined && conv > l.remainingQty)
      errs.push(`${label}: over-receipt — ${conv} received against ${l.remainingQty} outstanding on the purchase order. Procurement approval required.`);
    if (l.dispatchedQty !== undefined && conv > l.dispatchedQty)
      errs.push(`${label}: received quantity exceeds the ${l.dispatchedQty} dispatched on the transfer.`);
  });
  return errs;
}

/** §79.7 configurable approval rules — returns the rules that fire for this intake. */
export type ApprovalRule = { name: string; condition: string; action: string };
export const APPROVAL_RULES: ApprovalRule[] = [
  { name: "High-Value Stock Receipt Approval", condition: "Total receipt value exceeds SAR 100,000", action: "Require Store Manager and Finance Manager approval" },
  { name: "Purchase Order Over-Receipt", condition: "Received quantity exceeds outstanding PO quantity", action: "Block posting until Procurement Manager approval" },
  { name: "Manual Stock Addition", condition: "Stock source equals Manual Stock Addition", action: "Require Inventory Manager approval" },
  { name: "High Damage Receipt", condition: "Damaged quantity exceeds 5% of total received quantity", action: "Require inspection and manager approval" },
  { name: "Purchase Cost Variance", condition: "New unit cost differs by more than 10% from last purchase cost", action: "Require Procurement Manager approval" },
];

export function triggeredRules(intake: StockIntake): ApprovalRule[] {
  const t = intakeTotals(intake);
  const fired: ApprovalRule[] = [];
  if (t.total > 100000) fired.push(APPROVAL_RULES[0]);
  if (intake.lines.some((l) => l.remainingQty !== undefined && convertedQty(l) > l.remainingQty)) fired.push(APPROVAL_RULES[1]);
  if (intake.source === "Manual Stock Addition" || intake.source === "Opening Stock") fired.push(APPROVAL_RULES[2]);
  if (t.received > 0 && t.damaged / t.received > 0.05) fired.push(APPROVAL_RULES[3]);
  if (intake.lines.some((l) => costVariance(l) !== null && Math.abs(costVariance(l)!) > 10)) fired.push(APPROVAL_RULES[4]);
  return fired;
}

/** % difference between the line cost and the product's last purchase cost. */
export function costVariance(line: IntakeLine): number | null {
  const p = findProduct(line.sku);
  if (!p || !p.unitCost) return null;
  return round2(((line.unitCost - p.unitCost) / p.unitCost) * 100);
}

/* ---------------- Seeds ---------------- */

function h(event: string, user: string, note?: string, minutesAgo = 0): IntakeHistoryEntry {
  return { ts: Date.now() - minutesAgo * 60000, event, user, note };
}

function line(partial: Partial<IntakeLine> & { sku: string; recvQty: number }): IntakeLine {
  const p = findProduct(partial.sku)!;
  const base: IntakeLine = {
    key: `${partial.sku}-${Math.random().toString(36).slice(2, 8)}`,
    sku: partial.sku,
    recvUom: p.stockUom,
    recvQty: partial.recvQty,
    acceptedQty: partial.recvQty,
    damagedQty: 0,
    rejectedQty: 0,
    shortQty: 0,
    freeQty: 0,
    batchNo: "",
    serials: "",
    mfgDate: "",
    expiryDate: "",
    disposition: "Sellable Stock",
    damageCode: "",
    unitCost: p.unitCost,
    discountPct: 0,
    vatRate: p.vatRate,
    notes: "",
  };
  return { ...base, ...partial };
}

const SEED_PO: PurchaseOrderRef[] = [
  {
    id: "PO-2026-0561",
    supplier: "Arabian Building Solutions",
    branch: "Riyadh Main Branch",
    status: "Approved",
    lines: [
      { sku: "WPF-LIQ-20L", orderedQty: 120, receivedQty: 0, uom: "Tin", unitCost: 142 },
      { sku: "INS-RW-50MM", orderedQty: 300, receivedQty: 0, uom: "Slab", unitCost: 27 },
      { sku: "PAINT-WHT-20L", orderedQty: 100, receivedQty: 0, uom: "Tin", unitCost: 105 },
    ],
  },
  {
    id: "PO-2026-0574",
    supplier: "Al Noor Cement Company",
    branch: "Riyadh Main Branch",
    status: "Approved",
    lines: [
      { sku: "CEM-OPC-50KG", orderedQty: 500, receivedQty: 0, uom: "Bag", unitCost: 18.4 },
      { sku: "SAND-WSH-M3", orderedQty: 24, receivedQty: 0, uom: "Ton", unitCost: 62 },
    ],
  },
  {
    id: "PO-2026-0588",
    supplier: "Gulf Steel Supply",
    branch: "Dammam Branch",
    status: "Approved",
    lines: [{ sku: "STL-RB-16MM", orderedQty: 240, receivedQty: 0, uom: "Bar", unitCost: 46 }],
  },
];

const SEED_TRANSFERS: TransferRef[] = [
  {
    id: "TRF-2026-0118",
    fromBranch: "Jeddah Branch",
    toBranch: "Riyadh Main Branch",
    status: "Dispatched",
    lines: [{ sku: "TILE-GRY-60X60", dispatchedQty: 100, receivedQty: 0, uom: "Box" }],
  },
  {
    id: "TRF-2026-0124",
    fromBranch: "Riyadh Main Branch",
    toBranch: "Khobar Building Materials Branch",
    status: "Dispatched",
    lines: [
      { sku: "CBL-2.5MM", dispatchedQty: 800, receivedQty: 0, uom: "Metre" },
      { sku: "PIPE-UPVC-2IN", dispatchedQty: 120, receivedQty: 0, uom: "Piece" },
    ],
  },
];

const SEED_RETURNS: CustomerReturnRef[] = [
  {
    id: "RET-222",
    invoiceNo: "INV-2026-00872",
    customer: "Al Noor Contracting Company",
    branch: "Riyadh Main Branch",
    restocked: false,
    lines: [{ sku: "CEM-OPC-50KG", approvedQty: 40, restockedQty: 0, uom: "Bag" }],
  },
  {
    id: "RET-231",
    invoiceNo: "INV-2026-00905",
    customer: "Bina Contracting Est.",
    branch: "Jeddah Branch",
    restocked: false,
    lines: [{ sku: "PAINT-WHT-20L", approvedQty: 6, restockedQty: 0, uom: "Tin" }],
  },
];

const SEED_QUARANTINE: QuarantineRecord[] = [
  { id: "QTN-2026-0044", sku: "TILE-GRY-60X60", branch: "Riyadh Main Branch", qty: 6, released: 0, reason: "Cracked corners on delivery", sourceRef: "GRN-2026-0512", createdAt: Date.now() - 86400000 * 6 },
  { id: "QTN-2026-0051", sku: "PAINT-WHT-20L", branch: "Jeddah Branch", qty: 3, released: 0, reason: "Dented tins pending supplier decision", sourceRef: "GRN-2026-0533", createdAt: Date.now() - 86400000 * 2 },
];

function seedBalances(): Record<string, BranchStock> {
  const b: Record<string, BranchStock> = {};
  const put = (branch: string, sku: string, s: Partial<BranchStock>) => {
    b[`${branch}|${sku}`] = { ...EMPTY_STOCK, ...s };
  };
  put("Riyadh Main Branch", "CEM-OPC-50KG", { available: 420, reserved: 60 });
  put("Riyadh Main Branch", "STL-RB-16MM", { available: 180, reserved: 24 });
  put("Riyadh Main Branch", "TILE-GRY-60X60", { available: 64, quarantine: 6 });
  put("Riyadh Main Branch", "PAINT-WHT-20L", { available: 38 });
  put("Riyadh Main Branch", "WPF-LIQ-20L", { available: 12 });
  put("Riyadh Main Branch", "INS-RW-50MM", { available: 90 });
  put("Riyadh Main Branch", "CBL-2.5MM", { available: 1200, reserved: 150 });
  put("Riyadh Main Branch", "TOOL-DRL-500W", { available: 8 });
  put("Jeddah Branch", "TILE-GRY-60X60", { available: 210 });
  put("Jeddah Branch", "PAINT-WHT-20L", { available: 54, quarantine: 3 });
  put("Jeddah Branch", "CEM-OPC-50KG", { available: 310 });
  put("Dammam Branch", "STL-RB-16MM", { available: 95 });
  put("Dammam Branch", "SAND-WSH-M3", { available: 22 });
  put("Makkah Branch", "CEM-OPC-50KG", { available: 140 });
  put("Madinah Branch", "PIPE-UPVC-2IN", { available: 60 });
  return b;
}

function seedIntakes(): StockIntake[] {
  const today = new Date().toISOString().slice(0, 10);
  const poIntake: StockIntake = {
    id: "STK-IN-2026-0061",
    grn: "GRN-2026-0561",
    source: "Purchase Order Receipt",
    sourceRef: "PO-2026-0561",
    externalRef: "ABS-DN-88721",
    sourceDate: "2026-07-19",
    branch: "Riyadh Main Branch",
    locationRef: "Riyadh Main — Receiving Bay 2",
    receiptDate: "2026-07-19",
    receiptTime: "10:20",
    supplier: "Arabian Building Solutions",
    deliveryNote: "ABS-DN-88721",
    invoiceNo: "ABS-INV-20194",
    receivedBy: "Noura Al-Salem",
    inspectionRequired: true,
    defaultDisposition: "Sellable Stock",
    reason: "",
    internalNotes: "Two waterproofing tins leaking, two paint tins dented on arrival.",
    supplierNotes: "",
    approvalComments: "",
    attachments: ["Supplier Delivery Note — ABS-DN-88721.pdf", "Supplier Invoice — ABS-INV-20194.pdf"],
    lines: [
      line({ sku: "WPF-LIQ-20L", recvQty: 120, acceptedQty: 118, damagedQty: 2, batchNo: "WPF-JUL-26", expiryDate: "2027-07-18", damageCode: "Leaking", unitCost: 142, orderedQty: 120, remainingQty: 120, notes: "Two tins leaking" }),
      line({ sku: "INS-RW-50MM", recvQty: 300, acceptedQty: 300, batchNo: "RW-260719", unitCost: 27, orderedQty: 300, remainingQty: 300 }),
      line({ sku: "PAINT-WHT-20L", recvQty: 100, acceptedQty: 98, damagedQty: 2, batchNo: "PNT-JUL-26", expiryDate: "2028-01-31", damageCode: "Torn Packaging", unitCost: 105, orderedQty: 100, remainingQty: 100, notes: "Dented and leaking packaging" }),
    ],
    status: "Inspection Required",
    createdBy: "Noura Al-Salem",
    approvedBy: "",
    postedAt: null,
    createdAt: Date.now() - 3600000 * 5,
    history: [h("STOCK_INTAKE_CREATED", "Noura Al-Salem", "Raised against PO-2026-0561", 300), h("STOCK_INTAKE_SUBMITTED", "Noura Al-Salem", undefined, 240)],
  };

  const opening: StockIntake = {
    id: "STK-IN-2026-0062",
    grn: "GRN-2026-0562",
    source: "Opening Stock",
    sourceRef: "KHB-GOLIVE-001",
    externalRef: "KHB-GOLIVE-001",
    sourceDate: "2026-08-01",
    branch: "Khobar Building Materials Branch",
    locationRef: "Khobar — Main Store",
    receiptDate: "2026-08-01",
    receiptTime: "08:00",
    supplier: "",
    deliveryNote: "",
    invoiceNo: "",
    receivedBy: "Maha Al-Rashid",
    inspectionRequired: false,
    defaultDisposition: "Sellable Stock",
    reason: "New branch go-live opening balances",
    internalNotes: "",
    supplierNotes: "",
    approvalComments: "Verified against implementation sheet.",
    attachments: ["Opening Balance Sheet — KHB-GOLIVE-001.xlsx"],
    lines: [
      line({ sku: "CEM-OPC-50KG", recvQty: 500, batchNo: "OPEN-KHB" }),
      line({ sku: "STL-RB-16MM", recvQty: 800, batchNo: "OPEN-KHB" }),
      line({ sku: "TILE-GRY-60X60", recvQty: 200 }),
      line({ sku: "PAINT-WHT-20L", recvQty: 100, batchNo: "OPEN-KHB", expiryDate: "2028-06-30" }),
      line({ sku: "PIPE-UPVC-2IN", recvQty: 300 }),
      line({ sku: "CBL-2.5MM", recvQty: 2000 }),
      line({ sku: "TOOL-DRL-500W", recvQty: 20, serials: Array.from({ length: 20 }, (_, i) => `BSD-500W-${2600 + i}`).join("\n") }),
      line({ sku: "GLS-CLR-8MM", recvQty: 40 }),
    ],
    status: "Approved",
    createdBy: "Maha Al-Rashid",
    approvedBy: "Ahmed Al-Harbi",
    postedAt: null,
    createdAt: Date.now() - 3600000 * 20,
    history: [h("OPENING_STOCK_CREATED", "Maha Al-Rashid", undefined, 1200), h("STOCK_INTAKE_SUBMITTED", "Maha Al-Rashid", undefined, 1100), h("STOCK_INTAKE_APPROVED", "Ahmed Al-Harbi", undefined, 900)],
  };

  const transfer: StockIntake = {
    id: "STK-IN-2026-0063",
    grn: "GRN-2026-0563",
    source: "Stock Transfer Receipt",
    sourceRef: "TRF-2026-0118",
    externalRef: "",
    sourceDate: today,
    branch: "Riyadh Main Branch",
    fromBranch: "Jeddah Branch",
    locationRef: "Riyadh Main — Receiving Bay 1",
    receiptDate: today,
    receiptTime: "12:05",
    supplier: "",
    deliveryNote: "TRF-NOTE-0118",
    invoiceNo: "",
    receivedBy: "Faisal Al-Otaibi",
    inspectionRequired: false,
    defaultDisposition: "Sellable Stock",
    reason: "",
    internalNotes: "Two boxes cracked in transit.",
    supplierNotes: "",
    approvalComments: "",
    attachments: ["Stock Transfer Note — TRF-2026-0118.pdf"],
    lines: [line({ sku: "TILE-GRY-60X60", recvQty: 100, acceptedQty: 98, damagedQty: 2, damageCode: "Cracked", dispatchedQty: 100, notes: "Two boxes cracked in transit" })],
    status: "Discrepancy Review",
    createdBy: "Faisal Al-Otaibi",
    approvedBy: "",
    postedAt: null,
    createdAt: Date.now() - 3600000 * 2,
    history: [h("TRANSFER_RECEIPT_CREATED", "Faisal Al-Otaibi", undefined, 130), h("RECEIPT_DISCREPANCY_CREATED", "Faisal Al-Otaibi", "2 boxes cracked", 125)],
  };

  const custReturn: StockIntake = {
    id: "STK-IN-2026-0064",
    grn: "GRN-2026-0564",
    source: "Customer Return Restock",
    sourceRef: "RET-222",
    externalRef: "INV-2026-00872",
    sourceDate: today,
    branch: "Riyadh Main Branch",
    locationRef: "Riyadh Main — Returns Desk",
    receiptDate: today,
    receiptTime: "09:15",
    supplier: "",
    deliveryNote: "",
    invoiceNo: "INV-2026-00872",
    receivedBy: "Sara Al-Qahtani",
    inspectionRequired: true,
    defaultDisposition: "Sellable Stock",
    reason: "Approved customer return — Al Noor Contracting Company",
    internalNotes: "Restocking fee 5% applied on the credit note.",
    supplierNotes: "",
    approvalComments: "",
    attachments: ["Customer Return Document — RET-222.pdf"],
    lines: [line({ sku: "CEM-OPC-50KG", recvQty: 40, acceptedQty: 38, damagedQty: 2, batchNo: "OPC-JUN-26", damageCode: "Torn Packaging" })],
    status: "Draft",
    createdBy: "Sara Al-Qahtani",
    approvedBy: "",
    postedAt: null,
    createdAt: Date.now() - 3600000,
    history: [h("STOCK_INTAKE_CREATED", "Sara Al-Qahtani", "Linked to RET-222", 60)],
  };

  const manual: StockIntake = {
    id: "STK-IN-2026-0065",
    grn: "GRN-2026-0565",
    source: "Manual Stock Addition",
    sourceRef: "ADJ-REF-2211",
    externalRef: "ADJ-REF-2211",
    sourceDate: today,
    branch: "Dammam Branch",
    locationRef: "Dammam — Yard A",
    receiptDate: today,
    receiptTime: "14:40",
    supplier: "Gulf Steel Supply",
    deliveryNote: "",
    invoiceNo: "",
    receivedBy: "Khalid Al-Dossary",
    inspectionRequired: false,
    defaultDisposition: "Sellable Stock",
    reason: "Uninvoiced supplier replacement bars found in yard audit",
    internalNotes: "",
    supplierNotes: "",
    approvalComments: "",
    attachments: ["Other Attachment — yard-audit-note.pdf"],
    lines: [line({ sku: "STL-RB-16MM", recvQty: 2, recvUom: "Bundle", acceptedQty: 24, batchNo: "GS-JUL-26" })],
    status: "Pending Approval",
    createdBy: "Khalid Al-Dossary",
    approvedBy: "",
    postedAt: null,
    createdAt: Date.now() - 1800000,
    history: [h("STOCK_INTAKE_CREATED", "Khalid Al-Dossary", undefined, 40), h("STOCK_INTAKE_SUBMITTED", "Khalid Al-Dossary", undefined, 30)],
  };

  return [poIntake, opening, transfer, custReturn, manual];
}

/* ---------------- Store ---------------- */

type State = {
  intakes: StockIntake[];
  movements: StockMovement[];
  balances: Record<string, BranchStock>;
  purchaseOrders: PurchaseOrderRef[];
  transfers: TransferRef[];
  returns: CustomerReturnRef[];
  quarantine: QuarantineRecord[];
  seq: { intake: number; grn: number; movement: number; quarantine: number };

  nextIds: () => { id: string; grn: string };
  upsertIntake: (intake: StockIntake, user: string) => void;
  transition: (id: string, status: IntakeStatus, event: string, user: string, note?: string) => void;
  postIntake: (id: string, user: string) => { ok: boolean; message: string };
  reset: () => void;
};

function pad(n: number, len = 4) {
  return String(n).padStart(len, "0");
}

function audit(event: string, recordId: string, user: string, reason?: string, severity: "info" | "warning" | "critical" = "info", branch?: string) {
  useAuditStore.getState().log({ module: "system", event, recordId, user, branch, reason, severity });
}

export const useStockIntakeStore = create<State>()(
  persist(
    (set, get) => ({
      intakes: seedIntakes(),
      movements: [],
      balances: seedBalances(),
      purchaseOrders: SEED_PO,
      transfers: SEED_TRANSFERS,
      returns: SEED_RETURNS,
      quarantine: SEED_QUARANTINE,
      seq: { intake: 66, grn: 566, movement: 5011, quarantine: 52 },

      nextIds: () => {
        const { seq } = get();
        return { id: `STK-IN-2026-${pad(seq.intake)}`, grn: `GRN-2026-${pad(seq.grn)}` };
      },

      upsertIntake: (intake, user) =>
        set((s) => {
          const exists = s.intakes.some((i) => i.id === intake.id);
          const event = exists ? "STOCK_INTAKE_UPDATED" : "STOCK_INTAKE_CREATED";
          audit(event, intake.id, user, intake.reason || undefined, "info", intake.branch);
          const withHistory: StockIntake = {
            ...intake,
            history: [...intake.history, { ts: Date.now(), event, user }],
          };
          return {
            intakes: exists ? s.intakes.map((i) => (i.id === intake.id ? withHistory : i)) : [withHistory, ...s.intakes],
            seq: exists ? s.seq : { ...s.seq, intake: s.seq.intake + 1, grn: s.seq.grn + 1 },
          };
        }),

      transition: (id, status, event, user, note) =>
        set((s) => {
          const target = s.intakes.find((i) => i.id === id);
          if (target) audit(event, id, user, note, status === "Rejected" ? "warning" : "info", target.branch);
          return {
            intakes: s.intakes.map((i) =>
              i.id === id
                ? {
                    ...i,
                    status,
                    approvedBy: status === "Approved" || status === "Posted" ? user : i.approvedBy,
                    approvalComments: note ?? i.approvalComments,
                    history: [...i.history, { ts: Date.now(), event, user, note }],
                  }
                : i,
            ),
          };
        }),

      postIntake: (id, user) => {
        const state = get();
        const intake = state.intakes.find((i) => i.id === id);
        if (!intake) return { ok: false, message: "Stock intake not found." };
        if (intake.status === "Posted") return { ok: false, message: "Posted stock intakes cannot be posted again." };
        const errs = validateIntake(intake);
        if (errs.length) return { ok: false, message: errs[0] };
        if (intake.source === "Customer Return Restock") {
          const ret = state.returns.find((r) => r.id === intake.sourceRef);
          if (ret?.restocked) return { ok: false, message: `${ret.id} has already been restocked.` };
        }

        const balances = { ...state.balances };
        const movements: StockMovement[] = [];
        const quarantine = [...state.quarantine];
        let movementSeq = state.seq.movement;
        let quarantineSeq = state.seq.quarantine;

        intake.lines.forEach((l) => {
          const p = findProduct(l.sku)!;
          const key = `${intake.branch}|${l.sku}`;
          const cur = balances[key] ?? EMPTY_STOCK;
          const conv = convertedQty(l);
          const unit = conv > 0 ? lineNet(l) / conv : 0;

          let availableChange = 0;
          let inspectionChange = 0;
          let holdChange = 0;
          if (l.disposition === "Sellable Stock" && !intake.inspectionRequired) availableChange = l.acceptedQty;
          else if (l.disposition === "Sellable Stock") inspectionChange = l.acceptedQty;
          else if (l.disposition === "Inspection Hold") inspectionChange = l.acceptedQty;
          else if (l.disposition === "Supplier Return Hold") holdChange = l.acceptedQty;
          const quarantineChange = l.damagedQty + (l.disposition === "Quarantine" ? l.acceptedQty : 0);

          balances[key] = {
            ...cur,
            available: round4(cur.available + availableChange),
            quarantine: round4(cur.quarantine + quarantineChange),
            inspectionHold: round4(cur.inspectionHold + inspectionChange),
            supplierReturnHold: round4(cur.supplierReturnHold + holdChange),
          };

          if (quarantineChange > 0) {
            quarantine.unshift({
              id: `QTN-2026-${pad(quarantineSeq++)}`,
              sku: l.sku,
              branch: intake.branch,
              qty: quarantineChange,
              released: 0,
              reason: l.damageCode || "Received damaged",
              sourceRef: intake.grn,
              createdAt: Date.now(),
            });
            audit("QUARANTINE_STOCK_RECEIVED", intake.id, user, `${quarantineChange} ${p.stockUom} ${l.sku}`, "warning", intake.branch);
          }

          movements.push({
            id: `MOV-2026-${pad(movementSeq++)}`,
            ts: Date.now(),
            type: MOVEMENT_TYPE_BY_SOURCE[intake.source],
            sku: l.sku,
            branch: intake.branch,
            locationRef: intake.locationRef,
            qty: l.acceptedQty + quarantineChange,
            stockUom: p.stockUom,
            availableChange,
            quarantineChange,
            unitCost: round2(unit),
            totalValue: round2((l.acceptedQty + quarantineChange) * unit),
            sourceRecord: intake.grn,
            sourceRef: intake.sourceRef || intake.externalRef,
            createdBy: intake.createdBy,
            approvedBy: intake.approvedBy || user,
            status: "Posted",
          });
        });

        // Source-document write-back (§79.17).
        let purchaseOrders = state.purchaseOrders;
        let transfers = state.transfers;
        let returns = state.returns;

        if (intake.source === "Purchase Order Receipt") {
          purchaseOrders = state.purchaseOrders.map((po) => {
            if (po.id !== intake.sourceRef) return po;
            const lines = po.lines.map((pl) => {
              const il = intake.lines.find((l) => l.sku === pl.sku);
              return il ? { ...pl, receivedQty: round4(pl.receivedQty + convertedQty(il)), unitCost: il.unitCost } : pl;
            });
            const complete = lines.every((pl) => pl.receivedQty >= pl.orderedQty);
            return { ...po, lines, status: complete ? "Received" : "Partially Received" };
          });
        }
        if (intake.source === "Stock Transfer Receipt") {
          transfers = state.transfers.map((t) => {
            if (t.id !== intake.sourceRef) return t;
            const lines = t.lines.map((tl) => {
              const il = intake.lines.find((l) => l.sku === tl.sku);
              return il ? { ...tl, receivedQty: round4(tl.receivedQty + convertedQty(il)) } : tl;
            });
            const damaged = intake.lines.some((l) => l.damagedQty > 0);
            return { ...t, lines, status: damaged ? "Received with Damage" : "Received" };
          });
          // The dispatching branch releases the in-transit quantity on receipt.
          if (intake.fromBranch) {
            intake.lines.forEach((l) => {
              const key = `${intake.fromBranch}|${l.sku}`;
              const cur = balances[key] ?? EMPTY_STOCK;
              balances[key] = { ...cur, available: round4(Math.max(0, cur.available - convertedQty(l))) };
            });
          }
        }
        if (intake.source === "Customer Return Restock") {
          returns = state.returns.map((r) =>
            r.id === intake.sourceRef
              ? {
                  ...r,
                  restocked: true,
                  lines: r.lines.map((rl) => {
                    const il = intake.lines.find((l) => l.sku === rl.sku);
                    return il ? { ...rl, restockedQty: il.acceptedQty } : rl;
                  }),
                }
              : r,
          );
          audit("CUSTOMER_RETURN_RESTOCKED", intake.id, user, intake.sourceRef, "info", intake.branch);
        }
        if (intake.source === "Quarantine Release") {
          const rec = quarantine.find((q) => q.id === intake.sourceRef);
          if (rec) {
            const released = intake.lines.reduce((s2, l) => s2 + l.acceptedQty, 0);
            rec.released = round4(rec.released + released);
            const key = `${rec.branch}|${rec.sku}`;
            const cur = balances[key] ?? EMPTY_STOCK;
            balances[key] = { ...cur, quarantine: round4(Math.max(0, cur.quarantine - released)) };
            audit("QUARANTINE_STOCK_RELEASED", intake.id, user, `${released} ${rec.sku}`, "info", intake.branch);
          }
        }
        if (intake.source === "Opening Stock") audit("OPENING_STOCK_POSTED", intake.id, user, intake.sourceRef, "info", intake.branch);
        movements.forEach((m) => audit("STOCK_MOVEMENT_CREATED", m.id, user, `${m.type} · ${m.sku}`, "info", m.branch));
        audit("STOCK_INTAKE_POSTED", intake.id, user, intake.grn, "info", intake.branch);

        set({
          balances,
          movements: [...movements, ...state.movements],
          quarantine,
          purchaseOrders,
          transfers,
          returns,
          seq: { ...state.seq, movement: movementSeq, quarantine: quarantineSeq },
          intakes: state.intakes.map((i) =>
            i.id === id
              ? { ...i, status: "Posted", postedAt: Date.now(), approvedBy: i.approvedBy || user, history: [...i.history, { ts: Date.now(), event: "STOCK_INTAKE_POSTED", user }] }
              : i,
          ),
        });
        return { ok: true, message: `${intake.grn} posted — ${movements.length} stock movement(s) created.` };
      },

      reset: () =>
        set({
          intakes: seedIntakes(),
          movements: [],
          balances: seedBalances(),
          purchaseOrders: SEED_PO,
          transfers: SEED_TRANSFERS,
          returns: SEED_RETURNS,
          quarantine: SEED_QUARANTINE,
          seq: { intake: 66, grn: 566, movement: 5011, quarantine: 52 },
        }),
    }),
    { name: "buildpos-stock-intake-v1" },
  ),
);

export function blankLine(sku = ""): IntakeLine {
  const p = sku ? findProduct(sku) : undefined;
  return {
    key: Math.random().toString(36).slice(2, 10),
    sku,
    recvUom: p?.stockUom ?? "",
    recvQty: 0,
    acceptedQty: 0,
    damagedQty: 0,
    rejectedQty: 0,
    shortQty: 0,
    freeQty: 0,
    batchNo: "",
    serials: "",
    mfgDate: "",
    expiryDate: "",
    disposition: "Sellable Stock",
    damageCode: "",
    unitCost: p?.unitCost ?? 0,
    discountPct: 0,
    vatRate: p?.vatRate ?? 15,
    notes: "",
  };
}

export function blankIntake(id: string, grn: string, user: string): StockIntake {
  const now = new Date();
  return {
    id,
    grn,
    source: "Purchase Order Receipt",
    sourceRef: "",
    externalRef: "",
    sourceDate: now.toISOString().slice(0, 10),
    branch: BRANCHES[0],
    locationRef: "",
    receiptDate: now.toISOString().slice(0, 10),
    receiptTime: now.toTimeString().slice(0, 5),
    supplier: "",
    deliveryNote: "",
    invoiceNo: "",
    receivedBy: user,
    inspectionRequired: false,
    defaultDisposition: "Sellable Stock",
    reason: "",
    internalNotes: "",
    supplierNotes: "",
    approvalComments: "",
    attachments: [],
    lines: [],
    status: "Draft",
    createdBy: user,
    approvedBy: "",
    postedAt: null,
    createdAt: Date.now(),
    history: [],
  };
}