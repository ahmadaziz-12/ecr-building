/**
 * BRD §80 — Customer & Vendor perspectives.
 *
 * Hierarchy: Category → Subcategory → Brand → Product Family → Variant → SKU →
 * Supplier Offer → Branch Stock. Brand and Supplier are deliberately SEPARATE
 * entities: the same brand may be offered by several suppliers (each with its own
 * cost, MOQ, lead time and payment terms), and one supplier may carry several
 * brands across several categories.
 *
 * Everything here is persisted to localStorage so the full §80.21 demo scenario
 * survives a refresh without any code edits.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

/* ------------------------------------------------------------------ types */

export type BrandStatus = "Active" | "Inactive";

export type Brand = {
  id: string;
  nameEn: string;
  nameAr?: string;
  code: string;
  logoUrl?: string;
  manufacturer: string;
  country: string;
  categories: string[];
  description?: string;
  website?: string;
  warranty?: string;
  certification?: string;
  preferred: boolean;
  status: BrandStatus;
};

export type SupplierBrandMap = {
  id: string;
  supplier: string;
  category: string;
  subcategory?: string;
  brand: string;
  authorizedDistributor: boolean;
  supplierProductCode?: string;
  leadTimeDays: number;
  moq: number;
  purchaseUom: string;
  currency: string;
  standardCost: number;
  lastCost: number;
  discountPct: number;
  deliveryTerms: string;
  paymentTerms: string;
  certificateRequired: boolean;
  agreementStart: string;
  agreementEnd: string;
  preferred: boolean;
  status: "Active" | "Inactive";
};

export type BranchStock = { branch: string; onHand: number; reserved: number };

export type CatalogSku = {
  sku: string;
  barcode: string;
  brand: string;
  category: string;
  subcategory: string;
  family: string;
  nameEn: string;
  nameAr?: string;
  attributes: Record<string, string>;
  weightKg: number;
  stockUom: string;
  sellUoms: string[];
  conversions: Record<string, number>;
  retailPrice: number;
  tradePrice: number;
  bulkUom?: string;
  bulkPrice?: number;
  vatRate: number;
  stock: BranchStock[];
  deliveryNote: string;
  warranty: string;
  returnPolicy: string;
  loyaltyClass: string;
  imageKey?: string;
  status: "Active" | "Inactive";
};

export type SupplierOffer = {
  id: string;
  supplier: string;
  sku: string;
  purchaseCost: number;
  moq: number;
  leadTimeDays: number;
  availableQty: number;
  paymentTerms: string;
  fillRatePct: number;
  preferred: boolean;
  certificateExpiry?: string;
  status: "Active" | "Inactive";
};

export type CustomerPreference = {
  customer: string;
  projectRestricted: boolean;
  approvedBrands: string[];
  preferredBrands: Record<string, string>; // category -> brand
  preferredGrade?: string;
  preferredCountry?: string;
  reason?: string;
  history: string[];
};

export type VendorProposalStatus =
  | "Draft" | "Submitted" | "Under Review" | "Approved"
  | "SKU Creation Required" | "Active" | "Rejected" | "More Information Required";

export type VendorProposal = {
  id: string;
  supplier: string;
  category: string;
  subcategory: string;
  brand: string;
  supplierProductCode: string;
  nameEn: string;
  nameAr?: string;
  specification: string;
  purchaseUom: string;
  sellUomRecommendation: string;
  standardCost: number;
  moq: number;
  leadTimeDays: number;
  availableQty: number;
  country: string;
  vatRate: number;
  notes?: string;
  hasImage: boolean;
  hasDatasheet: boolean;
  hasCertificate: boolean;
  status: VendorProposalStatus;
  createdAt: number;
};

export type PriceSubmission = {
  id: string;
  supplier: string;
  sku: string;
  currentCost: number;
  proposedCost: number;
  effectiveFrom: string;
  reason: string;
  status: "Submitted" | "Approved" | "Rejected";
  createdAt: number;
};

export type VendorPo = {
  id: string;
  supplier: string;
  sku: string;
  brand: string;
  qty: number;
  uom: string;
  cost: number;
  status: "Awaiting Confirmation" | "Confirmed" | "Partially Confirmed" | "Delivered" | "Approved";
  confirmedQty?: number;
  expectedDelivery?: string;
  deliveryNoteRef?: string;
  createdAt: number;
};

export type BrandAuditEvent = {
  id: string;
  event: string;
  category?: string;
  brand?: string;
  product?: string;
  sku?: string;
  supplier?: string;
  customer?: string;
  user: string;
  branch?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  approval?: string;
  severity: "info" | "warning" | "critical";
  ts: number;
};

/* ------------------------------------------------------------- seed data */

export const BRANCH_LIST = ["Riyadh Main Branch", "Jeddah Branch", "Dammam Branch"];

