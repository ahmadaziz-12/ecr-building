// §Product Catalog seed data — the 20 spec'd building-materials SKUs.
//
// This is the single source of truth the whole app falls back to when the .NET catalog API isn't
// reachable (preview/demo). Everything that reads products goes through `useProducts`, so seeding
// here surfaces the same SKUs in Product Catalog, POS Checkout, Stock Enquiry, Inventory & Stock,
// Add Stock, Stock Taking, Adjustments, Transfers, Purchase Orders, Supplier Returns, Quotations,
// Brand Comparison, Reports and Analytics.
import type { ProductDto } from "@/lib/api/catalog";
import { resolveProductImage } from "./product-images";

export const SEED_CATEGORIES = [
  "Cement & Binders",
  "Aggregates & Sand",
  "Steel & Reinforcement",
  "Tiles & Stone",
  "Timber & Boards",
  "Paint & Coatings",
  "Pipes & Plumbing",
  "Electrical",
  "Insulation",
  "Glass & Windows",
  "Hardware & Fasteners",
  "Power & Hand Tools",
  "Waterproofing",
  "Landscaping",
] as const;

export const SEED_STOCK_STATUSES = [
  "In Stock",
  "Low Stock",
  "Out of Stock",
  "Reserved",
  "Quarantine",
  "Inspection Hold",
  "Supplier Return Hold",
] as const;

export type SeedProduct = {
  productId: string;
  sku: string;
  barcode: string;
  nameEn: string;
  nameAr: string;
  category: (typeof SEED_CATEGORIES)[number];
  subcategory: string;
  brand: string;
  supplier: string;
  spec: string;
  cost: number;
  price: number;
  tradePrice?: number;
  vatRate?: number;
  stockUom: string;
  sellUoms?: string[];
  conversions?: { uom: string; factorToStock: number }[];
  available: number;
  reserved: number;
  minStock?: number;
  reorderQty?: number;
  weight?: number;
  delivery: string;
  loyalty: number;
  returnPolicy: string;
  returnable?: boolean;
  badge?: string;
  otherBranch?: string;
  cutToSize?: boolean;
  serialTracked?: boolean;
};

