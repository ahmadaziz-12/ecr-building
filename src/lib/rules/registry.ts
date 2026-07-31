/**
 * Rule Engine Data Point Registry (BRD §81.3 / §81.8).
 *
 * This is the "backend registry" the rule builder reads from: every data point carries an ID, the
 * module it belongs to, a human label, the backend field path, its data type, the operators the
 * type allows and where its values come from. The builder never lets a user type a field name —
 * everything is picked from these lists.
 */

export type DataType =
  | "currency"
  | "number"
  | "percentage"
  | "text"
  | "enum"
  | "boolean"
  | "date"
  | "collection";

export type ValueSource =
  | "manual-number"
  | "manual-percentage"
  | "manual-text"
  | "date-picker"
  | "boolean"
  | "enum"
  | "category"
  | "brand"
  | "branch"
  | "user"
  | "role"
  | "product"
  | "supplier"
  | "uom";

export type DataPoint = {
  id: string;
  module: string;
  label: string;
  field: string;
  type: DataType;
  valueSource: ValueSource;
  options?: string[];
  sensitive?: boolean;
  active: boolean;
};

export const OPERATORS_BY_TYPE: Record<DataType, string[]> = {
  currency: ["Equals", "Does Not Equal", "Greater Than", "Greater Than or Equal To", "Less Than", "Less Than or Equal To", "Between", "Not Between", "In List", "Not In List", "Is Empty", "Is Not Empty"],
  number: ["Equals", "Does Not Equal", "Greater Than", "Greater Than or Equal To", "Less Than", "Less Than or Equal To", "Between", "Not Between", "In List", "Not In List", "Is Empty", "Is Not Empty"],
  percentage: ["Equals", "Greater Than", "Greater Than or Equal To", "Less Than", "Less Than or Equal To", "Between"],
  text: ["Equals", "Does Not Equal", "Contains", "Does Not Contain", "Starts With", "Ends With", "In List", "Not In List", "Is Empty", "Is Not Empty"],
  enum: ["Equals", "Does Not Equal", "In", "Not In", "Is Empty", "Is Not Empty"],
  boolean: ["Is True", "Is False"],
  date: ["On", "Before", "After", "On or Before", "On or After", "Between", "Within Last", "Within Next", "Is Today", "Is Overdue", "Is Empty", "Is Not Empty"],
  collection: ["Contains Any", "Contains All", "Does Not Contain", "Count Equals", "Count Greater Than", "Count Less Than"],
};

/** Operators that need no value control at all. */
export const NO_VALUE_OPERATORS = ["Is Empty", "Is Not Empty", "Is True", "Is False", "Is Today", "Is Overdue"];
/** Operators that need two values. */
export const RANGE_OPERATORS = ["Between", "Not Between"];
/** Operators that accept a list of values. */
export const LIST_OPERATORS = ["In List", "Not In List", "In", "Not In", "Contains Any", "Contains All"];

// ————————————————————————— Value-source option lists —————————————————————————

export const CATEGORIES = ["Cement & Binders", "Steel & Reinforcement", "Tiles & Stone", "Plumbing & Drainage", "Electrical & Lighting", "Power & Hand Tools", "Paints & Finishes", "Aggregates & Sand", "Safety & Site Supplies"];
export const BRANDS = ["Saudi Cement", "Yamama Cement", "SABIC Steel", "Al Ittefaq Steel", "Saudi Ceramics", "Alfanar Tiles", "Arabian Tiles", "Gulf Mosaic", "Jotun", "Bosch", "Makita"];
export const BRANCHES = ["Riyadh Main Branch", "Jeddah Branch", "Dammam Branch", "Khobar Building Materials Branch", "Central Warehouse"];
export const SUPPLIERS = ["Al Rajhi Building Supply", "Gulf Steel Trading", "Saudi Ceramics Co.", "Najd Cement Distribution", "Eastern Tools Import"];
export const UOMS = ["Bag", "Box", "Piece", "Ton", "Metre", "Litre", "Bundle", "Pallet", "Cubic Metre"];
export const PRODUCTS = [
  "CEM-OPC-50KG — Ordinary Portland Cement 50kg",
  "STEEL-RBR-12MM — Rebar 12mm × 12m",
  "TILE-GRY-60X60 — Grey Porcelain Tile 60×60",
  "TILE-WHT-60X60 — White Porcelain Tile 60×60",
  "TILE-BGE-30X60 — Beige Ceramic Tile 30×60",
  "TILE-MOS-BLU — Blue Mosaic Tile",
  "PLB-PVC-110 — PVC Drainage Pipe 110mm",
  "TOOL-DRL-18V — Cordless Drill 18V",
];

export const RULE_CATEGORIES = ["Sales", "Pricing", "Discounts", "Returns", "Customer Credit", "Loyalty", "Products", "Inventory", "Stock Adjustment", "Stock Taking", "Stock Transfer", "Purchase Orders", "Supplier Returns", "Delivery", "Payments", "Invoices", "Cashier Shift", "HR and Attendance", "Leave", "Users and Access", "Devices", "Approval"];