export const CATEGORY_TREE: Record<string, string[]> = {
  "Steel & Reinforcement": ["Rebar", "Steel Mesh", "Hollow Section", "Angle Iron", "Flat Bar", "Steel Plate"],
  "Cement & Binders": ["Ordinary Portland Cement", "White Cement", "Rapid-Set Cement", "Sulphate-Resistant Cement", "Adhesive Mortar", "Grout"],
};

export const ATTRIBUTE_FILTERS: Record<string, Record<string, string[]>> = {
  "Steel & Reinforcement": {
    Diameter: ["8MM", "10MM", "12MM", "16MM", "20MM", "25MM"],
    Length: ["6M", "9M", "12M"],
    Grade: ["Grade 40", "Grade 60"],
  },
  "Cement & Binders": {
    "Bag Weight": ["25KG", "40KG", "50KG"],
  },
};

const SEED_BRANDS: Brand[] = [
  {
    id: "BRD-STEEL-001", nameEn: "Al Falah Steel", nameAr: "حديد الفلاح", code: "AFS",
    manufacturer: "Al Falah Industrial Manufacturing", country: "Saudi Arabia",
    categories: ["Steel & Reinforcement", "Hardware & Fasteners"],
    certification: "Grade 60 Compliance Certificate", warranty: "Mill certificate with every bundle",
    website: "alfalahsteel.sa", preferred: true, status: "Active",
    description: "Local Grade 60 reinforcement bar producer.",
  },
  {
    id: "BRD-STEEL-002", nameEn: "Gulf Reinforcement", nameAr: "تسليح الخليج", code: "GRS",
    manufacturer: "Gulf Reinforcement Industries", country: "Saudi Arabia",
    categories: ["Steel & Reinforcement"], certification: "SASO Grade 60 Certificate",
    warranty: "Mill certificate on request", preferred: false, status: "Active",
  },
  {
    id: "BRD-STEEL-003", nameEn: "Najd Steelworks", nameAr: "أعمال نجد للحديد", code: "NSW",
    manufacturer: "Najd Steelworks Co.", country: "Saudi Arabia",
    categories: ["Steel & Reinforcement"], certification: "Grade 60 Test Report",
    warranty: "Batch test report", preferred: false, status: "Active",
  },
  {
    id: "BRD-STEEL-004", nameEn: "Eastern Metals", nameAr: "معادن الشرق", code: "EMT",
    manufacturer: "Eastern Metals Rolling Mills", country: "United Arab Emirates",
    categories: ["Steel & Reinforcement"], certification: "Grade 40 Test Report",
    warranty: "Batch test report", preferred: false, status: "Active",
  },
  {
    id: "BRD-CEM-001", nameEn: "Al Binaa Cement", nameAr: "أسمنت البناء", code: "ABC",
    manufacturer: "Al Binaa Cement Company", country: "Saudi Arabia",
    categories: ["Cement & Binders"], certification: "SASO OPC Type I",
    warranty: "90-day shelf guarantee", preferred: true, status: "Active",
  },
  {
    id: "BRD-CEM-002", nameEn: "Desert Portland", nameAr: "بورتلاند الصحراء", code: "DPC",
    manufacturer: "Desert Portland Industries", country: "Saudi Arabia",
    categories: ["Cement & Binders"], certification: "SASO OPC Type I",
    warranty: "90-day shelf guarantee", preferred: false, status: "Active",
  },
  {
    id: "BRD-CEM-003", nameEn: "Najd Cement", nameAr: "أسمنت نجد", code: "NJC",
    manufacturer: "Najd Cement Company", country: "Saudi Arabia",
    categories: ["Cement & Binders"], certification: "Sulphate Resistance Certificate",
    warranty: "90-day shelf guarantee", preferred: false, status: "Active",
  },
  {
    id: "BRD-CEM-004", nameEn: "Gulf RapidSet", nameAr: "الخليج سريع التصلب", code: "GRP",
    manufacturer: "Gulf Building Chemicals", country: "Bahrain",
    categories: ["Cement & Binders"], certification: "Rapid-Set Performance Certificate",
    warranty: "60-day shelf guarantee", preferred: false, status: "Active",
  },
];

const SEED_MAPPINGS: SupplierBrandMap[] = [
  ["SBM-001", "Gulf Steel Supply", "Al Falah Steel", true, 3, 10, "45 Days", true, 11.9],
  ["SBM-002", "Gulf Steel Supply", "Najd Steelworks", true, 3, 10, "45 Days", true, 11.2],
  ["SBM-003", "Arabian Metals Trading", "Gulf Reinforcement", true, 4, 15, "30 Days", false, 11.6],
  ["SBM-004", "Arabian Metals Trading", "Eastern Metals", true, 4, 15, "30 Days", false, 10.4],
  ["SBM-005", "Riyadh Rebar Distribution", "Al Falah Steel", false, 1, 5, "Immediate", false, 12.15],
].map(([id, supplier, brand, dist, lead, moq, terms, pref, cost]) => ({
  id: id as string, supplier: supplier as string, category: "Steel & Reinforcement",
  subcategory: "Rebar", brand: brand as string, authorizedDistributor: dist as boolean,
  supplierProductCode: `${(brand as string).split(" ")[0].toUpperCase()}-REBAR`,
  leadTimeDays: lead as number, moq: moq as number, purchaseUom: "Bundle", currency: "SAR",
  standardCost: cost as number, lastCost: cost as number, discountPct: 0,
  deliveryTerms: "Delivered to branch", paymentTerms: terms as string,
  certificateRequired: true, agreementStart: "2026-01-01", agreementEnd: "2026-12-31",
  preferred: pref as boolean, status: "Active" as const,
}));

