import type { Severity } from "./format";

export const statusBar = {
  business: "Mi Money Mart ECR — Building Materials",
  branch: "Riyadh Main Branch",
  terminal: "POS-01",
  user: "Ahmed Al-Harbi",
  role: "Store Manager",
  businessDate: "02 July 2026",
  shift: "Open",
  sync: "Online",
  zatca: "Connected",
  currency: "SAR / ر.س",
  lastUpdated: "02:45 PM",
};

export const kpis = [
  { key: "sales", title: "Today's Sales", value: "48,920 ر.س", sub: "+18% vs yesterday", tone: "success" as Severity, icon: "trending" },
  { key: "net", title: "Net Sales", value: "44,380 ر.س", sub: "After returns & discounts", tone: "info" as Severity, icon: "receipt" },
  { key: "tx", title: "Transactions", value: "286 Orders", sub: "Avg Basket: 171 ر.س", tone: "info" as Severity, icon: "cart" },
  { key: "vat", title: "VAT Collected", value: "6,380 ر.س", sub: "ZATCA synced", tone: "success" as Severity, icon: "shield" },
  { key: "low", title: "Low Stock Items", value: "34 SKUs", sub: "12 critical", tone: "warning" as Severity, icon: "package" },
  { key: "del", title: "Pending Deliveries", value: "18 Orders", sub: "5 due today", tone: "warning" as Severity, icon: "truck" },
  { key: "shift", title: "Open Shifts", value: "6 Cashiers", sub: "2 terminals idle", tone: "info" as Severity, icon: "users" },
  { key: "alerts", title: "Failed Sync / ZATCA", value: "3 Alerts", sub: "Needs review", tone: "critical" as Severity, icon: "alert" },
];

export const hourlySales = [
  { time: "08:00", gross: 3200, net: 3050, returns: 0, vat: 420 },
  { time: "09:00", gross: 5750, net: 5400, returns: 150, vat: 705 },
  { time: "10:00", gross: 8450, net: 7900, returns: 250, vat: 1020 },
  { time: "11:00", gross: 6300, net: 6050, returns: 0, vat: 810 },
  { time: "12:00", gross: 13900, net: 12850, returns: 450, vat: 1660 },
  { time: "13:00", gross: 9600, net: 8950, returns: 300, vat: 1150 },
  { time: "14:00", gross: 7200, net: 6950, returns: 100, vat: 925 },
  { time: "15:00", gross: 10800, net: 10200, returns: 250, vat: 1330 },
  { time: "16:00", gross: 8400, net: 7980, returns: 180, vat: 1040 },
  { time: "17:00", gross: 11750, net: 10900, returns: 400, vat: 1420 },
  { time: "18:00", gross: 12570, net: 11600, returns: 520, vat: 1510 },
];

export const topCategories = [
  { name: "Cement & Aggregates", sales: 14500, units: "420 Bags", ret: "1.5%", health: "Low" as const, icon: "layers" },
  { name: "Steel & Rebar", sales: 10800, units: "74 Bundles", ret: "0.8%", health: "Healthy" as const, icon: "bar" },
  { name: "Tiles & Flooring", sales: 8900, units: "185 Boxes", ret: "3.2%", health: "Low" as const, icon: "grid" },
  { name: "Paint & Chemicals", sales: 6200, units: "96 Cans", ret: "2.1%", health: "Critical" as const, icon: "paint" },
  { name: "Plumbing", sales: 4100, units: "215 Items", ret: "1.0%", health: "Healthy" as const, icon: "pipe" },
  { name: "Electrical", sales: 3700, units: "188 Items", ret: "0.5%", health: "Healthy" as const, icon: "zap" },
  { name: "Hardware & Tools", sales: 2950, units: "132 Items", ret: "1.8%", health: "Healthy" as const, icon: "hammer" },
  { name: "Glass & Aluminum", sales: 2100, units: "28 Panels", ret: "0.0%", health: "Normal" as const, icon: "square" },
];

export const inventorySummary = [
  { label: "Available Stock", value: "12,850 Items" },
  { label: "Reserved Stock", value: "1,240 Items" },
  { label: "Low Stock SKUs", value: "34 SKUs" },
  { label: "Out of Stock", value: "11 SKUs" },
  { label: "Quarantine / Damaged", value: "27 Items" },
  { label: "Stock Value", value: "1,284,500 ر.س" },
  { label: "Pending Transfers", value: "9 Transfers" },
  { label: "Expiring Alerts", value: "7 Items" },
];

