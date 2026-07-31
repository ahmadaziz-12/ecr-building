/**
 * Custom Material Pricing & Rate Engine (BRD §85).
 *
 * Everything that decides a customised selling rate lives here — the Rate Book, project
 * agreements, supplier special rates and the calculation itself. The UI never lets anyone type a
 * final price: it collects inputs, this module calculates, and maker-checker approval gates
 * anything that breaks a margin/threshold rule (§85.21).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";

// ————————————————————————— Reference lists —————————————————————————

export const MATERIAL_CATEGORIES = [
  "Cement & Binders", "Steel & Reinforcement", "Tiles & Stone", "Timber & Boards",
  "Paint & Coatings", "Pipes & Plumbing", "Electrical", "Aggregates & Sand",
  "Glass & Windows", "Insulation", "Waterproofing", "Landscaping",
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const PRICING_TYPES = [
  "Standard Customization", "Bulk Rate", "Project Rate", "Supplier Special Rate",
  "Fabrication Rate", "Cut-to-Size Rate", "Mixed Product Rate", "Negotiated Rate",
] as const;
export type PricingType = (typeof PRICING_TYPES)[number];

export const REQUEST_STATUSES = [
  "Draft", "Calculated", "Pending Approval", "Approved", "Rejected",
  "Quoted", "Converted to Sale", "Expired", "Cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const CUSTOMER_TYPES = ["Retail", "Trade", "Contractor", "B2B Company"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const PRICE_TIERS = ["Retail", "Trade", "Contractor", "Wholesale", "Project"] as const;

export const RATE_BOOK_CATEGORIES = [
  "Base Material Rates", "Cutting Rates", "Bending Rates", "Fabrication Rates",
  "Mixing and Tinting Rates", "Packaging Rates", "Loading and Handling Rates",
  "Delivery Rates", "Wastage Rates", "Minimum Order Charges", "Market Surcharges",
  "Urgent Order Charges", "Supplier Special Rates", "Project Customer Rates",
] as const;
export type RateBookCategory = (typeof RATE_BOOK_CATEGORIES)[number];

export const PRICING_BASES = [
  "Per Unit", "Per Bag", "Per Bar", "Per Bundle", "Per KG", "Per Ton", "Per Metre",
  "Per Square Metre", "Per Cubic Metre", "Per Sheet", "Per Tin", "Per Cut", "Per Bend",
  "Per Hole", "Per Weld", "Per Color Mix", "Per Pallet", "Fixed Charge",
  "Percentage of Material Value",
] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

export const SUPPLIER_RATE_STATUSES = [
  "Draft", "Sent", "Supplier Responded", "Under Review", "Approved", "Rejected", "Expired",
] as const;
export type SupplierRateStatus = (typeof SUPPLIER_RATE_STATUSES)[number];

export const RATE_SOURCES = [
  "Project Agreement Rate", "Customer Contract Rate", "Supplier Special Rate",
  "Customer Price Tier Rate", "Quantity Tier Rate", "Promotional Rate", "Standard Selling Rate",
] as const;
export type RateSource = (typeof RATE_SOURCES)[number];

export const VAT_RATE = 0.15;
export const MIN_MARGIN_PCT = 12;

// ————————————————————————— Entities —————————————————————————

export type RateBookEntry = {
  id: string;
  code: string;
  name: string;
  category: RateBookCategory;
  materialCategory: MaterialCategory | "";
  product?: string;
  brand?: string;
  supplier?: string;
  branch?: string;
  customerTier?: string;
  basis: PricingBasis;
  rate: number;
  rateUom: string;
  minCharge: number;
  maxCharge?: number;
  minQuantity?: number;
  maxQuantity?: number;
  effectiveFrom: string;
  effectiveTo: string;
  vatTreatment: "Standard 15%" | "Zero Rated" | "Exempt";
  approvalRequired: boolean;
  status: "Active" | "Inactive";
  notes?: string;
};

export type ProjectAgreementLine = { product: string; brand: string; rate: number; uom: string };

export type ProjectAgreement = {
  id: string;
  customer: string;
  projectCode: string;
  validFrom: string;
  validTo: string;
  minMonthlySpend: number;
  freeDeliveryAbove: number;
  approvedBrands: string[];
  lines: ProjectAgreementLine[];
  combinableWithCoupons: boolean;
  status: "Active" | "Expired" | "Draft";
  notes?: string;
};

export type SupplierSpecialRate = {
  id: string;
  supplier: string;
  materialCategory: MaterialCategory | "";
  product: string;
  brand: string;
  specification: string;
  quantity: number;
  purchaseUom: string;
  requiredDate: string;
  projectCode?: string;
  deliveryLocation?: string;
  requiredCertificate?: string;
  notes?: string;
  offeredRate?: number;
  rateUom?: string;
  minQuantity?: number;
  availableQuantity?: number;
  leadTimeDays?: number;
  deliveryTerms?: string;
  validTo?: string;
  certificateProvided?: string;
  supplierNotes?: string;
  supplierActive: boolean;
  status: SupplierRateStatus;
};

export type ServiceInputs = {
  cuts: number;
  bends: number;
  fabricationKg: number;
  fabricationRatePerKg: number;
  welds: number;
  weldRate: number;
  holes: number;
  holeRate: number;
  mixing: boolean;
  tintingTins: number;
  packaging: number;
  loading: number;
  handling: number;
  urgent: boolean;
  coating: number;
  edgeFinishing: number;
};

export const EMPTY_SERVICES: ServiceInputs = {
  cuts: 0, bends: 0, fabricationKg: 0, fabricationRatePerKg: 0, welds: 0, weldRate: 0,
  holes: 0, holeRate: 0, mixing: false, tintingTins: 0, packaging: 0, loading: 0,
  handling: 0, urgent: false, coating: 0, edgeFinishing: 0,
};

export type ApprovalStep = {
  level: number;
  assignment: "Role-Based" | "User-Based";
  role?: string;
  user?: string;
  status: "Pending" | "Approved" | "Rejected";
  decidedBy?: string;
  decidedAt?: number;
  comment?: string;
};

export type HistoryEntry = { at: number; by: string; event: string; detail?: string };

export type CustomRateRequest = {
  id: string;
  quotationId?: string;
  pricingType: PricingType;
  // Customer
  customer: string;
  customerType: CustomerType;
  priceTier: string;
  contractorAccount?: string;
  projectCode?: string;
  poReference?: string;
  creditStatus: "Good Standing" | "On Hold" | "Over Limit" | "Prepaid Only";
  preferredBrand?: string;
  deliveryRequired: boolean;
  // Material
  materialCategory: MaterialCategory | "";
  subcategory?: string;
  product: string;
  sku: string;
  brand: string;
  supplier?: string;
  baseSpecification: string;
  requestedSpecification: string;
  stockUom: string;
  sellingUom: string;
  // Quantity
  requestedQuantity: number;
  requestedUom: string;
  conversionFactor: number;
  wastagePct: number;
  roundingQty: number;
  // Services & commercials
  services: ServiceInputs;
  standardRate: number;
  costRate: number;
  minSellingRate: number;
  manualSupplierRate?: number;
  deliveryCharge: number;
  heavyDeliveryPct: number;
  marketSurchargePct: number;
  urgentSurcharge: number;
  minOrderValue: number;
  discountPct: number;
  validityDays: number;
  leadTime: string;
  // Outcome
  rateSource?: RateSource;
  previousRate?: number;
  calc?: CalcResult;
  status: RequestStatus;
  nonReturnable: boolean;
  customerAccepted: boolean;
  customerAcknowledgements: string[];
  approvals: ApprovalStep[];
  approvalReasons: string[];
  history: HistoryEntry[];
  createdBy: string;
  createdAt: number;
  colorCode?: string;
  dimensions?: string;
  drawingRef?: string;
  notes?: string;
};

export type CalcResult = {
  convertedQuantity: number;
  wastageQuantity: number;
  chargeableQuantity: number;
  effectiveBaseRate: number;
  rateSource: RateSource;
  materialAmount: number;
  wastageValue: number;
  cuttingCharge: number;
  bendingCharge: number;
  fabricationCharge: number;
  weldingCharge: number;
  drillingCharge: number;
  mixingCharge: number;
  tintingCharge: number;
  packagingCharge: number;
  otherServiceCharge: number;
  customizationCharges: number;
  loadingCharge: number;
  handlingCharge: number;
  deliveryCharge: number;
  heavyMaterialCharge: number;
  logisticsCharges: number;
  marketSurcharge: number;
  urgentSurcharge: number;
  minOrderDifference: number;
  surcharges: number;
  grossCustomPrice: number;
  discountAmount: number;
  netExVat: number;
  vat: number;
  finalTotal: number;
  finalUnitRate: number;
  costAmount: number;
  marginAmount: number;
  marginPct: number;
  validUntil: string;
};

// ————————————————————————— Helpers —————————————————————————

const money = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

export function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rateFor(rates: RateBookEntry[], code: string): RateBookEntry | undefined {
  return rates.find((r) => r.code === code && r.status === "Active");
}

/** Apply a rate-book minimum charge to a computed service amount. */
function withMin(amount: number, entry?: RateBookEntry) {
  if (!entry || amount <= 0) return amount;
  return Math.max(amount, entry.minCharge ?? 0);
}