export const RULE_STATUSES = ["Draft", "Tested", "Pending Approval", "Active", "Inactive", "Expired", "Rejected"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const ACTION_TYPES = ["Allow", "Block", "Show Warning", "Require Approval", "Require Maker-Checker", "Assign Approval to Role", "Assign Approval to User", "Apply Discount", "Apply Price Tier", "Apply Restocking Fee", "Hold Transaction", "Hold Customer Credit", "Require PIN", "Require Reason Code", "Require Attachment", "Notify Role", "Notify User", "Create Task", "Create Alert", "Create Stock Adjustment", "Request Recount", "Prevent Posting", "Set Status", "Set Priority", "Restrict Payment Method", "Restrict Product", "Release Hold", "Escalate Approval"];

/** Actions that stop rule processing when matched. */
export const BLOCKING_ACTIONS = ["Block", "Prevent Posting", "Hold Transaction", "Restrict Product"];

// ————————————————————————— Trigger events —————————————————————————

export type TriggerEvent = { id: string; label: string; group: string; modules: string[] };

const ev = (group: string, label: string, modules: string[]): TriggerEvent => ({
  id: label.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
  label,
  group,
  modules,
});

export const TRIGGER_EVENTS: TriggerEvent[] = [
  ...["Sale Created", "Product Added to Cart", "Cart Quantity Changed", "Customer Attached", "Discount Requested", "Payment Started", "Payment Completed", "Sale Completed", "Sale Voided"].map((l) => ev("Sales Events", l, ["Sales", "Product", "Customer", "Inventory"])),
  ...["Return Created", "Return Item Selected", "Return Submitted", "Return Approval Requested", "Refund Requested", "Return Completed"].map((l) => ev("Return Events", l, ["Return", "Sales", "Product", "Customer"])),
  ...["Product Stock Updated", "Stock Falls Below Reorder Level", "Stock Adjustment Created", "Stock Adjustment Submitted", "Stock Adjustment Approved", "Stock Transfer Created", "Stock Transfer Dispatched", "Stock Transfer Received", "Stock Take Submitted", "Stock Take Variance Calculated", "Stock Take Approval Requested"].map((l) => ev("Inventory Events", l, ["Inventory", "Stock Adjustment", "Stock Taking", "Stock Transfer", "Product"])),
  ...["Purchase Order Created", "Purchase Order Submitted", "Purchase Order Amount Changed", "Purchase Order Approved", "Purchase Order Received", "Supplier Return Created"].map((l) => ev("Procurement Events", l, ["Purchase Order", "Supplier Return", "Product", "Inventory"])),
  ...["Delivery Created", "Driver Assigned", "Loading Completed", "Delivery Dispatched", "Delivery Failed", "Delivery Completed"].map((l) => ev("Delivery Events", l, ["Delivery", "Sales", "HR"])),
  ...["Employee Created", "Employee Checked In", "Employee Checked Out", "Employee Late", "Leave Submitted", "Leave Approved", "Document Expiring", "Contract Expiring"].map((l) => ev("HR Events", l, ["HR"])),
  ...["User Created", "Role Assigned", "Role Removed", "Permission Changed", "Failed Login", "Restricted Action Requested"].map((l) => ev("Access Events", l, ["User and Access"])),
];

export const EVENT_GROUPS = Array.from(new Set(TRIGGER_EVENTS.map((e) => e.group)));

// ————————————————————————— Data points —————————————————————————

let dpSeq = 0;
function dp(
  module: string,
  prefix: string,
  label: string,
  field: string,
  type: DataType,
  valueSource: ValueSource,
  options?: string[],
  sensitive = false
): DataPoint {
  dpSeq += 1;
  return {
    id: `DP-${prefix}-${String(dpSeq).padStart(3, "0")}`,
    module,
    label,
    field,
    type,
    valueSource,
    options,
    sensitive,
    active: true,
  };
}

export const DATA_POINTS: DataPoint[] = [
  // Sales
  dp("Sales", "SAL", "Sale Type", "sale.type", "enum", "enum", ["Cash Sale", "Credit Sale", "Quotation", "Delivery Sale", "Project Sale"]),
  dp("Sales", "SAL", "Sale Status", "sale.status", "enum", "enum", ["Draft", "Held", "Completed", "Voided", "Refunded"]),
  dp("Sales", "SAL", "Transaction Amount", "sale.totalAmount", "currency", "manual-number"),
  dp("Sales", "SAL", "Subtotal", "sale.subtotal", "currency", "manual-number"),
  dp("Sales", "SAL", "VAT Amount", "sale.vatAmount", "currency", "manual-number"),
  dp("Sales", "SAL", "Discount Percentage", "sale.discountPercent", "percentage", "manual-percentage"),
  dp("Sales", "SAL", "Discount Amount", "sale.discountAmount", "currency", "manual-number"),
  dp("Sales", "SAL", "Line Discount Percentage", "saleLine.discountPercent", "percentage", "manual-percentage"),
  dp("Sales", "SAL", "Quantity", "saleLine.quantity", "number", "manual-number"),
  dp("Sales", "SAL", "UOM", "saleLine.uom", "enum", "uom"),
  dp("Sales", "SAL", "Payment Method", "payment.method", "enum", "enum", ["Cash", "Card", "Bank Transfer", "Account Credit", "Wallet", "Loyalty Points", "Split"]),
  dp("Sales", "SAL", "Payment Status", "payment.status", "enum", "enum", ["Pending", "Partial", "Paid", "Failed", "Refunded"]),
  dp("Sales", "SAL", "Remaining Balance", "payment.remainingBalance", "currency", "manual-number"),
  dp("Sales", "SAL", "Cash Amount", "payment.cashAmount", "currency", "manual-number"),
  dp("Sales", "SAL", "Card Amount", "payment.cardAmount", "currency", "manual-number"),
  dp("Sales", "SAL", "Account Credit Amount", "payment.creditAmount", "currency", "manual-number"),
  dp("Sales", "SAL", "Loyalty Redemption Amount", "payment.loyaltyAmount", "currency", "manual-number"),
  dp("Sales", "SAL", "Branch", "sale.branch", "enum", "branch"),
  dp("Sales", "SAL", "Terminal", "sale.terminal", "enum", "enum", ["POS-RYD-01", "POS-RYD-02", "POS-JED-01", "POS-DMM-01"]),
  dp("Sales", "SAL", "Cashier", "sale.cashier", "enum", "user"),
  dp("Sales", "SAL", "Customer", "sale.customer", "text", "manual-text"),
  dp("Sales", "SAL", "Customer Type", "customer.type", "enum", "enum", ["Walk-in", "Retail", "Contractor", "Corporate", "Government", "Project"]),
  dp("Sales", "SAL", "Customer Price Tier", "customer.priceTier", "enum", "enum", ["Retail", "Trade", "Contractor", "Project", "Wholesale"]),
  dp("Sales", "SAL", "Project Code", "sale.projectCode", "text", "manual-text"),
  dp("Sales", "SAL", "PO Reference", "sale.poReference", "text", "manual-text"),
  dp("Sales", "SAL", "Delivery Required", "sale.deliveryRequired", "boolean", "boolean"),
  dp("Sales", "SAL", "Offline Transaction", "sale.offline", "boolean", "boolean"),

  // Product
  dp("Product", "PRD", "Product", "product.name", "enum", "product"),
  dp("Product", "PRD", "SKU", "product.sku", "enum", "product"),
  dp("Product", "PRD", "Barcode", "product.barcode", "text", "manual-text"),
  dp("Product", "PRD", "Category", "product.category", "enum", "category"),
  dp("Product", "PRD", "Subcategory", "product.subcategory", "text", "manual-text"),
  dp("Product", "PRD", "Brand", "product.brand", "enum", "brand"),
  dp("Product", "PRD", "Supplier", "product.supplier", "enum", "supplier"),
  dp("Product", "PRD", "Product Status", "product.status", "enum", "enum", ["Active", "Inactive", "Discontinued", "Blocked"]),
  dp("Product", "PRD", "Stock UOM", "product.stockUom", "enum", "uom"),
  dp("Product", "PRD", "Selling UOM", "product.sellingUom", "enum", "uom"),
  dp("Product", "PRD", "Selling Price", "product.sellingPrice", "currency", "manual-number"),
  dp("Product", "PRD", "Cost Price", "product.costPrice", "currency", "manual-number", undefined, true),
  dp("Product", "PRD", "VAT Rate", "product.vatRate", "percentage", "manual-percentage"),
  dp("Product", "PRD", "Loyalty Class", "product.loyaltyClass", "enum", "enum", ["Standard", "Bonus", "Excluded"]),
  dp("Product", "PRD", "Credit Eligible", "product.creditEligible", "boolean", "boolean"),
  dp("Product", "PRD", "Returnable", "product.returnable", "boolean", "boolean"),
  dp("Product", "PRD", "Custom Product", "product.isCustom", "boolean", "boolean"),
  dp("Product", "PRD", "Cut-to-Size", "product.isCutToSize", "boolean", "boolean"),
  dp("Product", "PRD", "Serial Tracked", "product.serialTracked", "boolean", "boolean"),
  dp("Product", "PRD", "Delivery Eligible", "product.deliveryEligible", "boolean", "boolean"),
  dp("Product", "PRD", "Minimum Selling Price", "product.minSellingPrice", "currency", "manual-number", undefined, true),

  // Customer
  dp("Customer", "CUS", "Customer Type", "customer.type", "enum", "enum", ["Walk-in", "Retail", "Contractor", "Corporate", "Government", "Project"]),
  dp("Customer", "CUS", "Customer Status", "customer.status", "enum", "enum", ["Active", "Inactive", "Blocked", "On Hold"]),
  dp("Customer", "CUS", "Customer Price Tier", "customer.priceTier", "enum", "enum", ["Retail", "Trade", "Contractor", "Project", "Wholesale"]),
  dp("Customer", "CUS", "Credit Enabled", "customer.creditEnabled", "boolean", "boolean"),
  dp("Customer", "CUS", "Credit Limit", "customer.creditLimit", "currency", "manual-number"),
  dp("Customer", "CUS", "Used Credit", "customer.usedCredit", "currency", "manual-number"),
  dp("Customer", "CUS", "Available Credit", "customer.availableCredit", "currency", "manual-number"),
  dp("Customer", "CUS", "Overdue Amount", "customer.overdueAmount", "currency", "manual-number"),
  dp("Customer", "CUS", "Payment Terms", "customer.paymentTerms", "enum", "enum", ["Immediate", "Net 15", "Net 30", "Net 45", "Net 60"]),
  dp("Customer", "CUS", "Loyalty Tier", "customer.loyaltyTier", "enum", "enum", ["Bronze", "Silver", "Gold", "Platinum"]),
  dp("Customer", "CUS", "Loyalty Points", "customer.loyaltyPoints", "number", "manual-number"),
  dp("Customer", "CUS", "Cumulative Spend", "customer.cumulativeSpend", "currency", "manual-number"),
  dp("Customer", "CUS", "Preferred Brand", "customer.preferredBrand", "enum", "brand"),
  dp("Customer", "CUS", "Project Required", "customer.projectRequired", "boolean", "boolean"),
  dp("Customer", "CUS", "PO Required", "customer.poRequired", "boolean", "boolean"),
  dp("Customer", "CUS", "Customer Blocked", "customer.blocked", "boolean", "boolean"),
  dp("Customer", "CUS", "Customer Branch", "customer.branch", "enum", "branch"),

  // Inventory
  dp("Inventory", "INV", "On-Hand Quantity", "stock.onHandQty", "number", "manual-number"),
  dp("Inventory", "INV", "Available Quantity", "stock.availableQty", "number", "manual-number"),
  dp("Inventory", "INV", "Reserved Quantity", "stock.reservedQty", "number", "manual-number"),
  dp("Inventory", "INV", "Quarantine Quantity", "stock.quarantineQty", "number", "manual-number"),
  dp("Inventory", "INV", "Reorder Level", "stock.reorderLevel", "number", "manual-number"),
  dp("Inventory", "INV", "Reorder Quantity", "stock.reorderQty", "number", "manual-number"),
  dp("Inventory", "INV", "Stock Status", "stock.status", "enum", "enum", ["In Stock", "Low Stock", "Out of Stock", "Quarantined"]),
  dp("Inventory", "INV", "Branch", "stock.branch", "enum", "branch"),
  dp("Inventory", "INV", "Product", "stock.product", "enum", "product"),
  dp("Inventory", "INV", "SKU", "stock.sku", "enum", "product"),
  dp("Inventory", "INV", "Category", "stock.category", "enum", "category"),
  dp("Inventory", "INV", "Brand", "stock.brand", "enum", "brand"),
  dp("Inventory", "INV", "Last Stock Movement Date", "stock.lastMovementDate", "date", "date-picker"),
  dp("Inventory", "INV", "Last Purchase Cost", "stock.lastPurchaseCost", "currency", "manual-number", undefined, true),
  dp("Inventory", "INV", "Material Expiry Date", "stock.expiryDate", "date", "date-picker"),
  dp("Inventory", "INV", "Days Until Expiry", "stock.daysUntilExpiry", "number", "manual-number"),

  // Stock Adjustment
  dp("Stock Adjustment", "STK-ADJ", "Adjustment Type", "stockAdjustment.type", "enum", "enum", ["Increase", "Decrease", "Write-Off", "Reclassification", "Stock Take Correction"]),
  dp("Stock Adjustment", "STK-ADJ", "Adjustment Quantity", "stockAdjustment.quantity", "number", "manual-number"),
  dp("Stock Adjustment", "STK-ADJ", "Adjustment Value", "stockAdjustment.totalValue", "currency", "manual-number", undefined, true),
  dp("Stock Adjustment", "STK-ADJ", "Product", "stockAdjustment.product", "enum", "product"),
  dp("Stock Adjustment", "STK-ADJ", "Category", "stockAdjustment.category", "enum", "category"),
  dp("Stock Adjustment", "STK-ADJ", "Branch", "stockAdjustment.branch", "enum", "branch"),
  dp("Stock Adjustment", "STK-ADJ", "Reason Code", "stockAdjustment.reasonCode", "enum", "enum", ["Breakage", "Damage", "Theft / Loss", "Count Correction", "Expiry", "Internal Use", "Other"]),
  dp("Stock Adjustment", "STK-ADJ", "Current Stock", "stockAdjustment.currentStock", "number", "manual-number"),
  dp("Stock Adjustment", "STK-ADJ", "Stock After Adjustment", "stockAdjustment.stockAfter", "number", "manual-number"),
  dp("Stock Adjustment", "STK-ADJ", "Quarantine Impact", "stockAdjustment.quarantineImpact", "boolean", "boolean"),
  dp("Stock Adjustment", "STK-ADJ", "Requested By", "stockAdjustment.requestedBy", "enum", "user"),
  dp("Stock Adjustment", "STK-ADJ", "Approval Status", "stockAdjustment.approvalStatus", "enum", "enum", ["Not Required", "Pending", "Approved", "Rejected"]),
  dp("Stock Adjustment", "STK-ADJ", "Attachment Added", "stockAdjustment.hasAttachment", "boolean", "boolean"),

  // Stock Taking
  dp("Stock Taking", "STK-TAK", "Stock Take Type", "stockTake.countType", "enum", "enum", ["Full Count", "Cycle Count", "Category Count", "Spot Count", "Recount"]),
  dp("Stock Taking", "STK-TAK", "Stock Take Scope", "stockTake.scope", "enum", "enum", ["All Products", "Selected Categories", "Selected Brands", "Selected SKUs", "Low-Stock Products", "High-Value Products", "Quarantine Stock"]),
  dp("Stock Taking", "STK-TAK", "Branch", "stockTake.branch", "enum", "branch"),
  dp("Stock Taking", "STK-TAK", "Category", "stockTake.category", "enum", "category"),
  dp("Stock Taking", "STK-TAK", "Assigned Counter", "stockTake.assignedCounter", "enum", "user"),
  dp("Stock Taking", "STK-TAK", "Maker", "stockTake.maker", "enum", "user"),
  dp("Stock Taking", "STK-TAK", "Checker", "stockTake.checker", "enum", "user"),
  dp("Stock Taking", "STK-TAK", "Total SKUs", "stockTake.totalSkus", "number", "manual-number"),
  dp("Stock Taking", "STK-TAK", "Counted SKUs", "stockTake.countedSkus", "number", "manual-number"),
  dp("Stock Taking", "STK-TAK", "Remaining SKUs", "stockTake.remainingSkus", "number", "manual-number"),
  dp("Stock Taking", "STK-TAK", "Variance SKU Count", "stockTake.varianceSkuCount", "number", "manual-number"),
  dp("Stock Taking", "STK-TAK", "Positive Variance Quantity", "stockTake.positiveVarianceQty", "number", "manual-number"),
  dp("Stock Taking", "STK-TAK", "Negative Variance Quantity", "stockTake.negativeVarianceQty", "number", "manual-number"),
  dp("Stock Taking", "STK-TAK", "Variance Percentage", "stockTake.variancePercent", "percentage", "manual-percentage"),
  dp("Stock Taking", "STK-TAK", "Absolute Variance Quantity", "stockTake.absoluteVarianceQty", "number", "manual-number"),
  dp("Stock Taking", "STK-TAK", "Recount Required", "stockTake.recountRequired", "boolean", "boolean"),
  dp("Stock Taking", "STK-TAK", "Blind Count Enabled", "stockTake.blindCount", "boolean", "boolean"),
  dp("Stock Taking", "STK-TAK", "Stock Take Status", "stockTake.status", "enum", "enum", ["Draft", "Scheduled", "In Progress", "Submitted", "Recount Required", "Pending Checker", "Approved", "Posted", "Rejected", "Cancelled"]),
  dp("Stock Taking", "STK-TAK", "Session Duration", "stockTake.durationMinutes", "number", "manual-number"),

  // Stock Transfer
  dp("Stock Transfer", "STK-TRF", "Transfer Status", "stockTransfer.status", "enum", "enum", ["Draft", "Requested", "Approved", "Dispatched", "In Transit", "Received", "Cancelled"]),
  dp("Stock Transfer", "STK-TRF", "Source Branch", "stockTransfer.sourceBranch", "enum", "branch"),
  dp("Stock Transfer", "STK-TRF", "Destination Branch", "stockTransfer.destinationBranch", "enum", "branch"),
  dp("Stock Transfer", "STK-TRF", "Requested Quantity", "stockTransfer.requestedQty", "number", "manual-number"),
  dp("Stock Transfer", "STK-TRF", "Approved Quantity", "stockTransfer.approvedQty", "number", "manual-number"),
  dp("Stock Transfer", "STK-TRF", "Dispatched Quantity", "stockTransfer.dispatchedQty", "number", "manual-number"),
  dp("Stock Transfer", "STK-TRF", "Received Quantity", "stockTransfer.receivedQty", "number", "manual-number"),
  dp("Stock Transfer", "STK-TRF", "Damaged Quantity", "stockTransfer.damagedQty", "number", "manual-number"),
  dp("Stock Transfer", "STK-TRF", "Missing Quantity", "stockTransfer.missingQty", "number", "manual-number"),
  dp("Stock Transfer", "STK-TRF", "Transfer Value", "stockTransfer.totalValue", "currency", "manual-number", undefined, true),
  dp("Stock Transfer", "STK-TRF", "Priority", "stockTransfer.priority", "enum", "enum", ["Low", "Normal", "High", "Urgent"]),
  dp("Stock Transfer", "STK-TRF", "Requested By", "stockTransfer.requestedBy", "enum", "user"),

  // Purchase Orders
  dp("Purchase Order", "PO", "Purchase Order Amount", "purchaseOrder.totalAmount", "currency", "manual-number"),
  dp("Purchase Order", "PO", "Supplier", "purchaseOrder.supplier", "enum", "supplier"),
  dp("Purchase Order", "PO", "Branch", "purchaseOrder.branch", "enum", "branch"),
  dp("Purchase Order", "PO", "Product", "purchaseOrder.product", "enum", "product"),
  dp("Purchase Order", "PO", "Category", "purchaseOrder.category", "enum", "category"),
  dp("Purchase Order", "PO", "Brand", "purchaseOrder.brand", "enum", "brand"),
  dp("Purchase Order", "PO", "Ordered Quantity", "purchaseOrder.orderedQty", "number", "manual-number"),
  dp("Purchase Order", "PO", "Unit Cost", "purchaseOrder.unitCost", "currency", "manual-number", undefined, true),
  dp("Purchase Order", "PO", "Cost Variance Percentage", "purchaseOrder.costVariancePercent", "percentage", "manual-percentage"),
  dp("Purchase Order", "PO", "Expected Delivery Date", "purchaseOrder.expectedDeliveryDate", "date", "date-picker"),
  dp("Purchase Order", "PO", "Payment Terms", "purchaseOrder.paymentTerms", "enum", "enum", ["Advance", "Net 15", "Net 30", "Net 45", "Net 60"]),
  dp("Purchase Order", "PO", "PO Status", "purchaseOrder.status", "enum", "enum", ["Draft", "Submitted", "Approved", "Partially Received", "Received", "Cancelled"]),
  dp("Purchase Order", "PO", "Requested By", "purchaseOrder.requestedBy", "enum", "user"),
  dp("Purchase Order", "PO", "Supplier Rating", "supplier.rating", "number", "manual-number"),
  dp("Purchase Order", "PO", "Supplier Fill Rate", "supplier.fillRate", "percentage", "manual-percentage"),

  // Supplier Returns
  dp("Supplier Return", "RTS", "RTS Amount", "supplierReturn.totalAmount", "currency", "manual-number"),
  dp("Supplier Return", "RTS", "Return Quantity", "supplierReturn.quantity", "number", "manual-number"),
  dp("Supplier Return", "RTS", "Supplier", "supplierReturn.supplier", "enum", "supplier"),
  dp("Supplier Return", "RTS", "Product", "supplierReturn.product", "enum", "product"),
  dp("Supplier Return", "RTS", "Reason", "supplierReturn.reason", "enum", "enum", ["Damaged on Arrival", "Wrong Item", "Quality Issue", "Expired", "Over-Supply"]),
  dp("Supplier Return", "RTS", "Credit Note Required", "supplierReturn.creditNoteRequired", "boolean", "boolean"),
  dp("Supplier Return", "RTS", "Credit Note Status", "supplierReturn.creditNoteStatus", "enum", "enum", ["Not Issued", "Requested", "Received", "Applied"]),
  dp("Supplier Return", "RTS", "RTS Status", "supplierReturn.status", "enum", "enum", ["Draft", "Submitted", "Approved", "Dispatched", "Completed", "Rejected"]),
  dp("Supplier Return", "RTS", "Damaged Product", "supplierReturn.damaged", "boolean", "boolean"),
  dp("Supplier Return", "RTS", "Original PO", "supplierReturn.originalPo", "text", "manual-text"),

  // Returns
  dp("Return", "RET", "Return Type", "return.type", "enum", "enum", ["Full Return", "Partial Return", "Exchange", "Damaged Return"]),
  dp("Return", "RET", "Return Reason", "return.reason", "enum", "enum", ["Damaged", "Wrong Item", "Customer Change of Mind", "Excess Material", "Quality Issue"]),
  dp("Return", "RET", "Return Quantity", "return.quantity", "number", "manual-number"),
  dp("Return", "RET", "Original Quantity", "return.originalQuantity", "number", "manual-number"),
  dp("Return", "RET", "Already Returned Quantity", "return.alreadyReturnedQuantity", "number", "manual-number"),
  dp("Return", "RET", "Refund Amount", "return.refundAmount", "currency", "manual-number"),
  dp("Return", "RET", "VAT Reversal", "return.vatReversal", "currency", "manual-number"),
  dp("Return", "RET", "Restocking Fee", "return.restockingFee", "currency", "manual-number"),
  dp("Return", "RET", "Product Returnable", "return.productReturnable", "boolean", "boolean"),
  dp("Return", "RET", "Custom Product", "return.customProduct", "boolean", "boolean"),
  dp("Return", "RET", "Cut-to-Size Product", "return.cutToSizeProduct", "boolean", "boolean"),
  dp("Return", "RET", "Return Window Days", "return.windowDays", "number", "manual-number"),
  dp("Return", "RET", "Days Since Sale", "return.daysSinceSale", "number", "manual-number"),
  dp("Return", "RET", "Refund Method", "return.refundMethod", "enum", "enum", ["Cash", "Card Reversal", "Store Credit", "Bank Transfer"]),
  dp("Return", "RET", "Return Status", "return.status", "enum", "enum", ["Draft", "Submitted", "Pending Approval", "Approved", "Completed", "Rejected"]),

  // Delivery
  dp("Delivery", "DEL", "Delivery Amount", "delivery.amount", "currency", "manual-number"),
  dp("Delivery", "DEL", "Delivery Fee", "delivery.fee", "currency", "manual-number"),
  dp("Delivery", "DEL", "Delivery Status", "delivery.status", "enum", "enum", ["Pending", "Assigned", "Loading", "Dispatched", "In Transit", "Delivered", "Failed", "Returned"]),
  dp("Delivery", "DEL", "Delivery Priority", "delivery.priority", "enum", "enum", ["Low", "Normal", "High", "Urgent"]),
  dp("Delivery", "DEL", "Estimated Weight", "delivery.estimatedWeightKg", "number", "manual-number"),
  dp("Delivery", "DEL", "Vehicle Capacity", "vehicle.capacityKg", "number", "manual-number"),
  dp("Delivery", "DEL", "Driver", "delivery.driver", "enum", "user"),
  dp("Delivery", "DEL", "Vehicle", "delivery.vehicle", "text", "manual-text"),
  dp("Delivery", "DEL", "Delivery Zone", "delivery.zone", "enum", "enum", ["Riyadh North", "Riyadh South", "Riyadh East", "Riyadh West", "Outside City"]),
  dp("Delivery", "DEL", "Promised Date", "delivery.promisedDate", "date", "date-picker"),
  dp("Delivery", "DEL", "Delivered Date", "delivery.deliveredDate", "date", "date-picker"),
  dp("Delivery", "DEL", "Delivery Delay Minutes", "delivery.delayMinutes", "number", "manual-number"),
  dp("Delivery", "DEL", "Failed Delivery Reason", "delivery.failureReason", "enum", "enum", ["Customer Unavailable", "Wrong Address", "Access Restricted", "Vehicle Breakdown", "Goods Rejected"]),
  dp("Delivery", "DEL", "Partial Delivery", "delivery.partial", "boolean", "boolean"),
  dp("Delivery", "DEL", "Stock Reserved", "delivery.stockReserved", "boolean", "boolean"),

  // Shift
  dp("Shift", "SHF", "Shift Status", "shift.status", "enum", "enum", ["Open", "Suspended", "Closed", "Reconciled"]),
  dp("Shift", "SHF", "Opening Float", "shift.openingFloat", "currency", "manual-number"),
  dp("Shift", "SHF", "Expected Cash", "shift.expectedCash", "currency", "manual-number"),
  dp("Shift", "SHF", "Actual Cash", "shift.actualCash", "currency", "manual-number"),
  dp("Shift", "SHF", "Cash Variance", "shift.cashVariance", "currency", "manual-number"),
  dp("Shift", "SHF", "Sales Amount", "shift.salesAmount", "currency", "manual-number"),
  dp("Shift", "SHF", "Return Amount", "shift.returnAmount", "currency", "manual-number"),
  dp("Shift", "SHF", "Void Count", "shift.voidCount", "number", "manual-number"),
  dp("Shift", "SHF", "Cashier", "shift.cashier", "enum", "user"),
  dp("Shift", "SHF", "Terminal", "shift.terminal", "enum", "enum", ["POS-RYD-01", "POS-RYD-02", "POS-JED-01", "POS-DMM-01"]),
  dp("Shift", "SHF", "Branch", "shift.branch", "enum", "branch"),
  dp("Shift", "SHF", "Shift Duration", "shift.durationMinutes", "number", "manual-number"),

  // HR
  dp("HR", "HR", "Employee", "employee.name", "enum", "user"),
  dp("HR", "HR", "Department", "employee.department", "enum", "enum", ["Sales", "Warehouse", "Delivery", "Finance", "Procurement", "HR", "IT"]),
  dp("HR", "HR", "Branch", "employee.branch", "enum", "branch"),
  dp("HR", "HR", "Designation", "employee.designation", "text", "manual-text"),
  dp("HR", "HR", "Employment Status", "employee.status", "enum", "enum", ["Active", "Probation", "Suspended", "Resigned", "Terminated"]),
  dp("HR", "HR", "Attendance Status", "attendance.status", "enum", "enum", ["Present", "Late", "Absent", "On Leave", "Half Day"]),
  dp("HR", "HR", "Scheduled Check-In", "attendance.scheduledCheckIn", "date", "date-picker"),
  dp("HR", "HR", "Actual Check-In", "attendance.actualCheckIn", "date", "date-picker"),
  dp("HR", "HR", "Late Minutes", "attendance.lateMinutes", "number", "manual-number"),
  dp("HR", "HR", "Worked Hours", "attendance.workedHours", "number", "manual-number"),
  dp("HR", "HR", "Overtime Hours", "attendance.overtimeHours", "number", "manual-number"),
  dp("HR", "HR", "Leave Type", "leave.type", "enum", "enum", ["Annual", "Sick", "Unpaid", "Emergency", "Hajj"]),
  dp("HR", "HR", "Leave Days", "leave.days", "number", "manual-number"),
  dp("HR", "HR", "Document Expiry Date", "employee.documentExpiryDate", "date", "date-picker"),
  dp("HR", "HR", "Contract Expiry Date", "employee.contractExpiryDate", "date", "date-picker"),
  dp("HR", "HR", "Driver Licence Status", "employee.licenceStatus", "enum", "enum", ["Valid", "Expiring Soon", "Expired", "Suspended"]),

  // User & Access
  dp("User and Access", "USR", "User", "user.name", "enum", "user"),
  dp("User and Access", "USR", "Role", "user.role", "enum", "role"),
  dp("User and Access", "USR", "Branch", "user.branch", "enum", "branch"),
  dp("User and Access", "USR", "Permission", "user.permission", "enum", "enum", ["View", "Create", "Edit", "Delete", "Approve", "Post", "View Cost"]),
  dp("User and Access", "USR", "User Status", "user.status", "enum", "enum", ["Active", "Inactive", "Locked", "Suspended"]),
  dp("User and Access", "USR", "Role Status", "roleAssignment.status", "enum", "enum", ["Active", "Scheduled", "Expired", "Suspended", "Removed"]),
  dp("User and Access", "USR", "Failed Login Count", "user.failedLoginCount", "number", "manual-number"),
  dp("User and Access", "USR", "Access Scope", "user.accessScope", "enum", "enum", ["Single Branch", "Multi Branch", "All Branches"]),
  dp("User and Access", "USR", "Requested Action", "accessRequest.action", "text", "manual-text"),
  dp("User and Access", "USR", "Approval Level", "accessRequest.approvalLevel", "number", "manual-number"),
  dp("User and Access", "USR", "Assigned Terminal", "user.assignedTerminal", "enum", "enum", ["POS-RYD-01", "POS-RYD-02", "POS-JED-01", "POS-DMM-01"]),

  // ————————————— Custom Material Pricing & Rate Engine (BRD §85.22) —————————————
  dp("Custom Pricing", "CPR", "Custom Pricing Type", "customPricing.pricingType", "enum", "enum", ["Standard Customization", "Bulk Rate", "Project Rate", "Supplier Special Rate", "Fabrication Rate", "Cut-to-Size Rate", "Mixed Product Rate", "Negotiated Rate"]),
  dp("Custom Pricing", "CPR", "Material Category", "customPricing.materialCategory", "enum", "category"),
  dp("Custom Pricing", "CPR", "Product", "customPricing.product", "enum", "product"),
  dp("Custom Pricing", "CPR", "Brand", "customPricing.brand", "enum", "brand"),
  dp("Custom Pricing", "CPR", "Supplier", "customPricing.supplier", "enum", "supplier"),
  dp("Custom Pricing", "CPR", "Customer Type", "customPricing.customerType", "enum", "enum", ["Retail", "Trade", "Contractor", "B2B Company"]),
  dp("Custom Pricing", "CPR", "Customer Price Tier", "customPricing.priceTier", "enum", "enum", ["Retail", "Trade", "Contractor", "Wholesale", "Project"]),
  dp("Custom Pricing", "CPR", "Project", "customPricing.projectCode", "text", "manual-text"),
  dp("Custom Pricing", "CPR", "Base Material Rate", "customPricing.baseRate", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Supplier Rate", "customPricing.supplierRate", "currency", "manual-number", undefined, true),
  dp("Custom Pricing", "CPR", "Project Rate", "customPricing.projectRate", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Final Selling Rate", "customPricing.finalRate", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Minimum Selling Rate", "customPricing.minSellingRate", "currency", "manual-number", undefined, true),
  dp("Custom Pricing", "CPR", "Cost Rate", "customPricing.costRate", "currency", "manual-number", undefined, true),
  dp("Custom Pricing", "CPR", "Margin Amount", "customPricing.marginAmount", "currency", "manual-number", undefined, true),
  dp("Custom Pricing", "CPR", "Margin Percentage", "customPricing.marginPct", "percentage", "manual-percentage", undefined, true),
  dp("Custom Pricing", "CPR", "Requested Quantity", "customPricing.requestedQuantity", "number", "manual-number"),
  dp("Custom Pricing", "CPR", "Chargeable Quantity", "customPricing.chargeableQuantity", "number", "manual-number"),
  dp("Custom Pricing", "CPR", "Wastage Percentage", "customPricing.wastagePct", "percentage", "manual-percentage"),
  dp("Custom Pricing", "CPR", "Cutting Charge", "customPricing.cuttingCharge", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Bending Charge", "customPricing.bendingCharge", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Fabrication Charge", "customPricing.fabricationCharge", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Mixing Charge", "customPricing.mixingCharge", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Tinting Charge", "customPricing.tintingCharge", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Packaging Charge", "customPricing.packagingCharge", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Delivery Charge", "customPricing.deliveryCharge", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Market Surcharge", "customPricing.marketSurcharge", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Discount Percentage", "customPricing.discountPct", "percentage", "manual-percentage"),
  dp("Custom Pricing", "CPR", "Discount Amount", "customPricing.discountAmount", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Quote Total", "customPricing.quoteTotal", "currency", "manual-number"),
  dp("Custom Pricing", "CPR", "Rate Validity Days", "customPricing.validityDays", "number", "manual-number"),
  dp("Custom Pricing", "CPR", "Customized Product", "customPricing.customized", "boolean", "boolean"),
  dp("Custom Pricing", "CPR", "Non-Returnable Product", "customPricing.nonReturnable", "boolean", "boolean"),
  dp("Custom Pricing", "CPR", "Approval Status", "customPricing.approvalStatus", "enum", "enum", ["Draft", "Calculated", "Pending Approval", "Approved", "Rejected", "Quoted", "Converted to Sale", "Expired", "Cancelled"]),
];

export const DATA_POINT_MODULES = Array.from(new Set(DATA_POINTS.map((d) => d.module)));

export function dataPointById(id: string): DataPoint | undefined {
  return DATA_POINTS.find((d) => d.id === id);
}

export function eventById(id: string): TriggerEvent | undefined {
  return TRIGGER_EVENTS.find((e) => e.id === id);
}

/** Only the data points relevant to the selected trigger event (§81.3). */
export function dataPointsForEvent(eventId: string | null): DataPoint[] {
  if (!eventId) return DATA_POINTS.filter((d) => d.active);
  const e = eventById(eventId);
  if (!e) return DATA_POINTS.filter((d) => d.active);
  return DATA_POINTS.filter((d) => d.active && e.modules.includes(d.module));
}

export function operatorsFor(dp: DataPoint | undefined): string[] {
  if (!dp) return [];
  return OPERATORS_BY_TYPE[dp.type];
}

export function valueOptions(dp: DataPoint | undefined, ctx: { roles: string[]; users: string[] }): string[] | null {
  if (!dp) return null;
  switch (dp.valueSource) {
    case "category": return CATEGORIES;
    case "brand": return BRANDS;
    case "branch": return BRANCHES;
    case "supplier": return SUPPLIERS;
    case "uom": return UOMS;
    case "product": return PRODUCTS;
    case "role": return ctx.roles;
    case "user": return ctx.users;
    case "enum": return dp.options ?? [];
    default: return null;
  }
}