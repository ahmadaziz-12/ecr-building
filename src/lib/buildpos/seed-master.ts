// ============================================================================
// MI MONEY BUILDPOS — master pseudo-data seed (business, branches, locations,
// suppliers, vendors, customers, employees, users, terminals, devices, shifts,
// sales, payments, invoices, POs, intakes, adjustments, transfers, stock takes,
// returns, vehicles, deliveries, loyalty, rules, approvals, KPIs).
//
// This is APPEND-ONLY demo data: every API hook falls back to it when the .NET
// backend isn't reachable, and the persisted seed store (seed-store.ts) layers
// user-created records (new sales from checkout, new customers) on top without
// ever deleting a seeded record.
// ============================================================================
import type { CustomerDto, OrderDto, OrderLineDto, CashierShiftDto } from "@/lib/api/pos";
import type { SupplierDto, PurchaseOrderDto } from "@/lib/api/procurement";
import { SEED_PRODUCT_DTOS } from "./seed-products";

export const VAT_RATE = 0.15;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ================= 1. Business profile ================= */
export const SEED_BUSINESS = {
  id: "BUS-001",
  nameEn: "Al Binaa Building Materials Trading",
  nameAr: "شركة البناء لتجارة مواد البناء",
  country: "Saudi Arabia",
  currency: "SAR",
  vatNo: "310123456700003",
  defaultLanguage: "Arabic",
  secondaryLanguage: "English",
  timeZone: "Asia/Riyadh",
  status: "Active",
};

/* ================= 2. Branches ================= */
export type SeedBranch = {
  id: number; code: string; nameEn: string; nameAr: string; city: string;
  manager: string; terminals: number; employees: number; status: string;
};
export const SEED_BRANCHES: SeedBranch[] = [
  { id: 1, code: "B-RYD-001", nameEn: "Riyadh Main Branch", nameAr: "فرع الرياض الرئيسي", city: "Riyadh", manager: "Ahmed Al-Harbi", terminals: 6, employees: 18, status: "Active" },
  { id: 2, code: "B-JED-001", nameEn: "Jeddah Branch", nameAr: "فرع جدة", city: "Jeddah", manager: "Saleh Al-Ghamdi", terminals: 4, employees: 11, status: "Active" },
  { id: 3, code: "B-DMM-001", nameEn: "Dammam Branch", nameAr: "فرع الدمام", city: "Dammam", manager: "Mohammed Al-Qahtani", terminals: 3, employees: 8, status: "Active" },
  { id: 4, code: "B-KHB-001", nameEn: "Khobar Building Materials Branch", nameAr: "فرع الخبر لمواد البناء", city: "Khobar", manager: "Omar Al-Dossari", terminals: 2, employees: 6, status: "Active" },
  { id: 5, code: "B-MED-001", nameEn: "Madinah Branch", nameAr: "فرع المدينة المنورة", city: "Madinah", manager: "Ibrahim Al-Otaibi", terminals: 2, employees: 5, status: "Active" },
];

/* ================= 3. Stock locations ================= */
export type SeedLocation = {
  code: string; name: string; type: string; branch: string; zone: string;
  aisle: string; rack: string; bin: string; sellable: boolean;
  allowedCategories: string[]; status: string;
};
export const SEED_LOCATIONS: SeedLocation[] = [
  { code: "LOC-RYD-CEN-001", name: "Central Riyadh Stock Location", type: "Central Stock Location", branch: "Central", zone: "Heavy Materials", aisle: "CEM-01", rack: "Floor Stack", bin: "CEM-A", sellable: true, allowedCategories: ["Cement & Binders", "Steel & Reinforcement", "Aggregates & Sand", "Landscaping"], status: "Active" },
  { code: "LOC-RYD-BR-001", name: "Riyadh Main Branch Stockroom", type: "Branch Stockroom", branch: "Riyadh Main Branch", zone: "General Materials", aisle: "TILE-02", rack: "R-04", bin: "B-12", sellable: true, allowedCategories: [], status: "Active" },
  { code: "LOC-RYD-SF-001", name: "Riyadh Sales Floor", type: "Sales Floor", branch: "Riyadh Main Branch", zone: "Fast Moving Items", aisle: "HWR-01", rack: "R-01", bin: "B-01", sellable: true, allowedCategories: [], status: "Active" },
  { code: "LOC-RYD-QUA-001", name: "Riyadh Quarantine Area", type: "Quarantine Area", branch: "Riyadh Main Branch", zone: "Restricted", aisle: "Q-01", rack: "QR-01", bin: "QB-01", sellable: false, allowedCategories: [], status: "Active" },
  { code: "LOC-RYD-RTS-001", name: "Supplier Return Hold", type: "Supplier Return Hold", branch: "Riyadh Main Branch", zone: "Restricted", aisle: "RTS-01", rack: "RR-01", bin: "RB-01", sellable: false, allowedCategories: [], status: "Active" },
];

/* ================= 4. Categories (Arabic + UOMs) ================= */
export const SEED_CATEGORY_META = [
  { code: "CAT-001", nameEn: "Cement & Binders", nameAr: "الأسمنت والمواد الرابطة", uoms: ["Bag", "Pallet", "KG"] },
  { code: "CAT-002", nameEn: "Aggregates & Sand", nameAr: "الركام والرمل", uoms: ["Ton", "m³", "Bag"] },
  { code: "CAT-003", nameEn: "Steel & Reinforcement", nameAr: "الحديد والتسليح", uoms: ["Bar", "Bundle", "KG", "Ton"] },
  { code: "CAT-004", nameEn: "Tiles & Stone", nameAr: "البلاط والحجر", uoms: ["Box", "m²", "Piece"] },
  { code: "CAT-005", nameEn: "Timber & Boards", nameAr: "الأخشاب والألواح", uoms: ["Sheet", "Linear Metre", "m³"] },
  { code: "CAT-006", nameEn: "Paint & Coatings", nameAr: "الدهانات والطلاءات", uoms: ["Tin", "Litre", "Kit"] },
  { code: "CAT-007", nameEn: "Pipes & Plumbing", nameAr: "الأنابيب والسباكة", uoms: ["Piece", "Metre", "Set"] },
  { code: "CAT-008", nameEn: "Electrical", nameAr: "المواد الكهربائية", uoms: ["Metre", "Roll", "Unit"] },
  { code: "CAT-009", nameEn: "Insulation", nameAr: "مواد العزل", uoms: ["Slab", "Roll", "m²"] },
  { code: "CAT-010", nameEn: "Glass & Windows", nameAr: "الزجاج والنوافذ", uoms: ["Sheet", "m²", "Unit"] },
  { code: "CAT-011", nameEn: "Hardware & Fasteners", nameAr: "العدد والمثبتات", uoms: ["Piece", "Box", "KG"] },
  { code: "CAT-012", nameEn: "Power & Hand Tools", nameAr: "الأدوات الكهربائية واليدوية", uoms: ["Unit", "Set"] },
  { code: "CAT-013", nameEn: "Waterproofing", nameAr: "العزل المائي", uoms: ["Tin", "Litre", "Roll", "m²"] },
  { code: "CAT-014", nameEn: "Landscaping", nameAr: "مواد تنسيق المواقع", uoms: ["Pallet", "m²", "Piece", "Ton"] },
];