export const lowStock = [
  { sku: "CEM-OPC-50KG", name: "OPC Cement 50KG", cat: "Cement", branch: "Riyadh", qty: "22 Bags", reorder: "100 Bags", supplier: "Al Noor Cement Co.", status: "Critical" as Severity },
  { sku: "TILE-GRY-60X60", name: "Grey Tile 60x60", cat: "Tiles", branch: "Jeddah", qty: "8 Boxes", reorder: "50 Boxes", supplier: "Saudi Tiles Trading", status: "Critical" as Severity },
  { sku: "PAINT-WHT-20L", name: "White Paint 20L", cat: "Paint", branch: "Riyadh", qty: "5 Cans", reorder: "30 Cans", supplier: "ColorPro Paints", status: "Critical" as Severity },
  { sku: "STEEL-RBR-12MM", name: "Steel Rebar 12MM", cat: "Steel", branch: "Riyadh", qty: "16 Bundles", reorder: "40 Bundles", supplier: "Gulf Steel Supply", status: "warning" as Severity },
  { sku: "PVC-PIPE-2IN", name: "PVC Pipe 2 Inch", cat: "Plumbing", branch: "Dammam", qty: "34 Pieces", reorder: "80 Pieces", supplier: "FlowLine Trading", status: "warning" as Severity },
  { sku: "ELEC-CBL-2.5MM", name: "Electric Cable 2.5MM", cat: "Electrical", branch: "Riyadh", qty: "90 Meters", reorder: "250 Meters", supplier: "PowerMax Electrical", status: "warning" as Severity },
];

export const terminals = [
  { term: "POS-01", cashier: "Ahmed Al-Harbi", start: "08:00 AM", tx: 72, sales: "12,400 ر.س", cash: "6,500 ر.س", sync: "Online", status: "Active" as Severity },
  { term: "POS-02", cashier: "Fahad Al-Qahtani", start: "09:00 AM", tx: 46, sales: "8,900 ر.س", cash: "3,200 ر.س", sync: "Online", status: "Active" as Severity },
  { term: "POS-03", cashier: "Sara Al-Otaibi", start: "08:30 AM", tx: 0, sales: "0 ر.س", cash: "1,000 ر.س", sync: "45 min ago", status: "Offline" as Severity },
  { term: "POS-04", cashier: "Khalid Al-Mutairi", start: "10:00 AM", tx: 58, sales: "9,750 ر.س", cash: "4,800 ر.س", sync: "Online", status: "Active" as Severity },
  { term: "POS-05", cashier: "Noura Al-Salem", start: "11:00 AM", tx: 34, sales: "5,850 ر.س", cash: "2,100 ر.س", sync: "Online", status: "Idle" as Severity },
  { term: "POS-06", cashier: "Abdullah Al-Rashid", start: "08:15 AM", tx: 76, sales: "12,020 ر.س", cash: "5,600 ر.س", sync: "Online", status: "Active" as Severity },
];

export const shifts = [
  { id: "SH-1041", cashier: "Ahmed Al-Harbi", opening: 1000, cash: 5500, io: 0, expected: 6500, counted: 6500, variance: 0, status: "Open" },
  { id: "SH-1042", cashier: "Fahad Al-Qahtani", opening: 1000, cash: 2200, io: 0, expected: 3200, counted: 3190, variance: -10, status: "Open" },
  { id: "SH-1043", cashier: "Sara Al-Otaibi", opening: 1000, cash: 0, io: 0, expected: 1000, counted: 1000, variance: 0, status: "Offline" },
  { id: "SH-1044", cashier: "Khalid Al-Mutairi", opening: 1000, cash: 3800, io: 0, expected: 4800, counted: 4760, variance: -40, status: "Needs Review" },
];

export const deliveryChips = [
  { label: "Pending", value: 18, tone: "warning" as Severity },
  { label: "Assigned", value: 9, tone: "info" as Severity },
  { label: "Dispatched", value: 6, tone: "info" as Severity },
  { label: "Delivered Today", value: 22, tone: "success" as Severity },
  { label: "Failed", value: 2, tone: "critical" as Severity },
  { label: "Returned to Branch", value: 1, tone: "muted" as Severity },
];