/** §85.8 — pick the effective base rate in strict priority order. */
export function resolveEffectiveBaseRate(
  req: CustomRateRequest,
  rates: RateBookEntry[],
  agreements: ProjectAgreement[],
  supplierRates: SupplierSpecialRate[],
): { rate: number; source: RateSource; validity?: string; supplier?: string } {
  const now = today();
  // 1. Approved project agreement rate
  const agreement = agreements.find(
    (a) =>
      a.status === "Active" &&
      a.projectCode === req.projectCode &&
      a.customer === req.customer &&
      a.validFrom <= now &&
      a.validTo >= now,
  );
  const line = agreement?.lines.find((l) => l.product === req.product);
  if (agreement && line) return { rate: line.rate, source: "Project Agreement Rate", validity: agreement.validTo };

  // 2. Approved customer contract rate (rate book, Project Customer Rates scoped to customer tier)
  const contract = rates.find(
    (r) => r.status === "Active" && r.category === "Project Customer Rates" && r.product === req.product && r.customerTier === req.priceTier,
  );
  if (contract) return { rate: contract.rate, source: "Customer Contract Rate", validity: contract.effectiveTo };

  // 3. Active supplier special rate — never auto-selected when the supplier is ineligible.
  const supplierOffer = supplierRates.find(
    (s) =>
      s.status === "Approved" &&
      s.product === req.product &&
      s.supplierActive &&
      s.offeredRate != null &&
      (!s.validTo || s.validTo >= now) &&
      (!s.minQuantity || req.requestedQuantity >= s.minQuantity),
  );
  if (supplierOffer?.offeredRate != null) {
    const markup = 1.12; // business markup applied over supplier cost (§85.9)
    return { rate: money(supplierOffer.offeredRate * markup), source: "Supplier Special Rate", validity: supplierOffer.validTo, supplier: supplierOffer.supplier };
  }

  // 4. Customer price tier rate
  const tier = rates.find(
    (r) => r.status === "Active" && r.category === "Base Material Rates" && r.product === req.product && r.customerTier === req.priceTier,
  );
  if (tier) return { rate: tier.rate, source: "Customer Price Tier Rate", validity: tier.effectiveTo };

  // 5. Quantity tier rate
  const qtyTier = rates
    .filter(
      (r) =>
        r.status === "Active" &&
        r.category === "Base Material Rates" &&
        r.product === req.product &&
        (r.minQuantity ?? 0) > 0 &&
        req.requestedQuantity >= (r.minQuantity ?? Infinity),
    )
    .sort((a, b) => a.rate - b.rate)[0];
  if (qtyTier) return { rate: qtyTier.rate, source: "Quantity Tier Rate", validity: qtyTier.effectiveTo };

  // 6. Promotional rate
  const promo = rates.find((r) => r.status === "Active" && r.category === "Market Surcharges" && r.product === req.product);
  if (promo) return { rate: promo.rate, source: "Promotional Rate", validity: promo.effectiveTo };

  // 7. Standard selling rate
  return { rate: req.standardRate, source: "Standard Selling Rate" };
}