/* ================= 5. Brands ================= */
export const SEED_BRAND_MASTER = [
  { code: "BRD-001", name: "Al Binaa Cement", category: "Cement & Binders", country: "Saudi Arabia", preferred: false, status: "Active" },
  { code: "BRD-002", name: "Desert Portland", category: "Cement & Binders", country: "Saudi Arabia", preferred: false, status: "Active" },
  { code: "BRD-003", name: "Najd Cement", category: "Cement & Binders", country: "Saudi Arabia", preferred: false, status: "Active" },
  { code: "BRD-004", name: "Al Falah Steel", category: "Steel & Reinforcement", country: "Saudi Arabia", preferred: true, status: "Active" },
  { code: "BRD-005", name: "Gulf Reinforcement", category: "Steel & Reinforcement", country: "Saudi Arabia", preferred: false, status: "Active" },
  { code: "BRD-006", name: "Najd Steelworks", category: "Steel & Reinforcement", country: "Saudi Arabia", preferred: false, status: "Active" },
  { code: "BRD-007", name: "Saudi Ceramics", category: "Tiles & Stone", country: "Saudi Arabia", preferred: false, status: "Active" },
  { code: "BRD-008", name: "ColorPro", category: "Paint & Coatings", country: "Saudi Arabia", preferred: false, status: "Active" },
  { code: "BRD-009", name: "FlowLine", category: "Pipes & Plumbing", country: "Saudi Arabia", preferred: false, status: "Active" },
  { code: "BRD-010", name: "PowerMax", category: "Electrical", country: "Saudi Arabia", preferred: false, status: "Active" },
  { code: "BRD-011", name: "HydroSeal", category: "Waterproofing", country: "Saudi Arabia", preferred: false, status: "Active" },
  { code: "BRD-012", name: "BuildPro Tools", category: "Power & Hand Tools", country: "Saudi Arabia", preferred: false, status: "Active" },
];

/* ================= 6. Suppliers ================= */
export const SEED_SUPPLIER_META = [
  { id: 1, supplierId: "SUP-001", brands: ["Al Binaa Cement", "Najd Cement", "HydroSeal"], fillRate: 96, rating: 4.7 },
  { id: 2, supplierId: "SUP-002", brands: ["Al Falah Steel", "Najd Steelworks"], fillRate: 94, rating: 4.5 },
  { id: 3, supplierId: "SUP-003", brands: ["ColorPro", "HydroSeal", "Saudi Ceramics"], fillRate: 92, rating: 4.4 },
  { id: 4, supplierId: "SUP-004", brands: ["FlowLine"], fillRate: 93, rating: 4.3 },
  { id: 5, supplierId: "SUP-005", brands: ["PowerMax"], fillRate: 95, rating: 4.4 },
  { id: 6, supplierId: "SUP-006", brands: ["BuildPro Tools"], fillRate: 91, rating: 4.2 },
];

export const SEED_SUPPLIER_DTOS: SupplierDto[] = [
  { id: 1, code: "SUP-CEM-001", nameEn: "Al Noor Cement Company", nameAr: "شركة النور للأسمنت", type: "Manufacturer", vatNo: "310555000100003", phone: "+966 11 400 1001", email: "sales@alnoorcement.sa", categories: ["Cement & Binders", "Waterproofing"], terms: "30 Days", currency: "SAR", leadTimeDays: 2, iban: "SA0380000000608010167519", status: "Active" },
  { id: 2, code: "SUP-STL-001", nameEn: "Gulf Steel Supply", nameAr: "الخليج لتوريد الحديد", type: "Distributor", vatNo: "310555000200003", phone: "+966 11 400 1002", email: "orders@gulfsteel.sa", categories: ["Steel & Reinforcement", "Hardware & Fasteners"], terms: "45 Days", currency: "SAR", leadTimeDays: 3, iban: "SA4420000001234567891234", status: "Active" },
  { id: 3, code: "SUP-BLD-001", nameEn: "Arabian Building Solutions", nameAr: "الحلول العربية للبناء", type: "Distributor", vatNo: "310555000300003", phone: "+966 11 400 1003", email: "info@arabianbuild.sa", categories: ["Paint & Coatings", "Insulation", "Waterproofing", "Tiles & Stone"], terms: "45 Days", currency: "SAR", leadTimeDays: 4, iban: "SA1230000009876543211234", status: "Active" },
  { id: 4, code: "SUP-PLB-001", nameEn: "FlowLine Trading", nameAr: "فلو لاين التجارية", type: "Distributor", vatNo: "310555000400003", phone: "+966 11 400 1004", email: "sales@flowline.sa", categories: ["Pipes & Plumbing"], terms: "30 Days", currency: "SAR", leadTimeDays: 3, iban: "SA9930000004561237891234", status: "Active" },
  { id: 5, code: "SUP-ELE-001", nameEn: "PowerMax Electrical", nameAr: "باور ماكس للكهرباء", type: "Manufacturer", vatNo: "310555000500003", phone: "+966 11 400 1005", email: "sales@powermax.sa", categories: ["Electrical"], terms: "30 Days", currency: "SAR", leadTimeDays: 4, iban: "SA7730000007418529631234", status: "Active" },
  { id: 6, code: "SUP-TOOL-001", nameEn: "Industrial Tools Trading", nameAr: "الأدوات الصناعية التجارية", type: "Distributor", vatNo: "310555000600003", phone: "+966 11 400 1006", email: "sales@indtools.sa", categories: ["Power & Hand Tools", "Hardware & Fasteners"], terms: "30 Days", currency: "SAR", leadTimeDays: 3, iban: "SA5530000003692581471234", status: "Active" },
];