export const deliveries = [
  { no: "DO-1021", order: "ORD-8091", customer: "Al Noor Contracting", area: "Riyadh North", items: "Steel + Cement", time: "04:00 PM", driver: "Driver 03", status: "Assigned" as Severity, amount: "7,850 ر.س" },
  { no: "DO-1022", order: "ORD-8092", customer: "Walk-in Customer", area: "Olaya", items: "Tiles", time: "06:00 PM", driver: "Not Assigned", status: "Pending" as Severity, amount: "2,300 ر.س" },
  { no: "DO-1023", order: "ORD-8093", customer: "Modern Villas Est.", area: "Al Malqa", items: "Paint + Tools", time: "05:30 PM", driver: "Driver 01", status: "Dispatched" as Severity, amount: "4,780 ر.س" },
  { no: "DO-1024", order: "ORD-8094", customer: "Gulf Build Co.", area: "Exit 8", items: "Cement Pallets", time: "03:00 PM", driver: "Driver 04", status: "Delivered" as Severity, amount: "11,500 ر.س" },
  { no: "DO-1025", order: "ORD-8095", customer: "Abdullah Trading", area: "Dammam Road", items: "Plumbing Items", time: "07:00 PM", driver: "Driver 02", status: "Failed" as Severity, amount: "1,950 ر.س" },
];

export const alerts = [
  { severity: "critical" as Severity, module: "Stock", msg: "OPC Cement 50KG is below reorder level in Riyadh branch", age: "12 min", owner: "Inventory Manager", action: "Create PO" },
  { severity: "critical" as Severity, module: "Network", msg: "POS-03 offline for 45 minutes", age: "45 min", owner: "IT Support", action: "Check Terminal" },
  { severity: "warning" as Severity, module: "ZATCA", msg: "Invoice INV-2026-00891 failed submission", age: "18 min", owner: "Finance Manager", action: "Retry" },
  { severity: "warning" as Severity, module: "Delivery", msg: "Delivery DO-1017 is overdue", age: "1 hr", owner: "Dispatch Supervisor", action: "Assign Driver" },
  { severity: "critical" as Severity, module: "Cashier Shift", msg: "Cash variance detected in Shift SH-1044", age: "25 min", owner: "Store Manager", action: "Review" },
  { severity: "warning" as Severity, module: "Returns", msg: "Damaged return RET-224 awaiting approval", age: "35 min", owner: "Supervisor", action: "Approve" },
  { severity: "info" as Severity, module: "Supplier", msg: "PO-558 expected delivery today", age: "2 hr", owner: "Inventory Manager", action: "View PO" },
];

export const payments = [
  { method: "Cash", amount: 16200, tx: 96, refunds: 1250, status: "Reconciled" },
  { method: "Mada / Card", amount: 21450, tx: 122, refunds: 980, status: "Pending Settlement" },
  { method: "Wallet", amount: 3800, tx: 24, refunds: 0, status: "Reconciled" },
  { method: "Bank Transfer", amount: 2100, tx: 7, refunds: 0, status: "Pending Confirmation" },
  { method: "Account Credit", amount: 5370, tx: 18, refunds: 420, status: "Posted" },
  { method: "Loyalty Points", amount: 620, tx: 19, refunds: 0, status: "Posted" },
];

export const returnsSummary = [
  { label: "Total Returns", value: "3,240 ر.س" },
  { label: "Standard Returns", value: "1,350 ر.س" },
  { label: "Damaged Returns", value: "9 Items" },
  { label: "Surplus Returns", value: "14 Items" },
  { label: "VAT Reversal", value: "422 ر.س" },
  { label: "Restocking Fees", value: "180 ر.س" },
  { label: "Pending Approvals", value: "3" },
  { label: "Quarantine Added", value: "17 Items" },
];