export const SEED_PRODUCTS: SeedProduct[] = [
  { productId: "PRD-0001", sku: "ABC-OPC-50KG", barcode: "628100100001", nameEn: "Ordinary Portland Cement 50KG", nameAr: "أسمنت بورتلاندي عادي 50 كجم", category: "Cement & Binders", subcategory: "Portland Cement", brand: "Al Binaa Cement", supplier: "Al Noor Cement Company", spec: "50KG Bag, General Construction", cost: 15.65, price: 18.0, tradePrice: 17.25, stockUom: "Bag", sellUoms: ["Bag", "Pallet"], conversions: [{ uom: "Pallet", factorToStock: 50 }], available: 620, reserved: 80, minStock: 100, reorderQty: 500, weight: 50, delivery: "Available", loyalty: 1, returnPolicy: "Unopened bags within 90 days" },
  { productId: "PRD-0002", sku: "DPC-OPC-50KG", barcode: "628100100002", nameEn: "Desert Portland Cement 50KG", nameAr: "أسمنت ديزرت بورتلاندي 50 كجم", category: "Cement & Binders", subcategory: "Portland Cement", brand: "Desert Portland", supplier: "Arabian Cement Distribution", spec: "50KG Bag, High Strength", cost: 15.2, price: 17.5, tradePrice: 16.8, stockUom: "Bag", sellUoms: ["Bag", "Pallet"], conversions: [{ uom: "Pallet", factorToStock: 50 }], available: 340, reserved: 40, minStock: 100, reorderQty: 400, weight: 50, delivery: "Available", loyalty: 1, returnPolicy: "Unopened bags within 90 days" },
  { productId: "PRD-0003", sku: "NJC-SRC-50KG", barcode: "628100100003", nameEn: "Sulphate-Resistant Cement 50KG", nameAr: "أسمنت مقاوم للكبريتات 50 كجم", category: "Cement & Binders", subcategory: "Sulphate-Resistant Cement", brand: "Najd Cement", supplier: "Al Noor Cement Company", spec: "50KG Bag, Sulphate Resistant", cost: 17.9, price: 20.5, tradePrice: 19.6, stockUom: "Bag", sellUoms: ["Bag", "Pallet"], conversions: [{ uom: "Pallet", factorToStock: 50 }], available: 185, reserved: 20, minStock: 80, reorderQty: 300, weight: 50, delivery: "Available", loyalty: 1, returnPolicy: "Unopened bags within 90 days" },
  { productId: "PRD-0004", sku: "GRS-RAPID-25KG", barcode: "628100100004", nameEn: "Rapid-Set Cement 25KG", nameAr: "أسمنت سريع التصلب 25 كجم", category: "Cement & Binders", subcategory: "Rapid-Set Cement", brand: "Gulf RapidSet", supplier: "Arabian Building Solutions", spec: "25KG Bag, Fast Setting", cost: 24.1, price: 28.0, tradePrice: 26.5, stockUom: "Bag", sellUoms: ["Bag"], available: 22, reserved: 4, minStock: 40, reorderQty: 120, weight: 25, delivery: "Available", loyalty: 2, returnPolicy: "Unopened bags within 90 days" },

  { productId: "PRD-0005", sku: "AFS-RBR-12MM-G60", barcode: "628100200001", nameEn: "Steel Rebar 12MM × 12M Grade 60", nameAr: "حديد تسليح الفلاح 12 مم × 12 متر درجة 60", category: "Steel & Reinforcement", subcategory: "Rebar", brand: "Al Falah Steel", supplier: "Gulf Steel Supply", spec: "12MM Diameter, 12M Length, Grade 60", cost: 12.6, price: 14.5, tradePrice: 13.8, stockUom: "Bar", sellUoms: ["Bar", "Bundle", "Ton"], conversions: [{ uom: "Bundle", factorToStock: 12 }, { uom: "Ton", factorToStock: 93.9 }], available: 730, reserved: 120, minStock: 200, reorderQty: 600, weight: 10.65, delivery: "Available Today", loyalty: 1, returnPolicy: "Undamaged steel within return policy", badge: "Preferred Brand" },
  { productId: "PRD-0006", sku: "GRF-RBR-12MM-G60", barcode: "628100200002", nameEn: "Steel Rebar 12MM × 12M Grade 60", nameAr: "حديد تسليح الخليج 12 مم × 12 متر درجة 60", category: "Steel & Reinforcement", subcategory: "Rebar", brand: "Gulf Reinforcement", supplier: "Arabian Metals Trading", spec: "12MM Diameter, 12M Length, Grade 60", cost: 12.4, price: 14.2, tradePrice: 13.45, stockUom: "Bar", sellUoms: ["Bar", "Bundle", "Ton"], conversions: [{ uom: "Bundle", factorToStock: 12 }, { uom: "Ton", factorToStock: 93.5 }], available: 420, reserved: 60, minStock: 150, reorderQty: 500, weight: 10.7, delivery: "Available Today", loyalty: 1, returnPolicy: "Undamaged steel within return policy", badge: "Best Value" },
  { productId: "PRD-0007", sku: "NSW-RBR-12MM-G60", barcode: "628100200003", nameEn: "Steel Rebar 12MM × 12M Grade 60", nameAr: "حديد نجد 12 مم × 12 متر درجة 60", category: "Steel & Reinforcement", subcategory: "Rebar", brand: "Najd Steelworks", supplier: "Gulf Steel Supply", spec: "12MM Diameter, 12M Length, Grade 60", cost: 12.1, price: 13.9, tradePrice: 13.2, stockUom: "Bar", sellUoms: ["Bar", "Bundle", "Ton"], conversions: [{ uom: "Bundle", factorToStock: 12 }], available: 96, reserved: 12, minStock: 150, reorderQty: 400, weight: 10.65, delivery: "Available within 24 Hours", loyalty: 1, returnPolicy: "Undamaged steel within return policy", badge: "Lowest Price" },
  { productId: "PRD-0008", sku: "EMT-RBR-12MM-G40", barcode: "628100200004", nameEn: "Steel Rebar 12MM × 12M Grade 40", nameAr: "حديد إيسترن 12 مم × 12 متر درجة 40", category: "Steel & Reinforcement", subcategory: "Rebar", brand: "Eastern Metals", supplier: "Arabian Metals Trading", spec: "12MM Diameter, 12M Length, Grade 40", cost: 11.2, price: 12.9, tradePrice: 12.25, stockUom: "Bar", sellUoms: ["Bar", "Bundle"], conversions: [{ uom: "Bundle", factorToStock: 12 }], available: 0, reserved: 0, minStock: 150, reorderQty: 400, weight: 10.6, delivery: "Available from Jeddah Branch", loyalty: 1, returnPolicy: "Undamaged steel within return policy", badge: "Alternative Grade", otherBranch: "Jeddah Branch — 360 Bars" },

  { productId: "PRD-0009", sku: "AGG-SAND-FINE", barcode: "628100300001", nameEn: "Washed Fine Sand", nameAr: "رمل ناعم مغسول", category: "Aggregates & Sand", subcategory: "Fine Sand", brand: "DesertMix", supplier: "Riyadh Aggregate Supply", spec: "Washed Construction Sand", cost: 92, price: 110, stockUom: "Ton", sellUoms: ["Ton", "Cubic Metre"], conversions: [{ uom: "Cubic Metre", factorToStock: 1.6 }], available: 86.5, reserved: 12, minStock: 30, reorderQty: 100, weight: 1000, delivery: "Required", loyalty: 1, returnPolicy: "Non-returnable after delivery", returnable: false },

  { productId: "PRD-0010", sku: "TILE-GRY-60X60", barcode: "628100400001", nameEn: "Grey Porcelain Tile 60×60", nameAr: "بلاط بورسلان رمادي 60×60", category: "Tiles & Stone", subcategory: "Porcelain Tiles", brand: "Saudi Ceramics", supplier: "Saudi Tiles Trading", spec: "60×60CM, 1.44 m² per Box", cost: 50, price: 62, tradePrice: 58, stockUom: "Box", sellUoms: ["Box", "m²"], conversions: [{ uom: "m²", factorToStock: 0.694 }], available: 185, reserved: 32, minStock: 60, reorderQty: 200, weight: 28, delivery: "Available", loyalty: 2, returnPolicy: "Full unopened boxes only" },

  { productId: "PRD-0011", sku: "TIM-MDF-18MM", barcode: "628100500001", nameEn: "MDF Board 18MM", nameAr: "لوح إم دي إف سماكة 18 مم", category: "Timber & Boards", subcategory: "MDF", brand: "BuildBoard", supplier: "Arabian Timber Supply", spec: "2440 × 1220MM, 18MM Thickness", cost: 98, price: 120, stockUom: "Sheet", sellUoms: ["Sheet"], available: 74, reserved: 10, minStock: 25, reorderQty: 80, weight: 38, delivery: "Available", loyalty: 1, returnPolicy: "Uncut and undamaged sheets only" },

  { productId: "PRD-0012", sku: "PAINT-WHT-20L", barcode: "628100600001", nameEn: "Interior White Paint 20L", nameAr: "دهان داخلي أبيض 20 لتر", category: "Paint & Coatings", subcategory: "Interior Paint", brand: "ColorPro", supplier: "ColorPro Paints", spec: "White WH-001, 20L Tin", cost: 108, price: 135, tradePrice: 128, stockUom: "Tin", sellUoms: ["Tin", "Litre"], conversions: [{ uom: "Litre", factorToStock: 0.05 }], available: 48, reserved: 8, minStock: 20, reorderQty: 60, weight: 22, delivery: "Available", loyalty: 2, returnPolicy: "Standard unopened colour only — custom tinted non-returnable" },

  { productId: "PRD-0013", sku: "PVC-PIPE-2IN", barcode: "628100700001", nameEn: "UPVC Pipe 2 Inch × 6M", nameAr: "أنبوب يو بي في سي 2 بوصة × 6 متر", category: "Pipes & Plumbing", subcategory: "UPVC Pipes", brand: "FlowLine", supplier: "FlowLine Trading", spec: "2 Inch, 6M Length, PN10", cost: 19, price: 24, stockUom: "Piece", sellUoms: ["Piece", "Metre"], conversions: [{ uom: "Metre", factorToStock: 0.1667 }], available: 215, reserved: 25, minStock: 80, reorderQty: 200, weight: 4.2, delivery: "Available", loyalty: 1, returnPolicy: "Unused and undamaged pipes" },

  { productId: "PRD-0014", sku: "CABLE-2.5MM", barcode: "628100800001", nameEn: "Electrical Cable 2.5MM", nameAr: "كابل كهربائي 2.5 مم", category: "Electrical", subcategory: "Electrical Cable", brand: "PowerMax", supplier: "PowerMax Electrical", spec: "2.5MM Copper Cable", cost: 3.6, price: 4.5, stockUom: "Metre", sellUoms: ["Metre", "Roll"], conversions: [{ uom: "Roll", factorToStock: 100 }], available: 1850, reserved: 250, minStock: 500, reorderQty: 2000, weight: 0.05, delivery: "Available", loyalty: 2, returnPolicy: "Full unused rolls only — cut cable non-returnable" },

  { productId: "PRD-0015", sku: "INS-RW-50MM", barcode: "628100900001", nameEn: "Rockwool Insulation 50MM", nameAr: "عازل صوف صخري 50 مم", category: "Insulation", subcategory: "Rockwool", brand: "InsuTech", supplier: "Arabian Building Solutions", spec: "50MM Slab, R-Value 2.5", cost: 27, price: 35, stockUom: "Slab", sellUoms: ["Slab", "m²"], conversions: [{ uom: "m²", factorToStock: 1 }], available: 300, reserved: 44, minStock: 100, reorderQty: 300, weight: 3.5, delivery: "Available", loyalty: 2, returnPolicy: "Unopened packaging only" },

  { productId: "PRD-0016", sku: "GLASS-CLR-8MM", barcode: "628101000001", nameEn: "Clear Glass 8MM", nameAr: "زجاج شفاف سماكة 8 مم", category: "Glass & Windows", subcategory: "Float Glass", brand: "ClearShield", supplier: "Gulf Glass Trading", spec: "8MM Clear Float Glass", cost: 74, price: 95, stockUom: "Sheet", sellUoms: ["Sheet", "m²"], conversions: [{ uom: "m²", factorToStock: 1 }], available: 40, reserved: 6, minStock: 15, reorderQty: 40, weight: 20, delivery: "Available", loyalty: 1, returnPolicy: "Cut-to-size glass is non-returnable", cutToSize: true, returnable: false },

  { productId: "PRD-0017", sku: "HRD-ANCH-10MM", barcode: "628101100001", nameEn: "Expansion Anchor 10MM", nameAr: "مسمار تثبيت تمدد 10 مم", category: "Hardware & Fasteners", subcategory: "Anchors", brand: "FixPro", supplier: "Gulf Hardware Supply", spec: "10MM Zinc-Plated Anchor", cost: 1.4, price: 2, stockUom: "Piece", sellUoms: ["Piece", "Box"], conversions: [{ uom: "Box", factorToStock: 100 }], available: 2400, reserved: 300, minStock: 800, reorderQty: 3000, weight: 0.04, delivery: "Available", loyalty: 3, returnPolicy: "Unopened boxes only" },

  { productId: "PRD-0018", sku: "TOOL-DRILL-500W", barcode: "628101200001", nameEn: "Professional Drill 500W", nameAr: "مثقاب احترافي 500 واط", category: "Power & Hand Tools", subcategory: "Drills", brand: "BuildPro Tools", supplier: "Industrial Tools Trading", spec: "500W Corded Drill, 13MM Chuck", cost: 195, price: 240, stockUom: "Unit", sellUoms: ["Unit"], available: 26, reserved: 3, minStock: 10, reorderQty: 30, weight: 2.4, delivery: "Available", loyalty: 3, returnPolicy: "Unused product with packaging and serial number", serialTracked: true },

  { productId: "PRD-0019", sku: "WPF-LIQ-20L", barcode: "628101300001", nameEn: "Liquid Waterproof Membrane 20L", nameAr: "غشاء عزل مائي سائل 20 لتر", category: "Waterproofing", subcategory: "Liquid Membrane", brand: "HydroSeal", supplier: "Arabian Building Solutions", spec: "20L Flexible Waterproof Coating", cost: 142, price: 175, stockUom: "Tin", sellUoms: ["Tin", "Litre"], conversions: [{ uom: "Litre", factorToStock: 0.05 }], available: 118, reserved: 14, minStock: 30, reorderQty: 100, weight: 21, delivery: "Available", loyalty: 2, returnPolicy: "Unopened tins only" },

  { productId: "PRD-0020", sku: "LAND-PAVE-GRY", barcode: "628101400001", nameEn: "Grey Interlock Paving Block", nameAr: "بلاط إنترلوك رمادي", category: "Landscaping", subcategory: "Paving Blocks", brand: "DesertStone", supplier: "Riyadh Landscaping Materials", spec: "Grey, 60MM Thickness", cost: 36, price: 45, stockUom: "Pallet", sellUoms: ["Pallet", "m²"], conversions: [{ uom: "m²", factorToStock: 0.08 }], available: 42, reserved: 8, minStock: 15, reorderQty: 60, weight: 900, delivery: "Required", loyalty: 1, returnPolicy: "Full undamaged pallets only" },
];