/* ================= 7. Vendor users ================= */
export const SEED_VENDOR_USERS = [
  { code: "VEN-001", supplierCode: "SUP-001", supplierName: "Al Noor Cement Company", name: "Yousef Al-Qahtani", username: "y.alqahtani.vendor", role: "Supplier Account Manager", openPos: 3, pendingDeliveries: 2, pendingCertificates: 0, status: "Active" },
  { code: "VEN-002", supplierCode: "SUP-002", supplierName: "Gulf Steel Supply", name: "Omar Al-Dossari", username: "o.aldossari.vendor", role: "Vendor Sales Coordinator", openPos: 4, pendingDeliveries: 3, pendingCertificates: 0, status: "Active" },
  { code: "VEN-003", supplierCode: "SUP-003", supplierName: "Arabian Building Solutions", name: "Mansour Al-Harbi", username: "m.alharbi.vendor", role: "Vendor Account Manager", openPos: 2, pendingDeliveries: 0, pendingCertificates: 1, status: "Active" },
];

/* ================= 9. Customers ================= */
const customer = (o: Partial<CustomerDto> & { id: number; nameEn: string }): CustomerDto => ({
  nameAr: null, type: "Retail", phone: null, email: null, vatNo: null, creditLimit: 0, outstanding: 0,
  city: "Riyadh", district: null, address: null, loyaltyEnrolled: false, loyaltyPoints: 0,
  loyaltyLifetimePoints: 0, loyaltyTier: "Bronze", status: "Active", lastPurchaseAt: null,
  projectName: null, creditTermDays: null, createdAt: "2026-01-12T08:00:00Z", loyaltyLifetimeSpend: 0,
  accountManagerUserId: null, accountManagerName: null, priorityBilling: false, dateOfBirth: null,
  pointsExpiringSoon: false, priceListType: "Retail", ...o,
});

export const SEED_CUSTOMER_DTOS: CustomerDto[] = [
  customer({ id: 1001, nameEn: "Faisal Ahmed", nameAr: "فيصل أحمد", type: "Retail", phone: "+966 50 200 1001", email: "faisal.ahmed@example.sa", loyaltyEnrolled: true, loyaltyPoints: 18650, loyaltyLifetimePoints: 24300, loyaltyTier: "Silver", loyaltyLifetimeSpend: 48600, priceListType: "Retail", pointsExpiringSoon: true, lastPurchaseAt: "2026-07-30T11:20:00Z" }),
  customer({ id: 1012, nameEn: "Al Noor Contracting Company", nameAr: "شركة النور للمقاولات", type: "B2B", phone: "+966 50 123 4567", email: "khalid@alnoorcontracting.sa", vatNo: "310123456700003", creditLimit: 100000, outstanding: 64250, creditTermDays: 30, projectName: "PRJ-RYD-221", loyaltyEnrolled: true, loyaltyPoints: 296000, loyaltyLifetimePoints: 412000, loyaltyTier: "Platinum", loyaltyLifetimeSpend: 1240000, priceListType: "Contractor", priorityBilling: true, accountManagerName: "Ahmed Al-Harbi", lastPurchaseAt: "2026-08-02T09:15:00Z" }),
  customer({ id: 1004, nameEn: "Modern Villas Establishment", type: "B2B", phone: "+966 50 200 1004", creditLimit: 50000, outstanding: 12500, creditTermDays: 15, loyaltyEnrolled: true, loyaltyPoints: 42800, loyaltyTier: "Gold", loyaltyLifetimeSpend: 320000, priceListType: "Project", lastPurchaseAt: "2026-08-01T13:40:00Z" }),
  customer({ id: 1015, nameEn: "Gulf Build Company", type: "B2B", creditLimit: 150000, outstanding: 145300, creditTermDays: 30, priceListType: "Contractor", loyaltyTier: "Gold", loyaltyEnrolled: true, loyaltyPoints: 61200, loyaltyLifetimeSpend: 780000, lastPurchaseAt: "2026-07-28T10:05:00Z" }),
  customer({ id: 1005, nameEn: "Abdullah Saleh", type: "Retail", phone: "+966 55 908 2241", loyaltyEnrolled: true, loyaltyPoints: 2400, loyaltyLifetimePoints: 3100, loyaltyTier: "Bronze", loyaltyLifetimeSpend: 8600, lastPurchaseAt: "2026-08-03T16:30:00Z" }),
];

/** Extra B2B facts the CustomerDto has no column for (overdue, PO/project rules, preferences). */
export const SEED_CUSTOMER_META: Record<number, { customerId: string; cr?: string; contact?: string; overdue?: number; creditStatus?: string; poRequired?: boolean; projectRequired?: boolean; preferredCement?: string; preferredSteel?: string; branch?: string }> = {
  1001: { customerId: "CUS-1001", branch: "Riyadh Main Branch" },
  1012: { customerId: "B2B-0012", cr: "1010456789", contact: "Khalid Al-Nasser", overdue: 8500, creditStatus: "Active", poRequired: true, projectRequired: true, preferredCement: "Al Binaa Cement", preferredSteel: "Al Falah Steel", branch: "Riyadh Main Branch" },
  1004: { customerId: "TRD-1004", contact: "Abdullah Al-Mutairi", creditStatus: "Active", branch: "Riyadh Main Branch" },
  1015: { customerId: "B2B-0015", overdue: 18600, creditStatus: "Hold", branch: "Riyadh Main Branch" },
  1005: { customerId: "CUS-1012", branch: "Riyadh Main Branch" },
};