/** §85.7 — the full calculation. Never guesses: every component comes from an input or the book. */
export function calculateRate(
  req: CustomRateRequest,
  rates: RateBookEntry[],
  agreements: ProjectAgreement[],
  supplierRates: SupplierSpecialRate[],
): CalcResult {
  const base = req.manualSupplierRate
    ? { rate: money(req.manualSupplierRate * 1.12), source: "Supplier Special Rate" as RateSource }
    : resolveEffectiveBaseRate(req, rates, agreements, supplierRates);

  const convertedQuantity = money(req.requestedQuantity * (req.conversionFactor || 1));
  const wastageQuantity = money(convertedQuantity * (req.wastagePct / 100));
  const chargeableQuantity = money(convertedQuantity + wastageQuantity + (req.roundingQty || 0));

  const materialAmount = money(chargeableQuantity * base.rate);
  const wastageValue = money(wastageQuantity * base.rate);

  const s = req.services;
  const cutEntry = rateFor(rates, req.materialCategory === "Timber & Boards" ? "RATE-TIMBER-CUT" : req.materialCategory === "Glass & Windows" ? "RATE-GLASS-CUT" : "RATE-STEEL-CUT");
  const bendEntry = rateFor(rates, "RATE-STEEL-BEND");
  const tintEntry = rateFor(rates, "RATE-PAINT-TINT");

  const cuttingCharge = money(withMin(s.cuts * (cutEntry?.rate ?? 0), cutEntry));
  const bendingCharge = money(withMin(s.bends * (bendEntry?.rate ?? 0), bendEntry));
  const fabricationCharge = money(s.fabricationKg * s.fabricationRatePerKg);
  const weldingCharge = money(s.welds * s.weldRate);
  const drillingCharge = money(s.holes * s.holeRate);
  const mixingCharge = s.mixing ? money(chargeableQuantity * 0) : 0;
  const tintingCharge = money(withMin(s.tintingTins * (tintEntry?.rate ?? 0), tintEntry));
  const packagingCharge = money(s.packaging);
  const otherServiceCharge = money(s.coating + s.edgeFinishing);

  const customizationCharges = money(
    cuttingCharge + bendingCharge + fabricationCharge + weldingCharge + drillingCharge +
    mixingCharge + tintingCharge + packagingCharge + otherServiceCharge,
  );

  const heavyEntry = rateFor(rates, "RATE-DEL-HEAVY");
  const heavyPct = req.heavyDeliveryPct || 0;
  let heavyMaterialCharge = heavyPct > 0 ? money(materialAmount * (heavyPct / 100)) : 0;
  if (heavyMaterialCharge > 0 && heavyEntry) {
    heavyMaterialCharge = Math.min(Math.max(heavyMaterialCharge, heavyEntry.minCharge), heavyEntry.maxCharge ?? Infinity);
  }
  const logisticsCharges = money(s.loading + s.handling + req.deliveryCharge + heavyMaterialCharge);

  const marketSurcharge = money(materialAmount * (req.marketSurchargePct / 100));
  const urgentSurcharge = money(s.urgent ? req.urgentSurcharge : 0);
  const preMinTotal = materialAmount + customizationCharges + logisticsCharges + marketSurcharge + urgentSurcharge;
  const minOrderDifference = req.minOrderValue > 0 && preMinTotal < req.minOrderValue ? money(req.minOrderValue - preMinTotal) : 0;
  const surcharges = money(marketSurcharge + urgentSurcharge + minOrderDifference);

  const grossCustomPrice = money(materialAmount + customizationCharges + logisticsCharges + surcharges);
  const discountAmount = money(grossCustomPrice * (req.discountPct / 100));
  const netExVat = money(grossCustomPrice - discountAmount);
  const vat = money(netExVat * VAT_RATE);
  const finalTotal = money(netExVat + vat);
  const finalUnitRate = req.requestedQuantity > 0 ? money(netExVat / req.requestedQuantity) : 0;

  const costAmount = money(chargeableQuantity * req.costRate);
  const marginAmount = money(netExVat - costAmount - customizationCharges * 0.4);
  const marginPct = netExVat > 0 ? money((marginAmount / netExVat) * 100) : 0;

  return {
    convertedQuantity, wastageQuantity, chargeableQuantity,
    effectiveBaseRate: base.rate, rateSource: base.source,
    materialAmount, wastageValue,
    cuttingCharge, bendingCharge, fabricationCharge, weldingCharge, drillingCharge,
    mixingCharge, tintingCharge, packagingCharge, otherServiceCharge, customizationCharges,
    loadingCharge: money(s.loading), handlingCharge: money(s.handling),
    deliveryCharge: money(req.deliveryCharge), heavyMaterialCharge, logisticsCharges,
    marketSurcharge, urgentSurcharge, minOrderDifference, surcharges,
    grossCustomPrice, discountAmount, netExVat, vat, finalTotal, finalUnitRate,
    costAmount, marginAmount, marginPct,
    validUntil: addDays(req.validityDays || 7),
  };
}