export const returns = [
  { id: "RET-221", inv: "INV-2026-00871", customer: "Walk-in Customer", type: "Standard", product: "PVC Pipe 2 Inch", amount: "180 ر.س", reason: "Wrong Size", status: "Completed" as Severity, by: "Fahad" },
  { id: "RET-222", inv: "INV-2026-00872", customer: "Al Noor Contracting", type: "Surplus", product: "OPC Cement 50KG", amount: "750 ر.س", reason: "Extra Material", status: "Completed" as Severity, by: "Ahmed" },
  { id: "RET-223", inv: "INV-2026-00873", customer: "Gulf Build Co.", type: "Damaged", product: "Grey Tile 60x60", amount: "920 ر.س", reason: "Broken Boxes", status: "Quarantine" as Severity, by: "Khalid" },
  { id: "RET-224", inv: "INV-2026-00880", customer: "Modern Villas Est.", type: "Damaged", product: "White Paint 20L", amount: "430 ر.س", reason: "Leakage", status: "Pending Approval" as Severity, by: "—" },
  { id: "RET-225", inv: "INV-2026-00885", customer: "Walk-in Customer", type: "Exchange", product: "Electric Cable", amount: "960 ر.س", reason: "Wrong Specification", status: "Completed" as Severity, by: "Sara" },
];

export const branches = [
  { branch: "Riyadh Main", sales: "48,920 ر.س", tx: 286, returns: "3,240 ر.س", basket: "171 ر.س", low: 34, shifts: 6 },
  { branch: "Jeddah Branch", sales: "31,450 ر.س", tx: 184, returns: "1,870 ر.س", basket: "170 ر.س", low: 18, shifts: 4 },
  { branch: "Dammam Branch", sales: "22,800 ر.س", tx: 119, returns: "920 ر.س", basket: "191 ر.س", low: 11, shifts: 3 },
  { branch: "Makkah Branch", sales: "18,600 ر.س", tx: 96, returns: "740 ر.س", basket: "193 ر.س", low: 8, shifts: 2 },
  { branch: "Madinah Branch", sales: "15,980 ر.س", tx: 84, returns: "610 ر.س", basket: "190 ر.س", low: 6, shifts: 2 },
];

export const zatcaInvoices = [
  { no: "INV-2026-00888", order: "ORD-8088", type: "Simplified Tax Invoice", amount: "1,250 ر.س", vat: "163 ر.س", status: "Cleared" as Severity, err: "—", action: "View" },
  { no: "INV-2026-00889", order: "ORD-8089", type: "Full Tax Invoice", amount: "7,850 ر.س", vat: "1,024 ر.س", status: "Cleared" as Severity, err: "—", action: "View" },
  { no: "INV-2026-00890", order: "ORD-8090", type: "Simplified Tax Invoice", amount: "430 ر.س", vat: "56 ر.س", status: "Queued Offline" as Severity, err: "SYNC-001", action: "Retry" },
  { no: "INV-2026-00891", order: "ORD-8091", type: "Full Tax Invoice", amount: "11,500 ر.س", vat: "1,500 ر.س", status: "Failed" as Severity, err: "ZATCA-403", action: "Retry" },
  { no: "INV-2026-00892", order: "ORD-8092", type: "Simplified Tax Invoice", amount: "2,300 ر.س", vat: "300 ر.س", status: "Submitted" as Severity, err: "—", action: "View" },
];

export const quickActions = [
  { label: "Start New Sale", badge: null, icon: "plus" },
  { label: "Recall Parked", badge: 7, icon: "history" },
  { label: "New Quotation", badge: null, icon: "file" },
  { label: "Stock Check", badge: null, icon: "search" },
  { label: "Delivery Queue", badge: 18, icon: "truck" },
  { label: "View Reports", badge: null, icon: "chart" },
  { label: "Sync ZATCA", badge: 3, icon: "refresh" },
  { label: "Close Shift", badge: "6 Open", icon: "power" },
];

export const filters = {
  dateRange: ["Today", "Yesterday", "Last 7 Days", "This Month", "Custom"],
  branch: ["Riyadh Main", "Jeddah", "Dammam", "Makkah", "Madinah"],
  terminal: ["POS-01", "POS-02", "POS-03", "POS-04", "POS-05", "POS-06"],
  cashier: ["Ahmed", "Fahad", "Sara", "Khalid", "Noura", "Abdullah"],
  category: ["Cement", "Steel", "Tiles", "Paint", "Plumbing", "Electrical", "Hardware", "Glass"],
  payment: ["Cash", "Mada/Card", "Wallet", "Bank Transfer", "Account Credit", "Loyalty"],
  alertType: ["Stock", "Delivery", "ZATCA", "Network", "Cashier Shift", "Returns"],
  stockStatus: ["Available", "Low", "Critical", "Out of Stock", "Quarantine"],
  deliveryStatus: ["Pending", "Assigned", "Dispatched", "Delivered", "Failed"],
};