/* ================= 10. Employees ================= */
export const SEED_EMPLOYEES = [
  { code: "EMP-001", name: "Ahmed Al-Harbi", department: "Store Operations", designation: "Store Manager", branch: "Riyadh Main Branch", terminal: null as string | null, shift: "Morning", vehicle: null as string | null, status: "Active" },
  { code: "EMP-002", name: "Fahad Al-Qahtani", department: "Cashier Operations", designation: "Senior Cashier", branch: "Riyadh Main Branch", terminal: "POS-02", shift: "Morning", vehicle: null, status: "Active" },
  { code: "EMP-003", name: "Sara Al-Otaibi", department: "Cashier Operations", designation: "Cashier", branch: "Riyadh Main Branch", terminal: "POS-03", shift: "Morning", vehicle: null, status: "Active" },
  { code: "EMP-004", name: "Khalid Al-Mutairi", department: "Cashier Operations", designation: "Cashier", branch: "Riyadh Main Branch", terminal: "POS-04", shift: "Evening", vehicle: null, status: "Active" },
  { code: "EMP-005", name: "Noura Al-Salem", department: "Inventory", designation: "Inventory Officer", branch: "Riyadh Main Branch", terminal: null, shift: "Morning", vehicle: null, status: "Active" },
  { code: "EMP-006", name: "Hamad Al-Qahtani", department: "Delivery & Dispatch", designation: "Driver", branch: "Riyadh Main Branch", terminal: null, shift: "Morning", vehicle: "VEH-002", status: "Active" },
  { code: "EMP-007", name: "Maha Al-Rashid", department: "Procurement", designation: "Procurement Manager", branch: "Riyadh Main Branch", terminal: null, shift: "Morning", vehicle: null, status: "Active" },
  { code: "EMP-008", name: "Abdullah Al-Rashid", department: "Inventory", designation: "Inventory Manager", branch: "Riyadh Main Branch", terminal: null, shift: "Morning", vehicle: null, status: "Active" },
];

/* ================= 11. Users & roles ================= */
export const SEED_ROLES = [
  "Store Manager", "Supervisor", "Cashier", "Inventory Officer", "Inventory Manager",
  "Procurement Manager", "Finance Manager", "Delivery User", "HR User", "Vendor User",
].map((name, i) => ({ code: `ROLE-${String(i + 1).padStart(3, "0")}`, name, status: "Active" }));

export const SEED_APP_USERS = [
  { code: "USR-001", name: "Ahmed Al-Harbi", role: "Store Manager", branches: ["Riyadh Main Branch"], status: "Active" },
  { code: "USR-002", name: "Fahad Al-Qahtani", role: "Senior Cashier", branches: ["Riyadh Main Branch"], status: "Active" },
  { code: "USR-003", name: "Sara Al-Otaibi", role: "Cashier", branches: ["Riyadh Main Branch"], status: "Active" },
  { code: "USR-004", name: "Noura Al-Salem", role: "Inventory Officer", branches: ["Riyadh Main Branch"], status: "Active" },
  { code: "USR-005", name: "Maha Al-Rashid", role: "Procurement Manager", branches: ["Riyadh Main Branch", "Jeddah Branch"], status: "Active" },
  { code: "USR-006", name: "Abdullah Al-Rashid", role: "Inventory Manager", branches: ["Riyadh Main Branch"], status: "Active" },
  { code: "USR-007", name: "Hamad Al-Qahtani", role: "Delivery User", branches: ["Riyadh Main Branch"], status: "Active" },
];

/* ================= 12. Terminals & 13. Devices ================= */
export const SEED_TERMINALS = [
  { code: "POS-01", name: "Riyadh Front Counter 01", branch: "Riyadh Main Branch", cashier: "Ahmed Al-Harbi", status: "Active" },
  { code: "POS-02", name: "Riyadh Front Counter 02", branch: "Riyadh Main Branch", cashier: "Fahad Al-Qahtani", status: "Active" },
  { code: "POS-03", name: "Riyadh Front Counter 03", branch: "Riyadh Main Branch", cashier: "Sara Al-Otaibi", status: "Offline" },
  { code: "POS-04", name: "Riyadh Front Counter 04", branch: "Riyadh Main Branch", cashier: "Khalid Al-Mutairi", status: "Active" },
  { code: "POS-05", name: "Riyadh Contractor Desk", branch: "Riyadh Main Branch", cashier: null as string | null, status: "Active" },
  { code: "POS-06", name: "Riyadh Supervisor Terminal", branch: "Riyadh Main Branch", cashier: null, status: "Active" },
];

export const SEED_DEVICES = [
  { code: "DEV-001", type: "Receipt Printer", model: "Epson TM-T88VII", terminal: "POS-01", branch: "Riyadh Main Branch", status: "Connected" },
  { code: "DEV-002", type: "Card Terminal", model: "PAX A920", terminal: "POS-01", branch: "Riyadh Main Branch", status: "Connected" },
  { code: "DEV-003", type: "Barcode Scanner", model: "Zebra DS2208", terminal: "POS-01", branch: "Riyadh Main Branch", status: "Connected" },
  { code: "DEV-004", type: "Cash Drawer", model: "APG Vasario", terminal: "POS-01", branch: "Riyadh Main Branch", status: "Connected" },
  { code: "DEV-005", type: "Customer Display", model: "10\" LCD", terminal: "POS-01", branch: "Riyadh Main Branch", status: "Connected" },
  { code: "DEV-006", type: "Barcode Scanner", model: "Zebra DS2208", terminal: "POS-03", branch: "Riyadh Main Branch", status: "Offline" },
  { code: "DEV-007", type: "Label Printer", model: "Zebra ZD421", terminal: null as string | null, branch: "Riyadh Main Branch", status: "Connected" },
  { code: "DEV-008", type: "Weighing Scale", model: "RS-232 Platform Scale", terminal: null, branch: "Riyadh Main Branch", status: "Connected" },
];

/* ================= 14. Cashier shifts ================= */
export const SEED_SHIFT_DTOS: CashierShiftDto[] = [
  { id: 1041, terminalId: 1, terminalName: "POS-01", cashierName: "Ahmed Al-Harbi", cashierUserId: 1, openedAt: "2026-08-04T05:00:00Z", closedAt: null, openingFloat: 1000, cashSales: 5500, cashIn: 0, cashOut: 0, expectedCash: 6500, countedCash: null, variance: null, status: "Open" },
  { id: 1042, terminalId: 2, terminalName: "POS-02", cashierName: "Fahad Al-Qahtani", cashierUserId: 2, openedAt: "2026-08-04T06:00:00Z", closedAt: null, openingFloat: 1000, cashSales: 2200, cashIn: 0, cashOut: 0, expectedCash: 3200, countedCash: null, variance: null, status: "Open" },
  { id: 1044, terminalId: 4, terminalName: "POS-04", cashierName: "Khalid Al-Mutairi", cashierUserId: 4, openedAt: "2026-08-04T07:00:00Z", closedAt: null, openingFloat: 1000, cashSales: 3800, cashIn: 0, cashOut: 0, expectedCash: 4800, countedCash: 4760, variance: -40, status: "Review Required" },
];
export const SEED_SHIFT_TX_COUNTS: Record<number, number> = { 1041: 72, 1042: 46, 1044: 58 };