/** §85.21 — which approval triggers a calculation has tripped. Empty list ⇒ no approval needed. */
export function approvalTriggers(req: CustomRateRequest, calc: CalcResult): string[] {
  const out: string[] = [];
  if (req.minSellingRate > 0 && calc.finalUnitRate < req.minSellingRate) out.push("Final rate is below the minimum selling rate");
  if (calc.marginPct < MIN_MARGIN_PCT) out.push(`Margin ${calc.marginPct}% is below the ${MIN_MARGIN_PCT}% minimum`);
  if (req.discountPct > 5) out.push("Discount exceeds the role threshold (5%)");
  if (req.manualSupplierRate != null) out.push("Supplier rate was entered manually");
  if (req.wastagePct < 2 && req.wastagePct >= 0 && calc.wastageQuantity === 0 && req.materialCategory === "Glass & Windows") out.push("Wastage set below the standard rate");
  if (req.materialCategory === "Steel & Reinforcement" && calc.fabricationCharge > 3000) out.push("Steel fabrication charge exceeds SAR 3,000");
  if (req.deliveryRequired && req.deliveryCharge === 0 && calc.heavyMaterialCharge === 0) out.push("Delivery charge was waived");
  if (req.marketSurchargePct === 0 && req.pricingType === "Negotiated Rate") out.push("Market surcharge was overridden");
  if (req.validityDays > 30) out.push("Rate validity exceeds the configured 30 days");
  if (calc.finalTotal > 50_000) out.push("Total custom order exceeds the SAR 50,000 threshold");
  if (calc.rateSource !== "Project Agreement Rate" && req.projectCode) out.push("Project agreement was overridden");
  return out;
}

export function defaultApprovalChain(reasons: string[]): ApprovalStep[] {
  const chain: ApprovalStep[] = [
    { level: 1, assignment: "Role-Based", role: "Finance Manager", status: "Pending" },
  ];
  if (reasons.some((r) => r.includes("fabrication") || r.includes("Delivery"))) {
    chain.push({ level: 2, assignment: "Role-Based", role: "Store Manager", status: "Pending" });
  }
  return chain;
}

/** Categories whose customisation makes the finished item non-returnable (§85.22 rule 3). */
export function isNonReturnable(req: CustomRateRequest): boolean {
  const s = req.services;
  return s.cuts > 0 || s.bends > 0 || s.fabricationKg > 0 || s.tintingTins > 0 || s.welds > 0 || s.holes > 0;
}

// ————————————————————————— Seed data (§85.4, §85.18) —————————————————————————

const seedRates: RateBookEntry[] = [
  {
    id: "RATE-001", code: "RATE-CEM-PALLET", name: "Cement Pallet Bulk Rate", category: "Base Material Rates",
    materialCategory: "Cement & Binders", product: "Ordinary Portland Cement 50KG", brand: "Al Binaa Cement",
    basis: "Per Bag", rate: 17, rateUom: "Bag", minCharge: 0, minQuantity: 50,
    effectiveFrom: "2026-07-01", effectiveTo: "2026-09-30", vatTreatment: "Standard 15%",
    approvalRequired: false, status: "Active", notes: "Standard retail rate SAR 18.00 per bag.",
  },
  {
    id: "RATE-002", code: "RATE-STEEL-CUT", name: "Steel Rebar Cutting Charge", category: "Cutting Rates",
    materialCategory: "Steel & Reinforcement", basis: "Per Cut", rate: 2.5, rateUom: "Cut", minCharge: 20,
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", vatTreatment: "Standard 15%",
    approvalRequired: false, status: "Active",
  },
  {
    id: "RATE-003", code: "RATE-STEEL-BEND", name: "Rebar Bending Charge", category: "Bending Rates",
    materialCategory: "Steel & Reinforcement", basis: "Per Bend", rate: 1.75, rateUom: "Bend", minCharge: 25,
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", vatTreatment: "Standard 15%",
    approvalRequired: false, status: "Active",
  },
  {
    id: "RATE-004", code: "RATE-GLASS-CUT", name: "Glass Cut-to-Size Service", category: "Cutting Rates",
    materialCategory: "Glass & Windows", basis: "Per Square Metre", rate: 18, rateUom: "m²", minCharge: 30,
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", vatTreatment: "Standard 15%",
    approvalRequired: false, status: "Active",
  },
  {
    id: "RATE-005", code: "RATE-PAINT-TINT", name: "Custom Paint Tinting", category: "Mixing and Tinting Rates",
    materialCategory: "Paint & Coatings", basis: "Per Tin", rate: 15, rateUom: "Tin", minCharge: 15,
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", vatTreatment: "Standard 15%",
    approvalRequired: false, status: "Active", notes: "Non-returnable after tinting.",
  },
  {
    id: "RATE-006", code: "RATE-TIMBER-CUT", name: "Timber Cutting Charge", category: "Cutting Rates",
    materialCategory: "Timber & Boards", basis: "Per Cut", rate: 3, rateUom: "Cut", minCharge: 15,
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", vatTreatment: "Standard 15%",
    approvalRequired: false, status: "Active",
  },
  {
    id: "RATE-007", code: "RATE-DEL-HEAVY", name: "Heavy Material Delivery Fee", category: "Delivery Rates",
    materialCategory: "", basis: "Percentage of Material Value", rate: 2.5, rateUom: "% of material value",
    minCharge: 250, maxCharge: 1500, effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31",
    vatTreatment: "Standard 15%", approvalRequired: false, status: "Active",
    notes: "Applies to Cement, Steel, Aggregates, Tiles, Landscaping.",
  },
  {
    id: "RATE-008", code: "RATE-LOAD-STD", name: "Loading & Handling — Standard", category: "Loading and Handling Rates",
    materialCategory: "", basis: "Fixed Charge", rate: 150, rateUom: "Order", minCharge: 150,
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", vatTreatment: "Standard 15%",
    approvalRequired: false, status: "Active",
  },
  {
    id: "RATE-009", code: "RATE-URGENT", name: "Urgent Same-Day Order Charge", category: "Urgent Order Charges",
    materialCategory: "", basis: "Fixed Charge", rate: 100, rateUom: "Order", minCharge: 100,
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", vatTreatment: "Standard 15%",
    approvalRequired: true, status: "Active",
  },
  {
    id: "RATE-010", code: "RATE-WASTE-GLASS", name: "Glass Wastage Allowance", category: "Wastage Rates",
    materialCategory: "Glass & Windows", basis: "Percentage of Material Value", rate: 8, rateUom: "%",
    minCharge: 0, effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", vatTreatment: "Standard 15%",
    approvalRequired: false, status: "Active",
  },
];