SEED_MAPPINGS.push(
  {
    id: "SBM-006", supplier: "Al Noor Cement Company", category: "Cement & Binders", subcategory: "Ordinary Portland Cement",
    brand: "Al Binaa Cement", authorizedDistributor: true, supplierProductCode: "ANC-OPC50",
    leadTimeDays: 2, moq: 100, purchaseUom: "Pallet", currency: "SAR", standardCost: 14.5, lastCost: 14.75,
    discountPct: 2, deliveryTerms: "Delivered to branch", paymentTerms: "30 Days", certificateRequired: false,
    agreementStart: "2026-01-01", agreementEnd: "2026-12-31", preferred: true, status: "Active",
  },
  {
    id: "SBM-007", supplier: "Al Noor Cement Company", category: "Cement & Binders", subcategory: "Sulphate-Resistant Cement",
    brand: "Najd Cement", authorizedDistributor: true, supplierProductCode: "ANC-SRC50",
    leadTimeDays: 3, moq: 60, purchaseUom: "Pallet", currency: "SAR", standardCost: 16.8, lastCost: 16.8,
    discountPct: 0, deliveryTerms: "Delivered to branch", paymentTerms: "30 Days", certificateRequired: true,
    agreementStart: "2026-01-01", agreementEnd: "2026-12-31", preferred: false, status: "Active",
  },
  {
    id: "SBM-008", supplier: "Arabian Cement Distribution", category: "Cement & Binders", subcategory: "Ordinary Portland Cement",
    brand: "Desert Portland", authorizedDistributor: true, supplierProductCode: "ACD-DPC50",
    leadTimeDays: 2, moq: 80, purchaseUom: "Pallet", currency: "SAR", standardCost: 14.1, lastCost: 14.1,
    discountPct: 0, deliveryTerms: "Ex-works", paymentTerms: "45 Days", certificateRequired: false,
    agreementStart: "2026-01-01", agreementEnd: "2026-12-31", preferred: false, status: "Active",
  },
  {
    id: "SBM-009", supplier: "Arabian Building Solutions", category: "Cement & Binders", subcategory: "Rapid-Set Cement",
    brand: "Gulf RapidSet", authorizedDistributor: true, supplierProductCode: "ABS-RAPID25",
    leadTimeDays: 5, moq: 40, purchaseUom: "Bag", currency: "SAR", standardCost: 22.5, lastCost: 22.5,
    discountPct: 0, deliveryTerms: "Ex-works", paymentTerms: "Immediate", certificateRequired: true,
    agreementStart: "2026-01-01", agreementEnd: "2026-06-30", preferred: false, status: "Active",
  },
);

const rebar = (
  sku: string, brand: string, code: string, nameAr: string | undefined, grade: string,
  weight: number, retail: number, trade: number, bundle: number,
  stock: BranchStock[], delivery: string, imageKey: string,
): CatalogSku => ({
  sku, barcode: `628${code}12120`, brand, category: "Steel & Reinforcement", subcategory: "Rebar",
  family: `${grade} Reinforcement Bar`, nameEn: `Steel Rebar 12MM × 12M`, nameAr,
  attributes: { Diameter: "12MM", Length: "12M", Grade: grade },
  weightKg: weight, stockUom: "Bar", sellUoms: ["Bar", "Bundle", "Ton"],
  conversions: { Bar: 1, Bundle: 12, Ton: Math.round(1000 / weight) },
  retailPrice: retail, tradePrice: trade, bulkUom: "Bundle", bulkPrice: bundle, vatRate: 15,
  stock, deliveryNote: delivery, warranty: "Mill test certificate",
  returnPolicy: "Eligible when undamaged and within policy", loyaltyClass: "Point 1",
  imageKey, status: "Active",
});