/* ================= 15. Sales / orders ================= */
const productBySku = (sku: string) => SEED_PRODUCT_DTOS.find((p) => p.sku === sku);

function line(
  id: number,
  sku: string,
  qty: number,
  unitPrice: number,
  uom: string,
  factorToStock = 1,
  discountPct = 0,
): OrderLineDto {
  const p = productBySku(sku);
  const gross = qty * unitPrice;
  const net = round2(gross * (1 - discountPct / 100));
  return {
    id, productId: p?.id ?? id, sku, productName: p?.nameEn ?? sku, qty, unitPrice,
    discountPct, vatRate: 15, lineTotal: net, uom, stockQty: round2(qty * factorToStock),
    lengthM: null, widthM: null, heightM: null, bundleId: null, bundleName: null,
    lineWeight: round2((p?.weight ?? 0) * qty * factorToStock), notes: null,
  };
}

export const SEED_ORDER_DTOS: OrderDto[] = [
  {
    id: 8091, orderNo: "ORD-2026-8091", branchId: 1, branchName: "Riyadh Main Branch", terminalId: 5,
    cashierName: "Ahmed Al-Harbi", customerId: 1012, customerName: "Al Noor Contracting Company",
    type: "Contractor Sale", status: "Completed", paymentStatus: "Paid",
    subTotal: 4390, discountTotal: 219.5, bundleDiscountTotal: 0, vatTotal: 663.08, feesTotal: 250,
    grandTotal: 5083.58, createdAt: "2026-08-04T06:12:00Z",
    lines: [
      line(1, "ABC-OPC-50KG", 2, 862.5, "Pallet", 50),
      line(2, "AFS-RBR-12MM-G60", 10, 165.6, "Bundle", 12),
      line(3, "TILE-GRY-60X60", 20, 50.6, "Box", 1),
    ],
    payments: [
      { id: 1001, method: "Account Credit", amount: 4000, referenceNumber: null, status: "Approved", createdAt: "2026-08-04T06:13:00Z" },
      { id: 1002, method: "Card", amount: 1083.58, referenceNumber: "APP-986421", status: "Approved", createdAt: "2026-08-04T06:13:30Z" },
    ],
    fees: [{ label: "Delivery", amount: 250 }],
    loyaltyPointsEarned: null, loyaltyPointsBalance: null, loyaltyNextTierThreshold: null, loyaltyPointsRedeemed: null,
    deliveryOrderId: 1021, deliveryOrderNo: "DO-2026-1021", deliveryStage: "Assigned",
    poReference: "PO-AN-7781", projectCode: "PRJ-RYD-221",
  },
  {
    id: 8092, orderNo: "ORD-2026-8092", branchId: 1, branchName: "Riyadh Main Branch", terminalId: 2,
    cashierName: "Fahad Al-Qahtani", customerId: 1001, customerName: "Faisal Ahmed",
    type: "Retail", status: "Completed", paymentStatus: "Paid",
    subTotal: 1320, discountTotal: 0, bundleDiscountTotal: 0, vatTotal: 198, feesTotal: 0, grandTotal: 1518,
    createdAt: "2026-08-04T07:05:00Z",
    lines: [line(1, "PAINT-WHT-20L", 8, 135, "Tin"), line(2, "TOOL-DRILL-500W", 1, 240, "Unit")],
    payments: [{ id: 1003, method: "Card", amount: 1518, referenceNumber: "APP-986500", status: "Approved", createdAt: "2026-08-04T07:06:00Z" }],
    fees: [],
    loyaltyPointsEarned: null, loyaltyPointsBalance: null, loyaltyNextTierThreshold: null, loyaltyPointsRedeemed: null,
    deliveryOrderId: 1022, deliveryOrderNo: "DO-2026-1022", deliveryStage: "Pending",
    poReference: null, projectCode: null,
  },
  {
    id: 8093, orderNo: "ORD-2026-8093", branchId: 1, branchName: "Riyadh Main Branch", terminalId: 5,
    cashierName: "Ahmed Al-Harbi", customerId: 1004, customerName: "Modern Villas Establishment",
    type: "Contractor Sale", status: "Pick Ready", paymentStatus: "Pending",
    subTotal: 4156.52, discountTotal: 0, bundleDiscountTotal: 0, vatTotal: 623.48, feesTotal: 0, grandTotal: 4780,
    createdAt: "2026-08-04T07:40:00Z",
    lines: [line(1, "PAINT-WHT-20L", 16, 128, "Tin"), line(2, "WPF-LIQ-20L", 12, 175, "Tin")],
    payments: [{ id: 1004, method: "Bank Transfer", amount: 4780, referenceNumber: "TRF-556213", status: "Pending Confirmation", createdAt: "2026-08-04T07:41:00Z" }],
    fees: [],
    loyaltyPointsEarned: null, loyaltyPointsBalance: null, loyaltyNextTierThreshold: null, loyaltyPointsRedeemed: null,
    deliveryOrderId: 1023, deliveryOrderNo: "DO-2026-1023", deliveryStage: "Dispatched",
    poReference: null, projectCode: null,
  },
  {
    id: 8094, orderNo: "ORD-2026-8094", branchId: 1, branchName: "Riyadh Main Branch", terminalId: 5,
    cashierName: "Ahmed Al-Harbi", customerId: 1015, customerName: "Gulf Build Company",
    type: "Contractor Sale", status: "Credit Hold", paymentStatus: "Unpaid",
    subTotal: 19478.26, discountTotal: 0, bundleDiscountTotal: 0, vatTotal: 2921.74, feesTotal: 0, grandTotal: 22400,
    createdAt: "2026-08-04T08:10:00Z",
    lines: [line(1, "ABC-OPC-50KG", 20, 862.5, "Pallet", 50), line(2, "AFS-RBR-12MM-G60", 12, 165.6, "Bundle", 12)],
    payments: [],
    fees: [],
    loyaltyPointsEarned: null, loyaltyPointsBalance: null, loyaltyNextTierThreshold: null, loyaltyPointsRedeemed: null,
    deliveryOrderId: null, deliveryOrderNo: null, deliveryStage: null,
    poReference: null, projectCode: null,
  },
  {
    id: 8095, orderNo: "ORD-2026-8095", branchId: 1, branchName: "Riyadh Main Branch", terminalId: 1,
    cashierName: "Ahmed Al-Harbi", customerId: 1005, customerName: "Abdullah Saleh",
    type: "Retail", status: "Completed", paymentStatus: "Paid",
    subTotal: 1695.65, discountTotal: 0, bundleDiscountTotal: 0, vatTotal: 254.35, feesTotal: 0, grandTotal: 1950,
    createdAt: "2026-08-04T08:35:00Z",
    lines: [line(1, "PVC-PIPE-2IN", 40, 24, "Piece"), line(2, "CABLE-2.5MM", 160, 4.5, "Metre")],
    payments: [{ id: 1005, method: "Cash", amount: 1950, referenceNumber: null, status: "Completed", createdAt: "2026-08-04T08:36:00Z" }],
    fees: [],
    loyaltyPointsEarned: null, loyaltyPointsBalance: null, loyaltyNextTierThreshold: null, loyaltyPointsRedeemed: null,
    deliveryOrderId: 1025, deliveryOrderNo: "DO-2026-1025", deliveryStage: "Returned to Branch",
    poReference: null, projectCode: null,
  },
];