const seedAgreements: ProjectAgreement[] = [
  {
    id: "PRA-2026-0001", customer: "Modern Villas Establishment", projectCode: "PRJ-RYD-245",
    validFrom: "2026-08-01", validTo: "2026-10-31", minMonthlySpend: 50_000, freeDeliveryAbove: 10_000,
    approvedBrands: ["Al Binaa Cement", "Al Falah Steel", "Saudi Ceramics"],
    lines: [
      { product: "OPC Cement 50KG", brand: "Al Binaa Cement", rate: 16.8, uom: "Bag" },
      { product: "Steel Rebar 12MM", brand: "Al Falah Steel", rate: 13.2, uom: "Bar" },
      { product: "Grey Porcelain Tile", brand: "Saudi Ceramics", rate: 56, uom: "Box" },
      { product: "UPVC Pipe 2 Inch", brand: "Gulf Pipes", rate: 21.5, uom: "Piece" },
    ],
    combinableWithCoupons: false, status: "Active",
    notes: "Below project rate requires manager approval. Expired agreement falls back to Trade price.",
  },
  {
    id: "PRA-2026-0002", customer: "Al Noor Contracting Company", projectCode: "PRJ-RYD-221",
    validFrom: "2026-06-01", validTo: "2026-12-31", minMonthlySpend: 80_000, freeDeliveryAbove: 15_000,
    approvedBrands: ["Najd Cement"],
    lines: [{ product: "Sulphate-Resistant Cement 50KG", brand: "Najd Cement", rate: 19.1, uom: "Bag" }],
    combinableWithCoupons: false, status: "Active",
  },
];

const seedSupplierRates: SupplierSpecialRate[] = [
  {
    id: "SSR-2026-0001", supplier: "Najd Cement Distribution", materialCategory: "Cement & Binders",
    product: "Sulphate-Resistant Cement 50KG", brand: "Najd Cement", specification: "SRC 50KG bag, pallet of 100",
    quantity: 500, purchaseUom: "Bag", requiredDate: "2026-08-10", projectCode: "PRJ-RYD-221",
    deliveryLocation: "Riyadh — Site Gate 2", requiredCertificate: "SASO Conformity",
    offeredRate: 17.4, rateUom: "Bag", minQuantity: 300, availableQuantity: 4000, leadTimeDays: 3,
    deliveryTerms: "Delivered to site", validTo: "2026-09-30", certificateProvided: "SASO Conformity",
    supplierActive: true, status: "Approved",
  },
  {
    id: "SSR-2026-0002", supplier: "Gulf Steel Trading", materialCategory: "Steel & Reinforcement",
    product: "Steel Hollow Section 50×50MM", brand: "Gulf Steel", specification: "2mm wall, 6m lengths",
    quantity: 4000, purchaseUom: "KG", requiredDate: "2026-08-20",
    offeredRate: 5.1, rateUom: "KG", minQuantity: 1000, availableQuantity: 12_000, leadTimeDays: 7,
    deliveryTerms: "Ex-works", validTo: "2026-08-31", supplierActive: true, status: "Supplier Responded",
  },
  {
    id: "SSR-2026-0003", supplier: "Eastern Glass Works", materialCategory: "Glass & Windows",
    product: "Clear Glass 8MM", brand: "EGW", specification: "8mm float, jumbo sheets",
    quantity: 60, purchaseUom: "m²", requiredDate: "2026-08-14", supplierActive: false, status: "Sent",
  },
  {
    id: "SSR-2026-0004", supplier: "Al Rajhi Building Supply", materialCategory: "Aggregates & Sand",
    product: "Washed Sand", brand: "—", specification: "Washed, screened",
    quantity: 20, purchaseUom: "Ton", requiredDate: "2026-08-05",
    offeredRate: 78, rateUom: "Ton", minQuantity: 10, availableQuantity: 500, leadTimeDays: 2,
    validTo: "2026-08-31", supplierActive: true, status: "Under Review",
  },
];

function baseRequest(partial: Partial<CustomRateRequest>, seq: number): CustomRateRequest {
  return {
    id: `CPR-2026-${String(seq).padStart(4, "0")}`,
    pricingType: "Standard Customization",
    customer: "", customerType: "Retail", priceTier: "Retail",
    creditStatus: "Good Standing", deliveryRequired: false,
    materialCategory: "", product: "", sku: "", brand: "",
    baseSpecification: "", requestedSpecification: "",
    stockUom: "Piece", sellingUom: "Piece",
    requestedQuantity: 0, requestedUom: "Piece", conversionFactor: 1,
    wastagePct: 0, roundingQty: 0,
    services: { ...EMPTY_SERVICES },
    standardRate: 0, costRate: 0, minSellingRate: 0,
    deliveryCharge: 0, heavyDeliveryPct: 0, marketSurchargePct: 0, urgentSurcharge: 100,
    minOrderValue: 0, discountPct: 0, validityDays: 7, leadTime: "3 days",
    status: "Draft", nonReturnable: false, customerAccepted: false,
    customerAcknowledgements: [], approvals: [], approvalReasons: [], history: [],
    createdBy: "Pricing Officer", createdAt: Date.now(),
    ...partial,
  };
}