const SEED_SKUS: CatalogSku[] = [
  rebar("AFS-RBR-12MM-12M-G60", "Al Falah Steel", "AFS", "حديد تسليح الفلاح 12 مم × 12 متر", "Grade 60",
    10.65, 14.5, 13.8, 165.6,
    [{ branch: "Riyadh Main Branch", onHand: 850, reserved: 120 }, { branch: "Jeddah Branch", onHand: 240, reserved: 0 }],
    "Available today", "rebar"),
  rebar("GRS-RBR-12MM-12M-G60", "Gulf Reinforcement", "GRS", "حديد تسليح الخليج 12 مم × 12 متر", "Grade 60",
    10.7, 14.2, 13.45, 161.4,
    [{ branch: "Riyadh Main Branch", onHand: 420, reserved: 0 }], "Available today", "rebar"),
  rebar("NSW-RBR-12MM-12M-G60", "Najd Steelworks", "NSW", undefined, "Grade 60",
    10.6, 13.9, 13.2, 158.4,
    [{ branch: "Riyadh Main Branch", onHand: 96, reserved: 0 }], "Available within 24 hours", "rebar"),
  rebar("EMT-RBR-12MM-12M-G40", "Eastern Metals", "EMT", undefined, "Grade 40",
    10.5, 12.9, 12.25, 147,
    [{ branch: "Riyadh Main Branch", onHand: 0, reserved: 0 }, { branch: "Jeddah Branch", onHand: 360, reserved: 0 }],
    "Transfer from Jeddah required", "rebar"),
  {
    sku: "ABC-OPC-50KG", barcode: "6281000010507", brand: "Al Binaa Cement", category: "Cement & Binders",
    subcategory: "Ordinary Portland Cement", family: "Portland Cement", nameEn: "Ordinary Portland Cement 50KG",
    nameAr: "أسمنت البناء البورتلاندي 50 كجم", attributes: { "Bag Weight": "50KG", Type: "OPC" },
    weightKg: 50, stockUom: "Bag", sellUoms: ["Bag", "Pallet"], conversions: { Bag: 1, Pallet: 50 },
    retailPrice: 18, tradePrice: 17.25, bulkUom: "Pallet", bulkPrice: 850, vatRate: 15,
    stock: [{ branch: "Riyadh Main Branch", onHand: 620, reserved: 0 }], deliveryNote: "Available today",
    warranty: "90-day shelf guarantee", returnPolicy: "Sealed bags only", loyaltyClass: "Point 1",
    imageKey: "cement", status: "Active",
  },
  {
    sku: "DPC-OPC-50KG", barcode: "6281000010514", brand: "Desert Portland", category: "Cement & Binders",
    subcategory: "Ordinary Portland Cement", family: "Portland Cement", nameEn: "Ordinary Portland Cement 50KG",
    attributes: { "Bag Weight": "50KG", Type: "OPC" },
    weightKg: 50, stockUom: "Bag", sellUoms: ["Bag", "Pallet"], conversions: { Bag: 1, Pallet: 50 },
    retailPrice: 17.5, tradePrice: 16.8, bulkUom: "Pallet", bulkPrice: 825, vatRate: 15,
    stock: [{ branch: "Riyadh Main Branch", onHand: 340, reserved: 0 }], deliveryNote: "Available today",
    warranty: "90-day shelf guarantee", returnPolicy: "Sealed bags only", loyaltyClass: "Point 1",
    imageKey: "cement", status: "Active",
  },
  {
    sku: "NJC-SRC-50KG", barcode: "6281000010521", brand: "Najd Cement", category: "Cement & Binders",
    subcategory: "Sulphate-Resistant Cement", family: "Sulphate-Resistant Cement",
    nameEn: "Sulphate-Resistant Cement 50KG", attributes: { "Bag Weight": "50KG", Type: "SRC" },
    weightKg: 50, stockUom: "Bag", sellUoms: ["Bag", "Pallet"], conversions: { Bag: 1, Pallet: 50 },
    retailPrice: 20.5, tradePrice: 19.6, vatRate: 15,
    stock: [{ branch: "Riyadh Main Branch", onHand: 185, reserved: 0 }], deliveryNote: "Available today",
    warranty: "90-day shelf guarantee", returnPolicy: "Sealed bags only", loyaltyClass: "Point 1",
    imageKey: "cement", status: "Active",
  },
  {
    sku: "GRS-RAPID-25KG", barcode: "6281000010538", brand: "Gulf RapidSet", category: "Cement & Binders",
    subcategory: "Rapid-Set Cement", family: "Rapid-Set Cement", nameEn: "Rapid-Set Cement 25KG",
    attributes: { "Bag Weight": "25KG", Type: "Rapid-Set" },
    weightKg: 25, stockUom: "Bag", sellUoms: ["Bag"], conversions: { Bag: 1 },
    retailPrice: 28, tradePrice: 26.5, vatRate: 15,
    stock: [{ branch: "Riyadh Main Branch", onHand: 22, reserved: 0 }], deliveryNote: "Available within 48 hours",
    warranty: "60-day shelf guarantee", returnPolicy: "Sealed bags only", loyaltyClass: "Point 1",
    imageKey: "cement", status: "Active",
  },
];