/* ================= 16. Payment records ================= */
export const SEED_PAYMENT_RECORDS = [
  { code: "PAY-1001", orderNo: "ORD-2026-8091", method: "Account Credit", amount: 4000, received: 4000, change: 0, reference: null as string | null, status: "Approved" },
  { code: "PAY-1002", orderNo: "ORD-2026-8091", method: "Card", amount: 1083.58, received: 1083.58, change: 0, reference: "APP-986421", status: "Approved" },
  { code: "PAY-1003", orderNo: "ORD-2026-8092", method: "Card", amount: 1518, received: 1518, change: 0, reference: "APP-986500", status: "Approved" },
  { code: "PAY-1004", orderNo: "ORD-2026-8093", method: "Bank Transfer", amount: 4780, received: 0, change: 0, reference: "TRF-556213", status: "Pending Confirmation" },
  { code: "PAY-1005", orderNo: "ORD-2026-8095", method: "Cash", amount: 1950, received: 2000, change: 50, reference: null, status: "Completed" },
];

/* ================= 17. Invoices ================= */
export const SEED_INVOICES = [
  { no: "INV-2026-00888", orderNo: "ORD-2026-8095", customer: "Abdullah Saleh", type: "Simplified Invoice", total: 1950, status: "Cleared", error: null as string | null },
  { no: "INV-2026-00889", orderNo: "ORD-2026-8091", customer: "Al Noor Contracting Company", type: "Full Tax Invoice", total: 5083.58, status: "Cleared", error: null },
  { no: "INV-2026-00890", orderNo: null as string | null, customer: "Walk-in Customer", type: "Simplified Invoice", total: 430, status: "Queued Offline", error: null },
  { no: "INV-2026-00891", orderNo: null, customer: "Gulf Build Company", type: "Full Tax Invoice", total: 11500, status: "Failed", error: "TAX-403" },
  { no: "INV-2026-00892", orderNo: "ORD-2026-8092", customer: "Faisal Ahmed", type: "Simplified Invoice", total: 1518, status: "Submitted", error: null },
];

/* ================= 18. Purchase orders ================= */
const poLine = (id: number, sku: string, qty: number, unitCost: number, uom?: string) => {
  const p = productBySku(sku);
  return {
    id, productId: p?.id ?? id, sku, productName: p?.nameEn ?? sku, branchId: 1,
    branchName: "Riyadh Main Branch", warehouseId: 1, warehouseName: "Riyadh Main Yard",
    uom: uom ?? p?.stockUom ?? "Unit", stockUom: p?.stockUom ?? "Unit", qty, unitCost,
    receivedQty: 0, batchNo: null, expiryDate: null,
  };
};

export const SEED_PURCHASE_ORDER_DTOS: PurchaseOrderDto[] = [
  {
    id: 561, poNo: "PO-2026-0561", supplierId: 3, supplierName: "Arabian Building Solutions",
    branches: ["Riyadh Main Branch"], currency: "SAR", expectedDate: "2026-08-08T00:00:00Z",
    status: "Approved", shipping: 0, incoterm: "DDP", carrier: null, trackingRef: null,
    totalValue: 40986, receivedPct: 0,
    lines: [poLine(1, "WPF-LIQ-20L", 120, 142), poLine(2, "INS-RW-50MM", 300, 27), poLine(3, "PAINT-WHT-20L", 100, 108)],
  },
  {
    id: 562, poNo: "PO-2026-0562", supplierId: 1, supplierName: "Al Noor Cement Company",
    branches: ["Riyadh Main Branch"], currency: "SAR", expectedDate: "2026-08-06T00:00:00Z",
    status: "Partially Received", shipping: 0, incoterm: "DDP", carrier: "Al Noor Fleet", trackingRef: "ANF-33121",
    totalValue: 16800, receivedPct: 55,
    lines: [
      { ...poLine(1, "ABC-OPC-50KG", 500, 15.65), receivedQty: 320 },
      { ...poLine(2, "NJC-SRC-50KG", 300, 17.9), receivedQty: 120 },
    ],
  },
  {
    id: 563, poNo: "PO-2026-0563", supplierId: 2, supplierName: "Gulf Steel Supply",
    branches: ["Riyadh Main Branch"], currency: "SAR", expectedDate: "2026-08-09T00:00:00Z",
    status: "Submitted", shipping: 0, incoterm: "DDP", carrier: null, trackingRef: null,
    totalValue: 18900, receivedPct: 0,
    lines: [poLine(1, "AFS-RBR-12MM-G60", 1000, 12.6), poLine(2, "NSW-RBR-12MM-G60", 500, 12.1)],
  },
];