function seedRequests(): CustomRateRequest[] {
  const list: CustomRateRequest[] = [
    baseRequest({
      pricingType: "Project Rate", customer: "Al Noor Contracting Company", customerType: "Contractor",
      priceTier: "Project", contractorAccount: "CON-0042", projectCode: "PRJ-RYD-221", poReference: "PO-2026-8841",
      materialCategory: "Cement & Binders", product: "Sulphate-Resistant Cement 50KG", sku: "CEM-SRC-50KG",
      brand: "Najd Cement", supplier: "Najd Cement Distribution",
      baseSpecification: "OPC 50KG", requestedSpecification: "Sulphate-resistant grade, 5 pallets",
      stockUom: "Bag", sellingUom: "Bag", requestedQuantity: 500, requestedUom: "Bag", conversionFactor: 1,
      standardRate: 20.5, costRate: 17.4, minSellingRate: 18, deliveryRequired: true, deliveryCharge: 350,
      discountPct: 2, validityDays: 7, leadTime: "3 days", services: { ...EMPTY_SERVICES },
      status: "Approved", quotationId: "CQT-2026-0001", customerAccepted: true,
    }, 1),
    baseRequest({
      pricingType: "Cut-to-Size Rate", customer: "Riyadh Interiors", customerType: "Trade", priceTier: "Trade",
      materialCategory: "Steel & Reinforcement", product: "Al Falah Steel Rebar 12MM × 12M", sku: "STEEL-RBR-12MM",
      brand: "Al Falah Steel", baseSpecification: "12mm × 12m bar", requestedSpecification: "200 pieces cut to 6M",
      stockUom: "Bar", sellingUom: "Piece", requestedQuantity: 100, requestedUom: "Bar", conversionFactor: 1,
      standardRate: 14.5, costRate: 11.6, minSellingRate: 12,
      services: { ...EMPTY_SERVICES, cuts: 100, packaging: 40 },
      status: "Quoted", quotationId: "CQT-2026-0002", nonReturnable: true,
    }, 2),
    baseRequest({
      pricingType: "Fabrication Rate", customer: "Modern Villas Establishment", customerType: "Contractor",
      priceTier: "Project", projectCode: "PRJ-RYD-245", materialCategory: "Steel & Reinforcement",
      product: "Steel Rebar 10MM", sku: "STEEL-RBR-10MM", brand: "Al Falah Steel",
      baseSpecification: "10mm rebar coil", requestedSpecification: "500 fabricated stirrups",
      stockUom: "KG", sellingUom: "Stirrup", requestedQuantity: 1250, requestedUom: "KG", conversionFactor: 1,
      wastagePct: 3, standardRate: 3.2, costRate: 2.55, minSellingRate: 2.9,
      services: { ...EMPTY_SERVICES, cuts: 500, bends: 2000, packaging: 150 },
      discountPct: 5, status: "Pending Approval", nonReturnable: true,
    }, 3),
    baseRequest({
      pricingType: "Standard Customization", customer: "Jeddah Glass Studio", customerType: "B2B Company",
      priceTier: "Wholesale", materialCategory: "Glass & Windows", product: "Clear Glass 8MM", sku: "GLS-CLR-8MM",
      brand: "EGW", baseSpecification: "8mm float sheet", requestedSpecification: "10 panels 2.4M × 1.2M",
      stockUom: "m²", sellingUom: "Panel", requestedQuantity: 28.8, requestedUom: "m²", conversionFactor: 1,
      wastagePct: 8, standardRate: 95, costRate: 71, minSellingRate: 80,
      services: { ...EMPTY_SERVICES, cuts: 0, packaging: 180, edgeFinishing: 250 },
      dimensions: "2.4M × 1.2M × 10 panels", status: "Calculated", nonReturnable: true,
    }, 4),
    baseRequest({
      pricingType: "Mixed Product Rate", customer: "Walk-in — Ahmed Salem", customerType: "Retail", priceTier: "Retail",
      materialCategory: "Paint & Coatings", product: "Exterior Paint 20L", sku: "PNT-EXT-20L", brand: "ColorPro",
      baseSpecification: "Base white 20L", requestedSpecification: "Custom tint CP-RAL-7016, same-day",
      stockUom: "Tin", sellingUom: "Tin", requestedQuantity: 10, requestedUom: "Tin", conversionFactor: 1,
      standardRate: 150, costRate: 118, minSellingRate: 130, colorCode: "CP-RAL-7016",
      services: { ...EMPTY_SERVICES, tintingTins: 10, coating: 120, urgent: true },
      status: "Converted to Sale", quotationId: "CQT-2026-0003", nonReturnable: true, customerAccepted: true,
    }, 5),
    baseRequest({
      pricingType: "Bulk Rate", customer: "Dammam Landscaping LLC", customerType: "Contractor", priceTier: "Contractor",
      materialCategory: "Aggregates & Sand", product: "Washed Sand", sku: "AGG-SND-WSH", brand: "—",
      baseSpecification: "Bulk washed sand", requestedSpecification: "12 m³ delivered by tipper",
      stockUom: "Ton", sellingUom: "Cubic Metre", requestedQuantity: 12, requestedUom: "Cubic Metre",
      conversionFactor: 1.6, standardRate: 110, costRate: 78, minSellingRate: 92,
      deliveryRequired: true, deliveryCharge: 450,
      services: { ...EMPTY_SERVICES, loading: 150 },
      status: "Calculated",
    }, 6),
  ];
  return list.map((r) => {
    const calc = calculateRate(r, seedRates, seedAgreements, seedSupplierRates);
    const reasons = approvalTriggers(r, calc);
    return {
      ...r,
      calc,
      rateSource: calc.rateSource,
      approvalReasons: r.status === "Draft" ? [] : reasons,
      approvals: r.status === "Pending Approval" ? defaultApprovalChain(reasons) : r.approvals,
      nonReturnable: r.nonReturnable || isNonReturnable(r),
      history: [{ at: Date.now(), by: r.createdBy, event: "CUSTOM_RATE_CALCULATED", detail: calc.rateSource }],
    };
  });
}

