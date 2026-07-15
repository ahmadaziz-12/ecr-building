import type { LucideIcon } from "lucide-react";
import {
  ShoppingCart, UserPlus, Package, Layers, Boxes, ArrowLeftRight,
  Truck, FileText, Undo2, Store, MonitorSmartphone, Printer, Sliders,
} from "lucide-react";

export type FieldType = "text" | "number" | "select" | "textarea" | "tags" | "toggle" | "date";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  hint?: string;
  required?: boolean;
  full?: boolean;
  default?: string;
};

export type FlowStep = {
  name: string;
  desc?: string;
  fields: Field[];
};

export type Flow = {
  key: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  steps: FlowStep[];
  successTitle?: string;
  successMsg?: string;
};

export const flows: Record<string, Flow> = {
  "New Sale": {
    key: "new-sale",
    title: "New Sale",
    subtitle: "Open a POS ticket, attach customer and take payment",
    icon: ShoppingCart,
    steps: [
      {
        name: "Customer",
        desc: "Attach a customer or continue as walk-in.",
        fields: [
          { name: "customer", label: "Customer", type: "select", options: ["Walk-in Customer", "Al Noor Contracting", "Modern Villas Est.", "Gulf Build Co.", "New customer…"], default: "Walk-in Customer" },
          { name: "type", label: "Sale Type", type: "select", options: ["Retail Sale", "Contractor / B2B", "Quotation", "Delivery Order"], default: "Retail Sale" },
          { name: "reference", label: "PO / Reference", type: "text", placeholder: "Optional purchase-order reference" },
        ],
      },
      {
        name: "Items",
        desc: "Scan barcodes or search catalog. Prices auto-load from active price list.",
        fields: [
          { name: "items", label: "SKUs (comma separated)", type: "tags", placeholder: "CEM-OPC-50KG, TILE-GRY-60X60", full: true },
          { name: "warehouse", label: "Fulfill From", type: "select", options: ["Riyadh Central", "Riyadh Branch Store", "Jeddah Central", "Dammam Branch", "Makkah Branch"] },
          { name: "discount", label: "Line Discount %", type: "number", placeholder: "0" },
        ],
      },
      {
        name: "Payment",
        desc: "Split tender across methods if needed.",
        fields: [
          { name: "method", label: "Payment Method", type: "select", options: ["Cash", "Mada", "Visa / Master", "Bank Transfer", "Account Credit", "Wallet", "Split Payment"] },
          { name: "amount", label: "Amount (ر.س)", type: "number", placeholder: "0.00" },
          { name: "delivery", label: "Delivery required", type: "toggle" },
          { name: "notes", label: "Notes for cashier / driver", type: "textarea", full: true },
        ],
      },
    ],
    successTitle: "Sale queued",
    successMsg: "The ticket was sent to the active terminal.",
  },

  "Add Customer": {
    key: "add-customer",
    title: "Add Customer",
    subtitle: "Register a retail buyer, contractor or B2B account",
    icon: UserPlus,
    steps: [
      {
        name: "Profile",
        fields: [
          { name: "type", label: "Customer Type", type: "select", options: ["Walk-in", "Retail", "Contractor", "B2B", "Loyalty"], default: "Retail" },
          { name: "nameEn", label: "Name (English)", type: "text", placeholder: "e.g. Al Noor Contracting", required: true },
          { name: "nameAr", label: "Name (Arabic)", type: "text", placeholder: "الاسم بالعربية" },
          { name: "phone", label: "Phone", type: "text", placeholder: "+966 5x xxx xxxx", required: true },
          { name: "email", label: "Email", type: "text", placeholder: "buyer@company.sa" },
        ],
      },
      {
        name: "Tax & Credit",
        desc: "VAT registration and credit terms for contractors.",
        fields: [
          { name: "vat", label: "VAT / CR Number", type: "text", placeholder: "3xxxxxxxxxxxxx" },
          { name: "creditLimit", label: "Credit Limit (ر.س)", type: "number", placeholder: "0" },
          { name: "terms", label: "Payment Terms", type: "select", options: ["COD", "Net 7", "Net 15", "Net 30", "Net 60"] },
          { name: "priceList", label: "Assign Price List", type: "select", options: ["Retail", "Contractor A", "Contractor B", "Wholesale"] },
        ],
      },
      {
        name: "Address",
        fields: [
          { name: "city", label: "City", type: "select", options: ["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah"] },
          { name: "district", label: "District", type: "text" },
          { name: "address", label: "Delivery Address", type: "textarea", full: true },
          { name: "loyalty", label: "Enroll in loyalty program", type: "toggle" },
        ],
      },
    ],
  },

  "Add SKU": {
    key: "add-sku",
    title: "Add SKU",
    subtitle: "Create a product with UOM, pricing and VAT metadata",
    icon: Package,
    steps: [
      {
        name: "Identity",
        fields: [
          { name: "sku", label: "SKU Code", type: "text", placeholder: "CEM-OPC-50KG", required: true },
          { name: "barcode", label: "Barcode / GTIN", type: "text", placeholder: "6281100011234" },
          { name: "nameEn", label: "Name (English)", type: "text", required: true },
          { name: "nameAr", label: "Name (Arabic)", type: "text" },
          { name: "category", label: "Category", type: "select", options: ["Cement", "Steel", "Tiles", "Paint", "Plumbing", "Electrical", "Glass", "Tools", "Sealants", "Adhesives"] },
          { name: "brand", label: "Brand", type: "text", placeholder: "e.g. Al Noor" },
        ],
      },
      {
        name: "UOM & Pack",
        desc: "Stock UOM is the smallest unit. Add selling UOMs with conversion factors.",
        fields: [
          { name: "stockUom", label: "Stock UOM", type: "select", options: ["Bag", "Piece", "Box", "Bundle", "m²", "m", "Can", "Roll"] },
          { name: "sellUoms", label: "Selling UOMs", type: "tags", placeholder: "Bag, Pallet(50)" },
          { name: "weight", label: "Weight (kg)", type: "number" },
          { name: "returnable", label: "Returnable", type: "toggle" },
        ],
      },
      {
        name: "Pricing & Tax",
        fields: [
          { name: "cost", label: "Cost (ر.س)", type: "number", required: true },
          { name: "price", label: "Selling Price (ر.س)", type: "number", required: true },
          { name: "vat", label: "VAT Rate", type: "select", options: ["15%", "0% (Export)", "Exempt"], default: "15%" },
          { name: "reorder", label: "Reorder Level", type: "number" },
          { name: "reorderQty", label: "Reorder Qty", type: "number" },
        ],
      },
    ],
  },

  "Create Category": {
    key: "create-category",
    title: "Create Category",
    subtitle: "Group SKUs and apply attribute templates",
    icon: Layers,
    steps: [
      {
        name: "Category",
        fields: [
          { name: "nameEn", label: "Name (English)", type: "text", required: true },
          { name: "nameAr", label: "Name (Arabic)", type: "text" },
          { name: "parent", label: "Parent Category", type: "select", options: ["— None (top level) —", "Building Materials", "Finishing", "Tools", "MEP", "Safety"] },
          { name: "attributes", label: "Attribute Template", type: "tags", placeholder: "Grade, Size, Colour", full: true },
          { name: "vat", label: "Default VAT", type: "select", options: ["15%", "0%", "Exempt"], default: "15%" },
          { name: "returnable", label: "Returnable by default", type: "toggle" },
        ],
      },
    ],
  },

  "New Adjustment": {
    key: "new-adjustment",
    title: "New Stock Adjustment",
    subtitle: "Correct on-hand quantities with an audit trail",
    icon: Boxes,
    steps: [
      {
        name: "Scope",
        fields: [
          { name: "reason", label: "Reason", type: "select", options: ["Damage", "Theft / Loss", "Cycle Count Correction", "Write-off Expired", "Sample / Marketing", "System Correction"], required: true },
          { name: "branch", label: "Branch", type: "select", options: ["Riyadh Main", "Jeddah", "Dammam", "Makkah", "Madinah"] },
          { name: "warehouse", label: "Warehouse", type: "select", options: ["Central", "Branch Store", "Quarantine"] },
          { name: "date", label: "Adjustment Date", type: "date" },
        ],
      },
      {
        name: "Lines",
        fields: [
          { name: "sku", label: "SKU", type: "text", placeholder: "Scan or search…", required: true },
          { name: "system", label: "System Qty", type: "number" },
          { name: "counted", label: "Counted Qty", type: "number" },
          { name: "variance", label: "Variance", type: "number" },
          { name: "note", label: "Line Note", type: "textarea", full: true },
        ],
      },
      {
        name: "Approval",
        fields: [
          { name: "approver", label: "Approver", type: "select", options: ["Store Manager", "Inventory Manager", "Finance Manager"] },
          { name: "attachEvidence", label: "Attach evidence document", type: "toggle" },
        ],
      },
    ],
  },

  "Create Transfer": {
    key: "create-transfer",
    title: "Create Stock Transfer",
    subtitle: "Move stock between branches or warehouses",
    icon: ArrowLeftRight,
    steps: [
      {
        name: "Route",
        fields: [
          { name: "from", label: "From Branch", type: "select", options: ["Riyadh Main", "Jeddah", "Dammam", "Makkah", "Madinah"], required: true },
          { name: "to", label: "To Branch", type: "select", options: ["Riyadh Main", "Jeddah", "Dammam", "Makkah", "Madinah"], required: true },
          { name: "priority", label: "Priority", type: "select", options: ["Standard", "Express", "Emergency"] },
          { name: "eta", label: "Expected Arrival", type: "date" },
        ],
      },
      {
        name: "Items",
        fields: [
          { name: "skus", label: "SKUs & Qty", type: "tags", placeholder: "CEM-OPC-50KG × 40, TILE-GRY-60X60 × 20", full: true },
          { name: "carrier", label: "Carrier / Truck", type: "text" },
          { name: "driver", label: "Driver Name", type: "text" },
          { name: "notes", label: "Handover Notes", type: "textarea", full: true },
        ],
      },
    ],
  },

  "Add Supplier": {
    key: "add-supplier",
    title: "Add Supplier",
    subtitle: "Onboard a vendor with tax details and payment terms",
    icon: Truck,
    steps: [
      {
        name: "Vendor",
        fields: [
          { name: "nameEn", label: "Legal Name (EN)", type: "text", required: true },
          { name: "nameAr", label: "Legal Name (AR)", type: "text" },
          { name: "type", label: "Supplier Type", type: "select", options: ["Manufacturer", "Distributor", "Importer", "Local Vendor"] },
          { name: "vat", label: "VAT / CR Number", type: "text" },
          { name: "phone", label: "Contact Phone", type: "text" },
          { name: "email", label: "Contact Email", type: "text" },
        ],
      },
      {
        name: "Commercial",
        fields: [
          { name: "categories", label: "Supplies Categories", type: "tags", placeholder: "Cement, Steel, Tiles", full: true },
          { name: "terms", label: "Payment Terms", type: "select", options: ["Advance", "Net 15", "Net 30", "Net 60", "Net 90"] },
          { name: "currency", label: "Currency", type: "select", options: ["SAR", "USD", "EUR", "AED"] },
          { name: "leadTime", label: "Lead Time (days)", type: "number" },
          { name: "iban", label: "Bank IBAN", type: "text" },
        ],
      },
    ],
  },

  "Create PO": {
    key: "create-po",
    title: "Create Purchase Order",
    subtitle: "Order stock from a supplier",
    icon: FileText,
    steps: [
      {
        name: "Header",
        fields: [
          { name: "supplier", label: "Supplier", type: "select", options: ["Al Noor Cement", "Gulf Steel", "Saudi Tiles Co.", "ColorPro Paints", "SaudiGlass", "PowerMax Tools"], required: true },
          { name: "branch", label: "Deliver To", type: "select", options: ["Riyadh Central WH", "Jeddah Central", "Dammam Branch"] },
          { name: "currency", label: "Currency", type: "select", options: ["SAR", "USD", "EUR"] },
          { name: "expected", label: "Expected Date", type: "date" },
        ],
      },
      {
        name: "Lines",
        fields: [
          { name: "items", label: "SKU · Qty · Unit Cost", type: "tags", placeholder: "CEM-OPC-50KG × 500 @ 18.20", full: true },
          { name: "shipping", label: "Shipping Cost (ر.س)", type: "number" },
          { name: "incoterm", label: "Incoterm", type: "select", options: ["EXW", "FOB", "CIF", "DAP", "DDP"] },
          { name: "notes", label: "Notes", type: "textarea", full: true },
        ],
      },
      {
        name: "Approval",
        fields: [
          { name: "approver", label: "Approver", type: "select", options: ["Procurement Manager", "Finance Manager", "General Manager"] },
          { name: "sendEmail", label: "Email PO to supplier on approval", type: "toggle" },
        ],
      },
    ],
  },

  "Create RTS": {
    key: "create-rts",
    title: "Create Supplier Return",
    subtitle: "Return damaged, expired or wrong-shipped goods",
    icon: Undo2,
    steps: [
      {
        name: "Source",
        fields: [
          { name: "supplier", label: "Supplier", type: "select", options: ["Al Noor Cement", "Gulf Steel", "Saudi Tiles Co.", "ColorPro Paints", "SaudiGlass"], required: true },
          { name: "grn", label: "Reference GRN / PO", type: "text", placeholder: "GRN-2026-0412" },
          { name: "reason", label: "Reason", type: "select", options: ["Damaged in transit", "Wrong item", "Expired batch", "Quality reject", "Excess stock"] },
          { name: "date", label: "Return Date", type: "date" },
        ],
      },
      {
        name: "Items",
        fields: [
          { name: "items", label: "SKU · Batch · Qty", type: "tags", placeholder: "CEM-OPC-50KG · B-2026-041 × 20", full: true },
          { name: "creditNote", label: "Expected Credit Note (ر.س)", type: "number" },
          { name: "carrier", label: "Return Carrier", type: "text" },
          { name: "notes", label: "Notes", type: "textarea", full: true },
        ],
      },
    ],
  },

  "Add Branch": {
    key: "add-branch",
    title: "Add Branch",
    subtitle: "Register a new retail location",
    icon: Store,
    steps: [
      {
        name: "Location",
        fields: [
          { name: "code", label: "Branch Code", type: "text", placeholder: "RUH-02", required: true },
          { name: "nameEn", label: "Name (EN)", type: "text", required: true },
          { name: "nameAr", label: "Name (AR)", type: "text" },
          { name: "city", label: "City", type: "select", options: ["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah", "Tabuk", "Abha"] },
          { name: "address", label: "Street Address", type: "textarea", full: true },
        ],
      },
      {
        name: "Operations",
        fields: [
          { name: "manager", label: "Branch Manager", type: "select", options: ["Assign later", "Ahmed Al-Harbi", "Fahad Al-Qahtani", "Sara Al-Otaibi", "Khalid Al-Mutairi"] },
          { name: "warehouse", label: "Attach Warehouse", type: "select", options: ["Create new", "Riyadh Central WH", "Jeddah Central"] },
          { name: "hours", label: "Opening Hours", type: "text", placeholder: "07:00 – 23:00" },
          { name: "zatca", label: "ZATCA VAT Number", type: "text" },
        ],
      },
    ],
  },

  "Add Terminal": {
    key: "add-terminal",
    title: "Add Terminal",
    subtitle: "Register a POS terminal to a branch",
    icon: MonitorSmartphone,
    steps: [
      {
        name: "Terminal",
        fields: [
          { name: "id", label: "Terminal ID", type: "text", placeholder: "POS-06", required: true },
          { name: "name", label: "Display Name", type: "text", placeholder: "Front Counter 6" },
          { name: "branch", label: "Branch", type: "select", options: ["Riyadh Main", "Jeddah", "Dammam", "Makkah", "Madinah"], required: true },
          { name: "type", label: "Terminal Type", type: "select", options: ["Fixed POS", "Mobile POS", "Kiosk", "Back-office"] },
          { name: "operator", label: "Default Cashier", type: "select", options: ["Unassigned", "Ahmed Al-Harbi", "Fahad Al-Qahtani", "Sara Al-Otaibi"] },
          { name: "offline", label: "Enable offline mode", type: "toggle" },
        ],
      },
    ],
  },

  "Pair Device": {
    key: "pair-device",
    title: "Pair Device",
    subtitle: "Attach a printer, scanner, cash drawer or scale",
    icon: Printer,
    steps: [
      {
        name: "Device",
        fields: [
          { name: "type", label: "Device Type", type: "select", options: ["Receipt Printer", "Label Printer", "Barcode Scanner", "Cash Drawer", "Weighing Scale", "Card Reader (Mada)", "Customer Display"], required: true },
          { name: "model", label: "Model", type: "text", placeholder: "Epson TM-T88VII" },
          { name: "serial", label: "Serial Number", type: "text" },
          { name: "terminal", label: "Attach to Terminal", type: "select", options: ["POS-01", "POS-02", "POS-03", "POS-04", "POS-05"] },
          { name: "connection", label: "Connection", type: "select", options: ["USB", "Bluetooth", "Network (LAN)", "Wi-Fi"] },
          { name: "ip", label: "IP / MAC / Port", type: "text", placeholder: "192.168.10.24 : 9100" },
        ],
      },
    ],
  },

  "Create Rule": {
    key: "create-rule",
    title: "Create Rule",
    subtitle: "Configure a policy in the rules engine",
    icon: Sliders,
    steps: [
      {
        name: "Rule",
        fields: [
          { name: "name", label: "Rule Name", type: "text", placeholder: "Contractor discount ceiling", required: true },
          { name: "domain", label: "Domain", type: "select", options: ["Pricing & Discount", "Refund & Return", "Credit & Payment", "Inventory Movement", "Approvals", "Compliance"] },
          { name: "priority", label: "Priority", type: "select", options: ["Low", "Normal", "High", "Critical"] },
        ],
      },
      {
        name: "Conditions",
        fields: [
          { name: "when", label: "When (trigger)", type: "select", options: ["On Sale Add Line", "On Discount Apply", "On Payment", "On Refund", "On Shift Close", "On PO Approve"] },
          { name: "if", label: "If (conditions)", type: "textarea", placeholder: "e.g. customer.type = Contractor AND line.discount > 10%", full: true },
        ],
      },
      {
        name: "Action",
        fields: [
          { name: "action", label: "Then (action)", type: "select", options: ["Require Approval", "Block", "Warn & Log", "Auto-Apply Discount", "Notify Manager"] },
          { name: "approver", label: "Approver (if any)", type: "select", options: ["Store Manager", "Finance Manager", "Regional Manager"] },
          { name: "active", label: "Activate on save", type: "toggle" },
          { name: "notes", label: "Description", type: "textarea", full: true },
        ],
      },
    ],
  },
};

export function getFlow(action?: string): Flow | undefined {
  if (!action) return undefined;
  return flows[action];
}