/* ================= 19. Stock intakes ================= */
export const SEED_STOCK_INTAKES = [
  { no: "STK-IN-2026-0061", source: "Purchase Order Receipt", reference: "PO-2026-0561", branch: "Riyadh Main Branch", received: 520, accepted: 516, quarantine: 4, damaged: 0, status: "Posted", date: "2026-08-03" },
  { no: "STK-IN-2026-0062", source: "Opening Stock", reference: "KHB-GOLIVE-001", branch: "Khobar Building Materials Branch", received: 0, accepted: 0, quarantine: 0, damaged: 0, status: "Approved", date: "2026-08-02" },
  { no: "STK-IN-2026-0063", source: "Transfer Receipt", reference: "TRF-2026-0118", branch: "Riyadh Main Branch", received: 100, accepted: 98, quarantine: 0, damaged: 2, status: "Posted", date: "2026-08-03" },
];

/* ================= 20. Stock adjustments ================= */
export const SEED_ADJUSTMENTS = [
  { no: "ADJ-2026-0035", type: "Damage", sku: "TILE-GRY-60X60", product: "Grey Porcelain Tile 60×60", qty: -6, uom: "Box", reason: "Cracked during unloading", disposition: "Quarantine", value: -372, status: "Approved", branch: "Riyadh Main Branch" },
  { no: "ADJ-2026-0036", type: "Stock Increase", sku: "CABLE-2.5MM", product: "Electrical Cable 2.5MM", qty: 100, uom: "Metre", reason: "Physical count surplus", disposition: "Sellable", value: 450, status: "Pending Approval", branch: "Riyadh Main Branch" },
  { no: "ADJ-2026-0037", type: "Expiry", sku: "WPF-LIQ-20L", product: "Liquid Waterproof Membrane 20L", qty: -3, uom: "Tin", reason: "Shelf life expired", disposition: "Quarantine", value: -525, status: "Approved", branch: "Riyadh Main Branch" },
];

/* ================= 21. Stock transfers ================= */
export const SEED_TRANSFERS = [
  { no: "TRF-2026-0118", from: "Jeddah Branch", to: "Riyadh Main Branch", items: [{ sku: "TILE-GRY-60X60", product: "Grey Porcelain Tile 60×60", requested: 100, dispatched: 100, received: 98, damaged: 2, uom: "Box" }], status: "Discrepancy Review" },
  { no: "TRF-2026-0119", from: "Central Riyadh Stock Location", to: "Riyadh Main Branch", items: [{ sku: "ABC-OPC-50KG", product: "Ordinary Portland Cement 50KG", requested: 10, dispatched: 10, received: 0, damaged: 0, uom: "Pallet" }, { sku: "AFS-RBR-12MM-G60", product: "Steel Rebar 12MM × 12M Grade 60", requested: 20, dispatched: 20, received: 0, damaged: 0, uom: "Bundle" }], status: "In Transit" },
  { no: "TRF-2026-0120", from: "Riyadh Main Branch", to: "Khobar Building Materials Branch", items: [{ sku: "PVC-PIPE-2IN", product: "UPVC Pipe 2 Inch × 6M", requested: 100, dispatched: 0, received: 0, damaged: 0, uom: "Piece" }, { sku: "CABLE-2.5MM", product: "Electrical Cable 2.5MM", requested: 500, dispatched: 0, received: 0, damaged: 0, uom: "Metre" }], status: "Approved" },
];

/* ================= 22. Stock-taking sessions ================= */
export const SEED_STOCK_TAKES = [
  { no: "STK-TAKE-2026-0041", name: "Riyadh Cement and Steel Cycle Count", branch: "Riyadh Main Branch", type: "Cycle Count", method: "Blind Count", totalSkus: 128, counted: 96, varianceSkus: 8, progress: 75, maker: "Noura Al-Salem", checker: "Abdullah Al-Rashid", status: "In Progress" },
  { no: "STK-TAKE-2026-0040", name: "Tile Stock Verification", branch: "Riyadh Main Branch", type: "Cycle Count", method: "Blind Count", totalSkus: 35, counted: 35, varianceSkus: 4, progress: 100, maker: "Noura Al-Salem", checker: "Abdullah Al-Rashid", status: "Pending Checker" },
  { no: "STK-TAKE-2026-0039", name: "Khobar Opening Stock Recount", branch: "Khobar Building Materials Branch", type: "Full Count", method: "Blind Count", totalSkus: 58, counted: 58, varianceSkus: 2, progress: 100, maker: "Noura Al-Salem", checker: "Abdullah Al-Rashid", status: "Recount Required" },
];

/* ================= 23. Returns ================= */
export const SEED_RETURNS = [
  { no: "RET-221", invoice: "INV-2026-00888", customer: "Abdullah Saleh", type: "Standard Return", sku: "PVC-PIPE-2IN", product: "UPVC Pipe 2 Inch", qty: 6, uom: "Pieces", reason: "Wrong Size", restockingPct: 0, refund: 180, disposition: "Sellable", status: "Completed" },
  { no: "RET-222", invoice: "INV-2026-00889", customer: "Al Noor Contracting Company", type: "Surplus Material", sku: "ABC-OPC-50KG", product: "Al Binaa Cement 50KG", qty: 40, uom: "Bags", reason: "Project Excess", restockingPct: 5, refund: 786.6, disposition: "Sellable", status: "Completed" },
  { no: "RET-223", invoice: null as string | null, customer: "Gulf Build Company", type: "Damaged Claim", sku: "TILE-GRY-60X60", product: "Grey Porcelain Tile 60×60", qty: 14, uom: "Boxes", reason: "Broken Boxes", restockingPct: 0, refund: 0, disposition: "Quarantine", status: "Approved" },
  { no: "RET-224", invoice: null, customer: "Modern Villas Establishment", type: "Damaged Claim", sku: "PAINT-WHT-20L", product: "Interior White Paint", qty: 2, uom: "Tins", reason: "Leakage", restockingPct: 0, refund: 430, disposition: "Quarantine", status: "Pending Manager PIN" },
];