const SEED_OFFERS: SupplierOffer[] = [
  { id: "OFR-001", supplier: "Gulf Steel Supply", sku: "AFS-RBR-12MM-12M-G60", purchaseCost: 11.9, moq: 120, leadTimeDays: 3, availableQty: 2400, paymentTerms: "45 Days", fillRatePct: 96, preferred: true, certificateExpiry: "2026-12-31", status: "Active" },
  { id: "OFR-002", supplier: "Riyadh Rebar Distribution", sku: "AFS-RBR-12MM-12M-G60", purchaseCost: 12.15, moq: 60, leadTimeDays: 1, availableQty: 720, paymentTerms: "Immediate", fillRatePct: 91, preferred: false, certificateExpiry: "2026-08-15", status: "Active" },
  { id: "OFR-003", supplier: "Arabian Metals Trading", sku: "GRS-RBR-12MM-12M-G60", purchaseCost: 11.6, moq: 180, leadTimeDays: 4, availableQty: 1600, paymentTerms: "30 Days", fillRatePct: 89, preferred: true, certificateExpiry: "2026-10-01", status: "Active" },
  { id: "OFR-004", supplier: "Gulf Steel Supply", sku: "NSW-RBR-12MM-12M-G60", purchaseCost: 11.2, moq: 120, leadTimeDays: 3, availableQty: 900, paymentTerms: "45 Days", fillRatePct: 96, preferred: true, status: "Active" },
  { id: "OFR-005", supplier: "Arabian Metals Trading", sku: "EMT-RBR-12MM-12M-G40", purchaseCost: 10.4, moq: 180, leadTimeDays: 4, availableQty: 0, paymentTerms: "30 Days", fillRatePct: 84, preferred: false, status: "Active" },
  { id: "OFR-006", supplier: "Al Noor Cement Company", sku: "ABC-OPC-50KG", purchaseCost: 14.5, moq: 200, leadTimeDays: 2, availableQty: 8000, paymentTerms: "30 Days", fillRatePct: 98, preferred: true, status: "Active" },
  { id: "OFR-007", supplier: "Arabian Cement Distribution", sku: "DPC-OPC-50KG", purchaseCost: 14.1, moq: 150, leadTimeDays: 2, availableQty: 5200, paymentTerms: "45 Days", fillRatePct: 93, preferred: true, status: "Active" },
  { id: "OFR-008", supplier: "Al Noor Cement Company", sku: "NJC-SRC-50KG", purchaseCost: 16.8, moq: 100, leadTimeDays: 3, availableQty: 2100, paymentTerms: "30 Days", fillRatePct: 98, preferred: true, status: "Active" },
  { id: "OFR-009", supplier: "Arabian Building Solutions", sku: "GRS-RAPID-25KG", purchaseCost: 22.5, moq: 40, leadTimeDays: 5, availableQty: 300, paymentTerms: "Immediate", fillRatePct: 87, preferred: true, certificateExpiry: "2026-07-31", status: "Active" },
];

const SEED_PREFERENCES: CustomerPreference[] = [
  {
    customer: "Al Noor Contracting Company", projectRestricted: true,
    approvedBrands: ["Al Falah Steel", "Al Binaa Cement"],
    preferredBrands: { "Steel & Reinforcement": "Al Falah Steel", "Cement & Binders": "Al Binaa Cement" },
    preferredGrade: "Grade 60", preferredCountry: "Saudi Arabia",
    reason: "Approved for current project specification",
    history: ["AFS-RBR-12MM-12M-G60", "ABC-OPC-50KG"],
  },
  {
    customer: "Riyadh Build Contracting", projectRestricted: false,
    approvedBrands: [], preferredBrands: { "Steel & Reinforcement": "Gulf Reinforcement" },
    preferredGrade: "Grade 60", history: ["GRS-RBR-12MM-12M-G60"],
  },
  { customer: "Walk-in Customer", projectRestricted: false, approvedBrands: [], preferredBrands: {}, history: [] },
];

const SEED_PROPOSALS: VendorProposal[] = [
  {
    id: "VPP-001", supplier: "Gulf Steel Supply", category: "Steel & Reinforcement", subcategory: "Steel Mesh",
    brand: "Al Falah Steel", supplierProductCode: "AFS-MESH-6MM", nameEn: "Steel Mesh 6MM 2.4M × 6M",
    nameAr: "شبك حديد 6 مم", specification: "6MM wire, 200×200 grid, Grade 60", purchaseUom: "Sheet",
    sellUomRecommendation: "Sheet", standardCost: 96, moq: 20, leadTimeDays: 4, availableQty: 400,
    country: "Saudi Arabia", vatRate: 15, hasImage: true, hasDatasheet: true, hasCertificate: true,
    status: "Under Review", createdAt: Date.now() - 86400000 * 3,
  },
  {
    id: "VPP-002", supplier: "Arabian Metals Trading", category: "Steel & Reinforcement", subcategory: "Angle Iron",
    brand: "Eastern Metals", supplierProductCode: "EMT-ANG-50", nameEn: "Angle Iron 50 × 50 × 6M",
    specification: "50×50×5mm mild steel angle", purchaseUom: "Length", sellUomRecommendation: "Length",
    standardCost: 62, moq: 30, leadTimeDays: 5, availableQty: 220, country: "United Arab Emirates",
    vatRate: 15, hasImage: false, hasDatasheet: false, hasCertificate: false,
    status: "More Information Required", createdAt: Date.now() - 86400000 * 6,
  },
];