export const SEED_BRANDS = Array.from(new Set(SEED_PRODUCTS.map((p) => p.brand))).sort();
export const SEED_SUPPLIERS = Array.from(new Set(SEED_PRODUCTS.map((p) => p.supplier))).sort();

/** §20: derived stock status used by the catalog filter and the card badge. */
export function seedStockStatus(p: SeedProduct): string {
  if (p.available <= 0) return "Out of Stock";
  if (p.minStock != null && p.available <= p.minStock) return "Low Stock";
  return "In Stock";
}

const categoryId = (name: string) => SEED_CATEGORIES.indexOf(name as never) + 1;

/** The seed catalog shaped as the API's ProductDto so every existing consumer works unchanged. */
export const SEED_PRODUCT_DTOS: ProductDto[] = SEED_PRODUCTS.map((p, i) => ({
  id: i + 1,
  sku: p.sku,
  barcode: p.barcode,
  nameEn: p.nameEn,
  nameAr: p.nameAr,
  categoryId: categoryId(p.category),
  categoryName: p.category,
  brand: p.brand,
  costPrice: p.cost,
  sellingPrice: p.price,
  vatRate: p.vatRate ?? 15,
  stockUom: p.stockUom,
  sellUoms: p.sellUoms ?? [p.stockUom],
  weight: p.weight ?? 0,
  returnable: p.returnable ?? true,
  reorderLevel: p.minStock ?? 0,
  reorderQty: p.reorderQty ?? 0,
  imageUrl: resolveProductImage(p.sku, p.category, null),
  status: "Active",
  totalOnHand: p.available + p.reserved,
  totalAvailable: p.available,
  uomConversions: [{ uom: p.stockUom, factorToStock: 1 }, ...(p.conversions ?? [])],
  isCutToSize: p.cutToSize ?? false,
  cutToSizeUnit: "Area",
  attributes: [
    { name: "Subcategory", value: p.subcategory },
    { name: "Specification", value: p.spec },
    { name: "Reserved", value: `${p.reserved} ${p.stockUom}` },
    { name: "Delivery", value: p.delivery },
    { name: "Loyalty", value: `Point ${p.loyalty}` },
    { name: "Return Policy", value: p.returnPolicy },
    ...(p.badge ? [{ name: "Badge", value: p.badge }] : []),
    ...(p.otherBranch ? [{ name: "Other Branch Stock", value: p.otherBranch }] : []),
  ],
  supplierId: null,
  supplierName: p.supplier,
  binLocation: null,
  contractorPrice: p.tradePrice ?? null,
  wholesalePrice: p.tradePrice ?? null,
  projectPrice: p.tradePrice ?? null,
  minCutQty: p.cutToSize ? 0.5 : null,
  variantGroupId: null,
  variantGroupName: null,
  isSoldByWeight: false,
  requiresSerialTracking: p.serialTracked ?? false,
}));

export const SEED_CATEGORY_DTOS = SEED_CATEGORIES.map((name, i) => ({
  id: i + 1,
  code: name.replace(/[^A-Za-z]+/g, "-").toUpperCase(),
  nameEn: name,
  nameAr: null,
  parentId: null,
  parentName: null,
  returnable: true,
  status: "Active",
  skuCount: SEED_PRODUCTS.filter((p) => p.category === name).length,
}));