/* ================= 24. Vehicles ================= */
export const SEED_VEHICLES = [
  { code: "VEH-001", name: "Heavy Replenishment Truck", type: "Heavy Truck", capacityTons: 25, location: "Central Riyadh Stock Location", driver: null as string | null, status: "Available" },
  { code: "VEH-002", name: "Riyadh Flatbed 07", type: "Flatbed Truck", capacityTons: 12, location: "Riyadh Main Branch", driver: "Hamad Al-Qahtani", status: "Assigned" },
  { code: "VEH-003", name: "Customer Delivery Van 02", type: "Delivery Van", capacityTons: 1.8, location: "Riyadh Main Branch", driver: null, status: "Available" },
  { code: "VEH-004", name: "Aggregate Tipper 01", type: "Tipper Truck", capacityTons: 20, location: "Riyadh Main Branch", driver: null, status: "Available" },
  { code: "VEH-005", name: "Protected Materials Box Truck", type: "Box Truck", capacityTons: 7, location: "Jeddah Branch", driver: null, status: "Available" },
];

/* ================= 25. Delivery orders ================= */
export const SEED_DELIVERY_ORDERS = [
  { no: "DO-2026-1021", movement: "Branch to Project Site", customer: "Al Noor Contracting Company", project: "PRJ-RYD-221", source: "Riyadh Main Branch", destination: "PRJ-RYD-221 Site", materials: "40 Cement Bags · 12 Steel Bundles", weightTons: 7.8, vehicle: "VEH-002", driver: "Hamad Al-Qahtani", status: "Assigned" },
  { no: "DO-2026-1022", movement: "Branch to Customer", customer: "Faisal Ahmed", project: null as string | null, source: "Riyadh Main Branch", destination: "Olaya, Riyadh", materials: "32 Tile Boxes", weightTons: 1.9, vehicle: null as string | null, driver: null as string | null, status: "Pending" },
  { no: "DO-2026-1023", movement: "Branch to Customer", customer: "Modern Villas Establishment", project: null, source: "Riyadh Main Branch", destination: "Al Malqa, Riyadh", materials: "16 Paint Tins · 8 Tools", weightTons: 0.85, vehicle: "VEH-003", driver: "Saad Al-Dossari", status: "Dispatched" },
  { no: "DO-2026-1024", movement: "Warehouse to Branch", customer: null as string | null, project: null, source: "Central Riyadh Stock Location", destination: "Riyadh Main Branch", materials: "10 Cement Pallets · 20 Steel Bundles", weightTons: 18.4, vehicle: "VEH-001", driver: "Khaled Al-Harthi", status: "In Transit" },
  { no: "DO-2026-1025", movement: "Failed Delivery Return", customer: "Abdullah Saleh", project: null, source: "Dammam Road, Riyadh", destination: "Riyadh Main Branch", materials: "48 Plumbing Pieces", weightTons: 0.55, vehicle: "VEH-003", driver: "Saad Al-Dossari", status: "Returned to Branch" },
];

/* ================= 26. Loyalty ================= */
export const SEED_LOYALTY = [
  { code: "LOY-1001", customerId: 1001, customer: "Faisal Ahmed", tier: "Silver", points: 18650, sarEquivalent: 186.5, expiringPoints: 2000, nextTier: "Gold", owner: "Individual" },
  { code: "LOY-1002", customerId: 1012, customer: "Al Noor Contracting Company", tier: "Platinum", points: 296000, sarEquivalent: 2960, expiringPoints: 0, nextTier: null as string | null, owner: "Company Account" },
  { code: "LOY-1003", customerId: 1005, customer: "Abdullah Saleh", tier: "Bronze", points: 2400, sarEquivalent: 24, expiringPoints: 0, nextTier: "Silver", owner: "Individual" },
];

/* ================= 27. Rule engine ================= */
export const SEED_RULES = [
  { code: "RULE-STK-001", name: "High Stock Adjustment Approval", trigger: "Stock Adjustment Submitted", condition: "Adjustment Value > SAR 5,000", action: "Require Maker-Checker", approvers: ["Inventory Manager"], status: "Active" },
  { code: "RULE-PO-002", name: "High-Value Purchase Order", trigger: "Purchase Order Submitted", condition: "Purchase Order Amount >= SAR 100,000", action: "Multi-level Approval", approvers: ["Procurement Manager", "Finance Manager", "Store Manager"], status: "Active" },
  { code: "RULE-RET-003", name: "Customized Product Return Block", trigger: "Return Item Selected", condition: "Custom Product = Yes OR Cut-to-Size = Yes", action: "Block Return", approvers: [], status: "Active" },
  { code: "RULE-CRD-004", name: "Contractor Credit Hold", trigger: "Account Credit Selected", condition: "Overdue Amount > SAR 10,000", action: "Require Finance Approval", approvers: ["Finance Manager"], status: "Active" },
];

/* ================= 28. Approvals ================= */
export const SEED_APPROVALS = [
  { no: "APR-2026-0881", module: "Stock Taking", record: "STK-TAKE-2026-0040", maker: "Noura Al-Salem", checker: "Abdullah Al-Rashid", amount: null as number | null, detail: "Variance -24 Units", levels: [], status: "Pending Checker" },
  { no: "APR-2026-0882", module: "Purchase Orders", record: "PO-2026-0568", maker: "Maha Al-Rashid", checker: null as string | null, amount: 148500, detail: "High-value PO (RULE-PO-002)", levels: [{ level: 1, role: "Procurement Manager", status: "Approved" }, { level: 2, role: "Finance Manager", status: "Pending" }, { level: 3, role: "Store Manager", status: "Not Started" }], status: "In Progress" },
  { no: "APR-2026-0883", module: "Returns", record: "RET-224", maker: "Sara Al-Otaibi", checker: "Ahmed Al-Harbi", amount: 430, detail: "Damaged claim refund", levels: [], status: "Pending" },
];

/* ================= 29. Dashboard KPI seed ================= */
export const SEED_DASHBOARD_KPIS = {
  todaysMaterialSales: 48920,
  netSales: 44380,
  transactions: 286,
  averageBasket: 171,
  lowStockSkus: 34,
  outOfStockSkus: 11,
  pendingDeliveries: 18,
  openCashierShifts: 6,
  activeTerminals: 5,
  offlineTerminals: 1,
  pendingApprovals: 6,
  quarantineUnits: 27,
  openPurchaseOrders: 9,
  pendingStockTransfers: 4,
};