const SEED_PRICE_SUBMISSIONS: PriceSubmission[] = [
  { id: "PRC-001", supplier: "Gulf Steel Supply", sku: "AFS-RBR-12MM-12M-G60", currentCost: 11.9, proposedCost: 12.35, effectiveFrom: "2026-08-01", reason: "Billet cost increase", status: "Submitted", createdAt: Date.now() - 86400000 },
  { id: "PRC-002", supplier: "Arabian Cement Distribution", sku: "DPC-OPC-50KG", currentCost: 14.1, proposedCost: 13.85, effectiveFrom: "2026-08-01", reason: "Volume rebate", status: "Approved", createdAt: Date.now() - 86400000 * 9 },
];

const SEED_POS: VendorPo[] = [
  { id: "PO-2026-0451", supplier: "Gulf Steel Supply", sku: "AFS-RBR-12MM-12M-G60", brand: "Al Falah Steel", qty: 40, uom: "Bundle", cost: 11.9, status: "Awaiting Confirmation", createdAt: Date.now() - 86400000 * 2 },
  { id: "PO-2026-0452", supplier: "Gulf Steel Supply", sku: "NSW-RBR-12MM-12M-G60", brand: "Najd Steelworks", qty: 25, uom: "Bundle", cost: 11.2, status: "Confirmed", confirmedQty: 25, expectedDelivery: "2026-08-04", createdAt: Date.now() - 86400000 * 5 },
  { id: "PO-2026-0453", supplier: "Arabian Metals Trading", sku: "GRS-RBR-12MM-12M-G60", brand: "Gulf Reinforcement", qty: 30, uom: "Bundle", cost: 11.6, status: "Awaiting Confirmation", createdAt: Date.now() - 86400000 },
  { id: "PO-2026-0454", supplier: "Al Noor Cement Company", sku: "ABC-OPC-50KG", brand: "Al Binaa Cement", qty: 12, uom: "Pallet", cost: 14.5, status: "Delivered", confirmedQty: 12, expectedDelivery: "2026-07-25", deliveryNoteRef: "DN-88213", createdAt: Date.now() - 86400000 * 12 },
];

export const BRAND_SALES = [
  { brand: "Al Falah Steel", sales: 184500, units: 12850, share: 38 },
  { brand: "Gulf Reinforcement", sales: 142400, units: 10200, share: 29 },
  { brand: "Najd Steelworks", sales: 98600, units: 7450, share: 20 },
  { brand: "Eastern Metals", sales: 63800, units: 5100, share: 13 },
];

/* ------------------------------------------------------------- selectors */

export function available(s: CatalogSku, branch?: string) {
  return s.stock
    .filter((b) => !branch || b.branch === branch)
    .reduce((t, b) => t + Math.max(0, b.onHand - b.reserved), 0);
}

export function otherBranchStock(s: CatalogSku, branch: string) {
  return s.stock.filter((b) => b.branch !== branch).map((b) => `${b.branch} — ${b.onHand - b.reserved}`);
}

export function stockStatus(s: CatalogSku, branch: string): "In Stock" | "Low Stock" | "Out of Stock" {
  const a = available(s, branch);
  if (a <= 0) return "Out of Stock";
  if (a <= 100) return "Low Stock";
  return "In Stock";
}

/** §80.15 — same category/subcategory/specification alternatives, best matches first. */
export function alternativesFor(target: CatalogSku, all: CatalogSku[], branch: string) {
  return all
    .filter((s) => s.sku !== target.sku && s.category === target.category && s.subcategory === target.subcategory)
    .map((s) => {
      const sameGrade = s.attributes.Grade === target.attributes.Grade;
      const sameSpec = Object.entries(target.attributes)
        .filter(([k]) => k !== "Grade")
        .every(([k, v]) => s.attributes[k] === v);
      return { sku: s, sameGrade, sameSpec, availableQty: available(s, branch) };
    })
    .filter((a) => a.sameSpec)
    .sort((a, b) =>
      Number(b.sameGrade) - Number(a.sameGrade) ||
      Number(b.availableQty > 0) - Number(a.availableQty > 0) ||
      a.sku.retailPrice - b.sku.retailPrice);
}

/* ------------------------------------------------------------------ store */