// ————————————————————————— Store —————————————————————————

type State = {
  rates: RateBookEntry[];
  agreements: ProjectAgreement[];
  supplierRates: SupplierSpecialRate[];
  requests: CustomRateRequest[];
  currentUser: string;
  addRate: (r: Omit<RateBookEntry, "id">) => string;
  updateRate: (id: string, patch: Partial<RateBookEntry>) => void;
  removeRate: (id: string) => void;
  addAgreement: (a: Omit<ProjectAgreement, "id">) => string;
  updateAgreement: (id: string, patch: Partial<ProjectAgreement>) => void;
  addSupplierRate: (s: Omit<SupplierSpecialRate, "id">) => string;
  updateSupplierRate: (id: string, patch: Partial<SupplierSpecialRate>) => void;
  createRequest: (r: Partial<CustomRateRequest>) => string;
  updateRequest: (id: string, patch: Partial<CustomRateRequest>) => void;
  recalculate: (id: string) => CalcResult | undefined;
  submitForApproval: (id: string) => void;
  decide: (id: string, level: number, approve: boolean, by: string, comment?: string) => string | null;
  generateQuotation: (id: string) => void;
  acceptQuotation: (id: string, acknowledgements: string[]) => void;
  convertToSale: (id: string) => void;
  expireQuotation: (id: string) => void;
};

function audit(event: string, recordId: string, detail?: string, severity: "info" | "warning" | "critical" = "info") {
  useAuditStore.getState().log({
    module: "system", event, recordId, user: "Pricing Officer", newValue: detail, severity,
  });
}

let cprSeq = 100;
let cqtSeq = 100;

export const useCustomPricingStore = create<State>()(
  persist(
    (set, get) => ({
      rates: seedRates,
      agreements: seedAgreements,
      supplierRates: seedSupplierRates,
      requests: seedRequests(),
      currentUser: "Pricing Officer",

      addRate: (r) => {
        const id = `RATE-${String(get().rates.length + 1).padStart(3, "0")}`;
        set((s) => ({ rates: [{ ...r, id }, ...s.rates] }));
        audit("CUSTOM_RATE_UPDATED", id, `Rate book entry ${r.code} created`);
        return id;
      },
      updateRate: (id, patch) => {
        set((s) => ({ rates: s.rates.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
        audit("CUSTOM_RATE_UPDATED", id, "Rate book entry updated");
      },
      removeRate: (id) => set((s) => ({ rates: s.rates.filter((r) => r.id !== id) })),

      addAgreement: (a) => {
        const id = `PRA-2026-${String(get().agreements.length + 1).padStart(4, "0")}`;
        set((s) => ({ agreements: [{ ...a, id }, ...s.agreements] }));
        audit("PROJECT_RATE_CREATED", id, `${a.customer} · ${a.projectCode}`);
        return id;
      },
      updateAgreement: (id, patch) => {
        set((s) => ({ agreements: s.agreements.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
        audit(patch.status === "Expired" ? "PROJECT_RATE_EXPIRED" : "PROJECT_RATE_UPDATED", id);
      },

      addSupplierRate: (r) => {
        const id = `SSR-2026-${String(get().supplierRates.length + 1).padStart(4, "0")}`;
        set((s) => ({ supplierRates: [{ ...r, id }, ...s.supplierRates] }));
        audit("SUPPLIER_RATE_REQUESTED", id, `${r.supplier} · ${r.product}`);
        return id;
      },
      updateSupplierRate: (id, patch) => {
        set((s) => ({ supplierRates: s.supplierRates.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
        if (patch.offeredRate != null) audit("SUPPLIER_RATE_RECEIVED", id, `Offered SAR ${patch.offeredRate}`);
      },

      createRequest: (partial) => {
        cprSeq += 1;
        const id = `CPR-2026-${String(cprSeq).padStart(4, "0")}`;
        const req = { ...baseRequest(partial, 0), id, createdAt: Date.now() };
        req.nonReturnable = req.nonReturnable || isNonReturnable(req);
        req.history = [{ at: Date.now(), by: req.createdBy, event: "CUSTOM_RATE_REQUEST_CREATED" }];
        set((s) => ({ requests: [req, ...s.requests] }));
        audit("CUSTOM_RATE_REQUEST_CREATED", id, `${req.customer} · ${req.product}`);
        return id;
      },

      updateRequest: (id, patch) =>
        set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),

      recalculate: (id) => {
        const state = get();
        const req = state.requests.find((r) => r.id === id);
        if (!req) return undefined;
        const calc = calculateRate(req, state.rates, state.agreements, state.supplierRates);
        const reasons = approvalTriggers(req, calc);
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? {
                  ...r, calc, rateSource: calc.rateSource, previousRate: r.calc?.finalUnitRate,
                  approvalReasons: reasons, nonReturnable: r.nonReturnable || isNonReturnable(r),
                  status: r.status === "Draft" ? "Calculated" : r.status,
                  history: [...r.history, { at: Date.now(), by: s.currentUser, event: "CUSTOM_RATE_CALCULATED", detail: `${calc.rateSource} · SAR ${fmt(calc.finalTotal)}` }],
                }
              : r,
          ),
        }));
        audit("CUSTOM_RATE_CALCULATED", id, `${calc.rateSource} · SAR ${fmt(calc.finalTotal)}`);
        return calc;
      },

      submitForApproval: (id) => {
        const req = get().requests.find((r) => r.id === id);
        if (!req?.calc) return;
        const reasons = approvalTriggers(req, req.calc);
        const chain = reasons.length ? defaultApprovalChain(reasons) : [];
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? {
                  ...r, approvalReasons: reasons, approvals: chain,
                  status: reasons.length ? "Pending Approval" : "Approved",
                  history: [...r.history, { at: Date.now(), by: s.currentUser, event: reasons.length ? "CUSTOM_RATE_SUBMITTED" : "CUSTOM_RATE_APPROVED", detail: reasons.join("; ") }],
                }
              : r,
          ),
        }));
        audit("CUSTOM_RATE_SUBMITTED", id, reasons.join("; ") || "No approval triggers — auto approved", reasons.length ? "warning" : "info");
        if (reasons.length) audit("CUSTOM_RATE_APPROVAL_ASSIGNED", id, chain.map((c) => `L${c.level} ${c.role}`).join(", "));
      },

      decide: (id, level, approve, by, comment) => {
        const req = get().requests.find((r) => r.id === id);
        if (!req) return "Request not found.";
        if (by === req.createdBy) return "The maker cannot approve their own rate.";
        const prior = req.approvals.filter((a) => a.level < level);
        if (prior.some((a) => a.status !== "Approved")) return "Earlier approval levels are still pending.";
        const approvals = req.approvals.map((a) =>
          a.level === level ? { ...a, status: (approve ? "Approved" : "Rejected") as ApprovalStep["status"], decidedBy: by, decidedAt: Date.now(), comment } : a,
        );
        const allApproved = approvals.every((a) => a.status === "Approved");
        const rejected = approvals.some((a) => a.status === "Rejected");
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? {
                  ...r, approvals,
                  status: rejected ? "Rejected" : allApproved ? "Approved" : "Pending Approval",
                  history: [...r.history, { at: Date.now(), by, event: approve ? "CUSTOM_RATE_APPROVED" : "CUSTOM_RATE_REJECTED", detail: comment }],
                }
              : r,
          ),
        }));
        audit(approve ? "CUSTOM_RATE_APPROVED" : "CUSTOM_RATE_REJECTED", id, `${by} · level ${level}`, approve ? "info" : "warning");
        return null;
      },

      generateQuotation: (id) => {
        cqtSeq += 1;
        const quotationId = `CQT-2026-${String(cqtSeq).padStart(4, "0")}`;
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? { ...r, quotationId, status: "Quoted", history: [...r.history, { at: Date.now(), by: s.currentUser, event: "CUSTOM_QUOTATION_CREATED", detail: quotationId }] }
              : r,
          ),
        }));
        audit("CUSTOM_QUOTATION_CREATED", quotationId);
        audit("CUSTOM_QUOTATION_SENT", quotationId);
      },

      acceptQuotation: (id, acknowledgements) => {
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? { ...r, customerAccepted: true, customerAcknowledgements: acknowledgements, history: [...r.history, { at: Date.now(), by: r.customer, event: "CUSTOM_QUOTATION_ACCEPTED" }] }
              : r,
          ),
        }));
        audit("CUSTOMIZATION_CONFIRMED", id, acknowledgements.join(", "));
        audit("CUSTOM_QUOTATION_ACCEPTED", id);
      },

      convertToSale: (id) => {
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === id
              ? { ...r, status: "Converted to Sale", history: [...r.history, { at: Date.now(), by: s.currentUser, event: "CUSTOM_QUOTATION_CONVERTED", detail: "Stock deducted in stock UOM; instruction sheet generated" }] }
              : r,
          ),
        }));
        const req = get().requests.find((r) => r.id === id);
        audit("CUSTOM_QUOTATION_CONVERTED", id, `Stock deducted in ${req?.stockUom}`);
        if (req?.nonReturnable) audit("CUSTOM_PRODUCT_MARKED_NON_RETURNABLE", id, req.product, "warning");
      },

      expireQuotation: (id) => {
        set((s) => ({ requests: s.requests.map((r) => (r.id === id ? { ...r, status: "Expired" } : r)) }));
        audit("CUSTOM_RATE_UPDATED", id, "Quotation expired", "warning");
      },
    }),
    { name: "buildpos-custom-pricing-v1" },
  ),
);

export const CUSTOM_PRICING_AUDIT_EVENTS = [
  "CUSTOM_RATE_REQUEST_CREATED", "CUSTOM_RATE_CALCULATED", "CUSTOM_RATE_UPDATED",
  "SUPPLIER_RATE_REQUESTED", "SUPPLIER_RATE_RECEIVED", "CUSTOM_RATE_SUBMITTED",
  "CUSTOM_RATE_APPROVAL_ASSIGNED", "CUSTOM_RATE_APPROVED", "CUSTOM_RATE_REJECTED",
  "CUSTOM_RATE_OVERRIDDEN", "CUSTOM_QUOTATION_CREATED", "CUSTOM_QUOTATION_SENT",
  "CUSTOM_QUOTATION_ACCEPTED", "CUSTOM_QUOTATION_CONVERTED", "PROJECT_RATE_CREATED",
  "PROJECT_RATE_UPDATED", "PROJECT_RATE_EXPIRED", "CUSTOMIZATION_CONFIRMED",
  "CUSTOM_PRODUCT_MARKED_NON_RETURNABLE",
];