type State = {
  brands: Brand[];
  mappings: SupplierBrandMap[];
  skus: CatalogSku[];
  offers: SupplierOffer[];
  preferences: CustomerPreference[];
  proposals: VendorProposal[];
  priceSubmissions: PriceSubmission[];
  purchaseOrders: VendorPo[];
  audit: BrandAuditEvent[];

  log: (e: Omit<BrandAuditEvent, "id" | "ts">) => void;
  saveBrand: (b: Brand, user: string) => { ok: boolean; message: string };
  toggleBrand: (id: string, user: string) => void;
  saveMapping: (m: SupplierBrandMap, user: string) => void;
  removeMapping: (id: string, user: string) => void;
  saveOffer: (o: SupplierOffer, user: string) => void;
  setPreferredOffer: (sku: string, id: string, user: string) => void;
  setCustomerPreference: (customer: string, category: string, brand: string, user: string) => void;
  selectBrandForCustomer: (customer: string, sku: CatalogSku, user: string, reason?: string) => void;
  submitProposal: (p: Omit<VendorProposal, "id" | "createdAt" | "status">, user: string) => void;
  advanceProposal: (id: string, status: VendorProposalStatus, user: string) => void;
  submitPriceChange: (p: Omit<PriceSubmission, "id" | "createdAt" | "status">, user: string) => void;
  decidePriceChange: (id: string, approve: boolean, user: string) => void;
  confirmPo: (id: string, confirmedQty: number, expectedDelivery: string, user: string) => void;
  attachDeliveryNote: (id: string, ref: string, user: string) => void;
  reset: () => void;
};

let seq = 1;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;

const initial = () => ({
  brands: SEED_BRANDS, mappings: SEED_MAPPINGS, skus: SEED_SKUS, offers: SEED_OFFERS,
  preferences: SEED_PREFERENCES, proposals: SEED_PROPOSALS,
  priceSubmissions: SEED_PRICE_SUBMISSIONS, purchaseOrders: SEED_POS, audit: [] as BrandAuditEvent[],
});

export const useBrandStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial(),

      log: (e) =>
        set((s) => ({ audit: [{ ...e, id: nid("EVT"), ts: Date.now() }, ...s.audit].slice(0, 400) })),

      saveBrand: (b, user) => {
        const list = get().brands;
        const existing = list.find((x) => x.id === b.id);
        if (!b.categories.length) return { ok: false, message: "At least one category is required." };
        if (list.some((x) => x.id !== b.id && x.code.toLowerCase() === b.code.toLowerCase()))
          return { ok: false, message: `Brand code ${b.code} is already used.` };
        if (list.some((x) => x.id !== b.id && x.nameEn.toLowerCase() === b.nameEn.toLowerCase()
          && x.manufacturer.toLowerCase() === b.manufacturer.toLowerCase()))
          return { ok: false, message: "Brand name must be unique within the same manufacturer." };
        set((s) => ({ brands: existing ? s.brands.map((x) => (x.id === b.id ? b : x)) : [b, ...s.brands] }));
        get().log({
          event: existing ? "BRAND_UPDATED" : "BRAND_CREATED", brand: b.nameEn, category: b.categories[0],
          user, oldValue: existing ? existing.status : undefined, newValue: b.status, severity: "info",
        });
        return { ok: true, message: `${b.nameEn} saved.` };
      },

      toggleBrand: (id, user) => {
        const b = get().brands.find((x) => x.id === id);
        if (!b) return;
        const status: BrandStatus = b.status === "Active" ? "Inactive" : "Active";
        set((s) => ({ brands: s.brands.map((x) => (x.id === id ? { ...x, status } : x)) }));
        get().log({
          event: status === "Inactive" ? "BRAND_DEACTIVATED" : "BRAND_UPDATED", brand: b.nameEn,
          user, oldValue: b.status, newValue: status, severity: status === "Inactive" ? "warning" : "info",
        });
      },

      saveMapping: (m, user) => {
        const exists = get().mappings.some((x) => x.id === m.id);
        set((s) => ({ mappings: exists ? s.mappings.map((x) => (x.id === m.id ? m : x)) : [m, ...s.mappings] }));
        get().log({
          event: "SUPPLIER_BRAND_MAPPED", supplier: m.supplier, brand: m.brand, category: m.category,
          user, newValue: `${m.leadTimeDays}d / MOQ ${m.moq} / ${m.paymentTerms}`, severity: "info",
        });
      },

      removeMapping: (id, user) => {
        const m = get().mappings.find((x) => x.id === id);
        set((s) => ({ mappings: s.mappings.filter((x) => x.id !== id) }));
        if (m) get().log({ event: "SUPPLIER_BRAND_REMOVED", supplier: m.supplier, brand: m.brand, category: m.category, user, severity: "warning" });
      },

      saveOffer: (o, user) => {
        const existing = get().offers.find((x) => x.id === o.id);
        set((s) => ({ offers: existing ? s.offers.map((x) => (x.id === o.id ? o : x)) : [o, ...s.offers] }));
        get().log({
          event: existing ? "SUPPLIER_OFFER_UPDATED" : "SUPPLIER_OFFER_CREATED", supplier: o.supplier,
          sku: o.sku, user, oldValue: existing ? String(existing.purchaseCost) : undefined,
          newValue: String(o.purchaseCost), severity: "info",
        });
      },

      setPreferredOffer: (sku, id, user) => {
        set((s) => ({ offers: s.offers.map((o) => (o.sku === sku ? { ...o, preferred: o.id === id } : o)) }));
        const o = get().offers.find((x) => x.id === id);
        if (o) get().log({ event: "SUPPLIER_OFFER_UPDATED", supplier: o.supplier, sku, user, newValue: "Preferred supplier offer", severity: "info" });
      },

      setCustomerPreference: (customer, category, brand, user) => {
        set((s) => ({
          preferences: s.preferences.map((p) =>
            p.customer === customer ? { ...p, preferredBrands: { ...p.preferredBrands, [category]: brand } } : p),
        }));
        get().log({ event: "CUSTOMER_PREFERENCE_UPDATED", customer, category, brand, user, newValue: brand, severity: "info" });
      },

      selectBrandForCustomer: (customer, sku, user, reason) => {
        set((s) => ({
          preferences: s.preferences.map((p) =>
            p.customer === customer ? { ...p, history: [sku.sku, ...p.history.filter((h) => h !== sku.sku)].slice(0, 20) } : p),
        }));
        get().log({
          event: reason ? "ALTERNATIVE_PRODUCT_SELECTED" : "CUSTOMER_BRAND_SELECTED", customer,
          brand: sku.brand, sku: sku.sku, product: sku.nameEn, category: sku.category, user,
          reason, severity: reason ? "warning" : "info",
        });
      },

      submitProposal: (p, user) => {
        const proposal: VendorProposal = { ...p, id: nid("VPP"), status: "Submitted", createdAt: Date.now() };
        set((s) => ({ proposals: [proposal, ...s.proposals] }));
        get().log({
          event: "VENDOR_PRODUCT_PROPOSED", supplier: p.supplier, brand: p.brand, category: p.category,
          product: p.nameEn, user, newValue: "Submitted", severity: "info",
        });
      },

      advanceProposal: (id, status, user) => {
        const p = get().proposals.find((x) => x.id === id);
        set((s) => ({ proposals: s.proposals.map((x) => (x.id === id ? { ...x, status } : x)) }));
        if (p) get().log({
          event: status === "Approved" ? "VENDOR_PRODUCT_APPROVED" : "VENDOR_PRODUCT_PROPOSED",
          supplier: p.supplier, brand: p.brand, product: p.nameEn, user, oldValue: p.status,
          newValue: status, approval: status === "Approved" ? user : undefined,
          severity: status === "Rejected" ? "warning" : "info",
        });
      },

      submitPriceChange: (p, user) => {
        set((s) => ({ priceSubmissions: [{ ...p, id: nid("PRC"), status: "Submitted", createdAt: Date.now() }, ...s.priceSubmissions] }));
        get().log({
          event: "SUPPLIER_PRICE_CHANGE_SUBMITTED", supplier: p.supplier, sku: p.sku, user,
          oldValue: String(p.currentCost), newValue: String(p.proposedCost), reason: p.reason, severity: "info",
        });
      },

      decidePriceChange: (id, approve, user) => {
        const p = get().priceSubmissions.find((x) => x.id === id);
        set((s) => ({
          priceSubmissions: s.priceSubmissions.map((x) => (x.id === id ? { ...x, status: approve ? "Approved" : "Rejected" } : x)),
          offers: approve && p ? s.offers.map((o) => (o.supplier === p.supplier && o.sku === p.sku ? { ...o, purchaseCost: p.proposedCost } : o)) : s.offers,
        }));
        if (p && approve) get().log({
          event: "SUPPLIER_PRICE_CHANGE_APPROVED", supplier: p.supplier, sku: p.sku, user,
          oldValue: String(p.currentCost), newValue: String(p.proposedCost), approval: user, severity: "info",
        });
      },

      confirmPo: (id, confirmedQty, expectedDelivery, user) => {
        const po = get().purchaseOrders.find((x) => x.id === id);
        if (!po) return;
        const status: VendorPo["status"] = confirmedQty >= po.qty ? "Confirmed" : "Partially Confirmed";
        set((s) => ({ purchaseOrders: s.purchaseOrders.map((x) => (x.id === id ? { ...x, confirmedQty, expectedDelivery, status } : x)) }));
        get().log({
          event: "SUPPLIER_OFFER_UPDATED", supplier: po.supplier, sku: po.sku, brand: po.brand, user,
          oldValue: po.status, newValue: `${status} — ${confirmedQty} ${po.uom} by ${expectedDelivery}`, severity: "info",
        });
      },

      attachDeliveryNote: (id, ref, user) => {
        const po = get().purchaseOrders.find((x) => x.id === id);
        set((s) => ({ purchaseOrders: s.purchaseOrders.map((x) => (x.id === id ? { ...x, deliveryNoteRef: ref, status: "Delivered" } : x)) }));
        if (po) get().log({ event: "SUPPLIER_OFFER_UPDATED", supplier: po.supplier, sku: po.sku, user, newValue: `Delivery note ${ref}`, severity: "info" });
      },

      reset: () => set({ ...initial() }),
    }),
    { name: "buildpos-brands-v1", version: 1 },
  ),
);

export const SUPPLIERS = [
  "Gulf Steel Supply", "Arabian Metals Trading", "Riyadh Rebar Distribution",
  "Al Noor Cement Company", "Arabian Cement Distribution", "Arabian Building Solutions",
];