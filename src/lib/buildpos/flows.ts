import type { LucideIcon } from "lucide-react";
import {
  ShoppingCart,
  UserPlus,
  Package,
  Layers,
  Boxes,
  ArrowLeftRight,
  Truck,
  FileText,
  Undo2,
  Store,
  MonitorSmartphone,
  Printer,
  Sliders,
  CalendarClock,
  Blocks,
  PackageCheck,
  Receipt,
  Wallet,
  Percent,
} from "lucide-react";

export type FieldType = "text" | "number" | "select" | "textarea" | "tags" | "toggle" | "date" | "lineItems";

// A lineItems field renders as an add/remove-able table instead of a single input. "product" and
// "branch" columns pull their options live (products/branches) inside FlowDialog; "select" columns
// use `options` as-is — pass per-open dynamic {value,label} options via Field.lineItemColumns
// overrides (see FlowDialog's `fieldOverrides` prop) when the choices depend on which record a row
// action was opened from (e.g. Receive PO's outstanding lines).
export type LineItemColumnType = "product" | "branch" | "select" | "number" | "text" | "date";
export type LineItemColumn = {
  key: string;
  label: string;
  type: LineItemColumnType;
  placeholder?: string;
  options?: { value: string; label: string }[];
};

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
  /** This field accepts a barcode scanner: auto-focused and shows a scan affordance. */
  scannable?: boolean;
  /** Only used when type === "lineItems". */
  lineItemColumns?: LineItemColumn[];
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
          {
            name: "customer",
            label: "Customer",
            type: "select",
            options: [
              "Walk-in Customer",
              "Al Noor Contracting",
              "Modern Villas Est.",
              "Gulf Build Co.",
              "New customer…",
            ],
            default: "Walk-in Customer",
          },
          {
            name: "type",
            label: "Sale Type",
            type: "select",
            options: ["Retail Sale", "Contractor / B2B", "Quotation", "Delivery Order"],
            default: "Retail Sale",
          },
          {
            name: "reference",
            label: "PO / Reference",
            type: "text",
            placeholder: "Optional purchase-order reference",
          },
        ],
      },
      {
        name: "Items",
        desc: "Scan barcodes or search catalog. Prices auto-load from active price list.",
        fields: [
          {
            name: "items",
            label: "SKUs (comma separated)",
            type: "tags",
            placeholder: "CEM-OPC-50KG, TILE-GRY-60X60",
            full: true,
          },
          {
            name: "warehouse",
            label: "Fulfill From",
            type: "select",
            options: [
              "Riyadh Central",
              "Riyadh Branch Store",
              "Jeddah Central",
              "Dammam Branch",
              "Makkah Branch",
            ],
          },
          { name: "discount", label: "Line Discount %", type: "number", placeholder: "0" },
        ],
      },
      {
        name: "Payment",
        desc: "Split tender across methods if needed.",
        fields: [
          {
            name: "method",
            label: "Payment Method",
            type: "select",
            options: [
              "Cash",
              "Mada",
              "Visa / Master",
              "Bank Transfer",
              "Account Credit",
              "Wallet",
              "Split Payment",
            ],
          },
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
          {
            name: "type",
            label: "Customer Type",
            type: "select",
            options: ["Walk-in", "Retail", "Contractor", "B2B", "Loyalty"],
            default: "Retail",
          },
          {
            name: "nameEn",
            label: "Name (English)",
            type: "text",
            placeholder: "e.g. Al Noor Contracting",
            required: true,
          },
          { name: "nameAr", label: "Name (Arabic)", type: "text", placeholder: "الاسم بالعربية" },
          {
            name: "phone",
            label: "Phone",
            type: "text",
            placeholder: "+966 5x xxx xxxx",
            required: true,
          },
          { name: "email", label: "Email", type: "text", placeholder: "buyer@company.sa" },
        ],
      },
      {
        name: "Tax & Credit",
        desc: "VAT registration and credit terms for contractors.",
        fields: [
          { name: "vat", label: "VAT / CR Number", type: "text", placeholder: "3xxxxxxxxxxxxx" },
          { name: "creditLimit", label: "Credit Limit (ر.س)", type: "number", placeholder: "0" },
          {
            name: "terms",
            label: "Payment Terms",
            type: "select",
            options: ["COD", "Net 7", "Net 15", "Net 30", "Net 60"],
          },
          {
            name: "priceList",
            label: "Assign Price List",
            type: "select",
            options: ["Retail", "Contractor A", "Contractor B", "Wholesale"],
          },
        ],
      },
      {
        name: "Address",
        fields: [
          {
            name: "city",
            label: "City",
            type: "select",
            options: ["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah"],
          },
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
          {
            name: "sku",
            label: "SKU Code",
            type: "text",
            placeholder: "CEM-OPC-50KG",
            required: true,
          },
          {
            name: "barcode",
            label: "Barcode / GTIN",
            type: "text",
            placeholder: "Scan or type…",
            scannable: true,
          },
          { name: "nameEn", label: "Name (English)", type: "text", required: true },
          { name: "nameAr", label: "Name (Arabic)", type: "text" },
          {
            name: "category",
            label: "Category",
            type: "select",
            options: [
              "Cement",
              "Steel",
              "Tiles",
              "Paint",
              "Plumbing",
              "Electrical",
              "Glass",
              "Tools",
              "Sealants",
              "Adhesives",
            ],
          },
          { name: "brand", label: "Brand", type: "text", placeholder: "e.g. Al Noor" },
        ],
      },
      {
        name: "UOM & Pack",
        desc: "Stock UOM is the smallest unit. Add selling UOMs with conversion factors.",
        fields: [
          {
            name: "stockUom",
            label: "Stock UOM",
            type: "select",
            options: ["Bag", "Piece", "Box", "Bundle", "m²", "m", "Can", "Roll"],
          },
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
          {
            name: "vat",
            label: "VAT Rate",
            type: "select",
            options: ["15%", "0% (Export)", "Exempt"],
            default: "15%",
          },
          { name: "reorder", label: "Reorder Level", type: "number" },
          { name: "reorderQty", label: "Reorder Qty", type: "number" },
        ],
      },
    ],
  },

  "Edit SKU": {
    key: "edit-sku",
    title: "Edit SKU",
    subtitle: "Update UOM, pricing and VAT metadata",
    icon: Package,
    steps: [
      {
        name: "Identity",
        fields: [
          { name: "sku", label: "SKU Code", type: "text", required: true },
          { name: "barcode", label: "Barcode / GTIN", type: "text", scannable: true },
          { name: "nameEn", label: "Name (English)", type: "text", required: true },
          { name: "nameAr", label: "Name (Arabic)", type: "text" },
          {
            name: "category",
            label: "Category",
            type: "select",
            options: [
              "Cement",
              "Steel",
              "Tiles",
              "Paint",
              "Plumbing",
              "Electrical",
              "Glass",
              "Tools",
              "Sealants",
              "Adhesives",
            ],
          },
          { name: "brand", label: "Brand", type: "text" },
        ],
      },
      {
        name: "UOM & Pack",
        fields: [
          {
            name: "stockUom",
            label: "Stock UOM",
            type: "select",
            options: ["Bag", "Piece", "Box", "Bundle", "m²", "m", "Can", "Roll"],
          },
          { name: "sellUoms", label: "Selling UOMs", type: "tags" },
          { name: "weight", label: "Weight (kg)", type: "number" },
          { name: "returnable", label: "Returnable", type: "toggle" },
        ],
      },
      {
        name: "Pricing & Tax",
        fields: [
          { name: "cost", label: "Cost (ر.س)", type: "number", required: true },
          { name: "price", label: "Selling Price (ر.س)", type: "number", required: true },
          {
            name: "vat",
            label: "VAT Rate",
            type: "select",
            options: ["15%", "0% (Export)", "Exempt"],
          },
          { name: "reorder", label: "Reorder Level", type: "number" },
          { name: "reorderQty", label: "Reorder Qty", type: "number" },
        ],
      },
    ],
    successTitle: "SKU updated",
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
          { name: "code", label: "Code", type: "text", placeholder: "CAT-XXX", required: true },
          { name: "nameEn", label: "Name (English)", type: "text", required: true },
          { name: "nameAr", label: "Name (Arabic)", type: "text" },
          {
            name: "parent",
            label: "Parent Category",
            type: "select",
            options: [
              "— None (top level) —",
              "Cement",
              "Steel",
              "Tiles",
              "Paint",
              "Plumbing",
              "Electrical",
              "Tools",
            ],
          },
          {
            name: "attributes",
            label: "Attribute Template",
            type: "tags",
            placeholder: "Grade, Size, Colour",
            full: true,
          },
          {
            name: "returnRule",
            label: "Return Rule",
            type: "select",
            options: ["Standard 15 days", "Non-Returnable"],
            default: "Standard 15 days",
          },
          {
            name: "defaultUom",
            label: "Default UOM",
            type: "select",
            options: ["Piece", "Bag", "Box", "Bundle", "Can", "m²"],
            default: "Piece",
          },
          {
            name: "vat",
            label: "Default VAT",
            type: "select",
            options: ["15%", "0%", "Exempt"],
            default: "15%",
          },
          { name: "returnable", label: "Returnable by default", type: "toggle", default: "on" },
        ],
      },
    ],
  },

  "Edit Category": {
    key: "edit-category",
    title: "Edit Category",
    subtitle: "Update name, parent, attributes and return rule",
    icon: Layers,
    steps: [
      {
        name: "Category",
        fields: [
          { name: "code", label: "Code", type: "text", required: true },
          { name: "nameEn", label: "Name (English)", type: "text", required: true },
          { name: "nameAr", label: "Name (Arabic)", type: "text" },
          {
            name: "parent",
            label: "Parent Category",
            type: "select",
            options: [
              "— None (top level) —",
              "Cement",
              "Steel",
              "Tiles",
              "Paint",
              "Plumbing",
              "Electrical",
              "Tools",
            ],
          },
          {
            name: "attributes",
            label: "Attribute Template",
            type: "tags",
            placeholder: "Grade, Size, Colour",
            full: true,
          },
          {
            name: "returnRule",
            label: "Return Rule",
            type: "select",
            options: ["Standard 15 days", "Non-Returnable"],
          },
          {
            name: "defaultUom",
            label: "Default UOM",
            type: "select",
            options: ["Piece", "Bag", "Box", "Bundle", "Can", "m²"],
          },
          { name: "vat", label: "Default VAT", type: "select", options: ["15%", "0%", "Exempt"] },
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
          {
            name: "reason",
            label: "Reason",
            type: "select",
            options: [
              "Damage",
              "Theft / Loss",
              "Cycle Count Correction",
              "Write-off Expired",
              "Sample / Marketing",
              "System Correction",
            ],
            required: true,
          },
          {
            name: "warehouse",
            label: "Warehouse",
            type: "select",
            options: ["Riyadh Main Yard", "Jeddah Distribution Center"],
            required: true,
          },
          { name: "date", label: "Adjustment Date", type: "date" },
        ],
      },
      {
        name: "Lines",
        fields: [
          {
            name: "sku",
            label: "SKU",
            type: "text",
            placeholder: "Scan or search…",
            required: true,
            scannable: true,
          },
          { name: "system", label: "System Qty", type: "number" },
          { name: "counted", label: "Counted Qty", type: "number", required: true },
          { name: "note", label: "Line Note", type: "textarea", full: true },
        ],
      },
      {
        name: "Approval",
        fields: [
          {
            name: "approver",
            label: "Approver",
            type: "select",
            options: ["Faisal Al-Otaibi", "Khalid Al-Shehri", "Abdullah Al-Rashid"],
          },
          { name: "attachEvidence", label: "Attach evidence document", type: "toggle" },
        ],
      },
    ],
  },

  "Create Transfer": {
    key: "create-transfer",
    title: "Create Stock Transfer",
    subtitle: "Move stock between warehouses",
    icon: ArrowLeftRight,
    steps: [
      {
        name: "Route",
        fields: [
          {
            name: "from",
            label: "From Warehouse",
            type: "select",
            options: ["Riyadh Main Yard", "Jeddah Distribution Center"],
            required: true,
          },
          {
            name: "to",
            label: "To Warehouse",
            type: "select",
            options: ["Riyadh Main Yard", "Jeddah Distribution Center"],
            required: true,
          },
          { name: "eta", label: "Expected Arrival", type: "date" },
        ],
      },
      {
        name: "Items",
        fields: [
          {
            name: "skus",
            label: "SKUs & Qty",
            type: "tags",
            placeholder: "CEM-OPC-50KG x 40, TILE-GRY-60X60 x 20",
            full: true,
          },
          { name: "carrier", label: "Carrier / Truck", type: "text" },
          { name: "notes", label: "Handover Notes", type: "textarea", full: true },
        ],
      },
    ],
  },

  "Add Batch": {
    key: "add-batch",
    title: "Add Batch",
    subtitle: "Log a new batch-tracked delivery with an expiry date",
    icon: CalendarClock,
    steps: [
      {
        name: "Batch",
        fields: [
          {
            name: "sku",
            label: "SKU",
            type: "text",
            placeholder: "Scan or search…",
            required: true,
            scannable: true,
          },
          {
            name: "warehouse",
            label: "Warehouse",
            type: "select",
            options: ["Riyadh Main Yard", "Jeddah Distribution Center"],
            required: true,
          },
          {
            name: "batchNo",
            label: "Batch Number",
            type: "text",
            placeholder: "B-2026-###",
            required: true,
          },
          { name: "qty", label: "Quantity", type: "number", required: true },
          { name: "received", label: "Received Date", type: "date", required: true },
          { name: "expiry", label: "Expiry Date", type: "date", required: true },
        ],
      },
    ],
  },

  "Create Bundle": {
    key: "create-bundle",
    title: "Create Bundle",
    subtitle: "Package component SKUs into a sellable kit",
    icon: Blocks,
    steps: [
      {
        name: "Bundle",
        fields: [
          {
            name: "code",
            label: "Bundle Code",
            type: "text",
            placeholder: "BND-XXX-01",
            required: true,
          },
          { name: "nameEn", label: "Name (English)", type: "text", required: true },
          { name: "nameAr", label: "Name (Arabic)", type: "text" },
          { name: "price", label: "Bundle Price (ر.س)", type: "number", required: true },
          {
            name: "lines",
            label: "Components (SKU x Qty)",
            type: "tags",
            placeholder: "TILE-GRY-60X60 x 10, SEAL-SILC-300 x 2",
            full: true,
            required: true,
          },
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
          {
            name: "code",
            label: "Supplier Code",
            type: "text",
            placeholder: "SUP-005",
            required: true,
          },
          { name: "nameEn", label: "Legal Name (EN)", type: "text", required: true },
          { name: "nameAr", label: "Legal Name (AR)", type: "text" },
          {
            name: "type",
            label: "Supplier Type",
            type: "select",
            options: ["Manufacturer", "Distributor", "Importer", "Local Vendor"],
          },
          { name: "vat", label: "VAT / CR Number", type: "text" },
          { name: "phone", label: "Contact Phone", type: "text" },
          { name: "email", label: "Contact Email", type: "text" },
        ],
      },
      {
        name: "Commercial",
        fields: [
          {
            name: "categories",
            label: "Supplies Categories",
            type: "tags",
            placeholder: "Cement, Steel, Tiles",
            full: true,
          },
          {
            name: "terms",
            label: "Payment Terms",
            type: "select",
            options: ["Advance", "Net 15", "Net 30", "Net 60", "Net 90"],
          },
          {
            name: "currency",
            label: "Currency",
            type: "select",
            options: ["SAR", "USD", "EUR", "AED"],
          },
          { name: "leadTime", label: "Lead Time (days)", type: "number" },
          { name: "iban", label: "Bank IBAN", type: "text" },
        ],
      },
    ],
  },

  "Create PO": {
    key: "create-po",
    title: "Create Purchase Order",
    subtitle: "Order stock from a supplier — for one branch or split across several",
    icon: FileText,
    steps: [
      {
        name: "Header",
        fields: [
          {
            name: "supplier",
            label: "Supplier",
            type: "select",
            options: [
              "Yamama Cement Co.",
              "Hadeed Steel",
              "Saudi Ceramics Trading",
              "Gulf Building Supplies",
            ],
            required: true,
          },
          { name: "currency", label: "Currency", type: "select", options: ["SAR", "USD", "EUR"] },
          { name: "expected", label: "Expected Date", type: "date" },
        ],
      },
      {
        name: "Lines",
        fields: [
          {
            name: "items",
            label: "Order Lines",
            type: "lineItems",
            full: true,
            required: true,
            lineItemColumns: [
              { key: "sku", label: "Item", type: "product" },
              { key: "branch", label: "Branch", type: "branch" },
              { key: "qty", label: "Qty", type: "number", placeholder: "0" },
              { key: "unitCost", label: "Unit Cost (ر.س)", type: "number", placeholder: "0.00" },
              { key: "batchNo", label: "Batch (optional)", type: "text" },
              { key: "expiryDate", label: "Expiry (optional)", type: "date" },
            ],
            hint: "Select multiple branches on one row to send the same qty/cost to each — or add a separate row for a different quantity per branch.",
          },
          { name: "shipping", label: "Shipping Cost (ر.س)", type: "number" },
          {
            name: "incoterm",
            label: "Incoterm",
            type: "select",
            options: ["EXW", "FOB", "CIF", "DAP", "DDP"],
          },
        ],
      },
      {
        name: "Approval",
        fields: [
          {
            name: "approver",
            label: "Approver",
            type: "select",
            options: ["Procurement Manager", "Finance Manager", "General Manager"],
          },
        ],
      },
    ],
  },

  "Receive PO": {
    key: "receive-po",
    title: "Receive Purchase Order",
    subtitle: "Log goods received against outstanding PO lines",
    icon: PackageCheck,
    steps: [
      {
        name: "Receive",
        fields: [
          {
            name: "lines",
            label: "Lines to Receive",
            type: "lineItems",
            full: true,
            required: true,
            // "line" options are injected per-open by the row action (src/lib/api/row-actions.ts)
            // from the specific PO's own outstanding lines — this static array is just a fallback.
            lineItemColumns: [
              { key: "line", label: "PO Line", type: "select", options: [] },
              { key: "qty", label: "Qty Received", type: "number", placeholder: "0" },
              { key: "batchNo", label: "Batch (optional)", type: "text" },
              { key: "expiryDate", label: "Expiry (optional)", type: "date" },
            ],
            hint: "Batch and expiry are optional — only add them for goods that need lot/expiry tracking.",
          },
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
          {
            name: "supplier",
            label: "Supplier",
            type: "select",
            options: [
              "Yamama Cement Co.",
              "Hadeed Steel",
              "Saudi Ceramics Trading",
              "Gulf Building Supplies",
            ],
            required: true,
          },
          {
            name: "branch",
            label: "Return From (Branch)",
            type: "select",
            options: ["Riyadh Main Yard", "Jeddah Industrial Branch"],
            required: true,
          },
          {
            name: "poNo",
            label: "Linked PO (optional)",
            type: "text",
            placeholder: "PO-2026-0007",
          },
          {
            name: "reason",
            label: "Reason",
            type: "select",
            options: [
              "Damaged in transit",
              "Wrong item",
              "Expired batch",
              "Quality reject",
              "Excess stock",
            ],
          },
          { name: "date", label: "Return Date", type: "date" },
        ],
      },
      {
        name: "Items",
        fields: [
          {
            name: "items",
            label: "Return Lines",
            type: "lineItems",
            full: true,
            required: true,
            lineItemColumns: [
              { key: "sku", label: "Item", type: "product" },
              { key: "qty", label: "Qty", type: "number", placeholder: "0" },
              { key: "unitCost", label: "Unit Cost (ر.س)", type: "number", placeholder: "0.00" },
              { key: "batchNo", label: "Batch (optional)", type: "text" },
            ],
          },
          { name: "carrier", label: "Return Carrier", type: "text" },
          { name: "notes", label: "Notes", type: "textarea", full: true },
        ],
      },
    ],
  },

  "Record Credit Note": {
    key: "record-credit-note",
    title: "Record Credit Note",
    subtitle: "Confirm the supplier's credit note for a dispatched return",
    icon: Receipt,
    steps: [
      {
        name: "Credit",
        fields: [
          {
            name: "creditNoteRef",
            label: "Credit Note Reference",
            type: "text",
            required: true,
            placeholder: "CN-2026-0041",
          },
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
          {
            name: "code",
            label: "Branch Code",
            type: "text",
            placeholder: "RUH-02",
            required: true,
          },
          { name: "nameEn", label: "Name (EN)", type: "text", required: true },
          { name: "nameAr", label: "Name (AR)", type: "text" },
          {
            name: "city",
            label: "City",
            type: "select",
            options: ["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah", "Tabuk", "Abha"],
          },
          { name: "address", label: "Street Address", type: "textarea", full: true },
        ],
      },
      {
        name: "Operations",
        fields: [
          {
            name: "manager",
            label: "Branch Manager",
            type: "select",
            options: [
              "Assign later",
              "Ahmed Al-Harbi",
              "Fahad Al-Qahtani",
              "Sara Al-Otaibi",
              "Khalid Al-Mutairi",
            ],
          },
          {
            name: "warehouse",
            label: "Attach Warehouse",
            type: "select",
            options: ["Create new", "Riyadh Central WH", "Jeddah Central"],
          },
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
          {
            name: "branch",
            label: "Branch",
            type: "select",
            options: ["Riyadh Main", "Jeddah", "Dammam", "Makkah", "Madinah"],
            required: true,
          },
          {
            name: "type",
            label: "Terminal Type",
            type: "select",
            options: ["Fixed POS", "Mobile POS", "Kiosk", "Back-office"],
          },
          {
            name: "operator",
            label: "Default Cashier",
            type: "select",
            options: ["Unassigned", "Ahmed Al-Harbi", "Fahad Al-Qahtani", "Sara Al-Otaibi"],
          },
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
          {
            name: "type",
            label: "Device Type",
            type: "select",
            options: [
              "Receipt Printer",
              "Label Printer",
              "Barcode Scanner",
              "Cash Drawer",
              "Weighing Scale",
              "Card Reader (Mada)",
              "Customer Display",
            ],
            required: true,
          },
          { name: "model", label: "Model", type: "text", placeholder: "Epson TM-T88VII" },
          { name: "serial", label: "Serial Number", type: "text" },
          {
            name: "terminal",
            label: "Attach to Terminal",
            type: "select",
            options: ["POS-01", "POS-02", "POS-03", "POS-04", "POS-05"],
          },
          {
            name: "connection",
            label: "Connection",
            type: "select",
            options: ["USB", "Bluetooth", "Network (LAN)", "Wi-Fi"],
          },
          {
            name: "ip",
            label: "IP / MAC / Port",
            type: "text",
            placeholder: "192.168.10.24 : 9100",
          },
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
          {
            name: "name",
            label: "Rule Name",
            type: "text",
            placeholder: "Contractor discount ceiling",
            required: true,
          },
          {
            name: "domain",
            label: "Domain",
            type: "select",
            options: [
              "Pricing & Discount",
              "Refund & Return",
              "Credit & Payment",
              "Inventory Movement",
              "Approvals",
              "Compliance",
            ],
          },
          {
            name: "priority",
            label: "Priority",
            type: "select",
            options: ["Low", "Normal", "High", "Critical"],
          },
        ],
      },
      {
        name: "Conditions",
        fields: [
          {
            name: "when",
            label: "When (trigger)",
            type: "select",
            options: [
              "On Sale Add Line",
              "On Discount Apply",
              "On Payment",
              "On Refund",
              "On Shift Close",
              "On PO Approve",
            ],
          },
          {
            name: "if",
            label: "If (conditions)",
            type: "textarea",
            placeholder: "e.g. customer.type = Contractor AND line.discount > 10%",
            full: true,
          },
        ],
      },
      {
        name: "Action",
        fields: [
          {
            name: "action",
            label: "Then (action)",
            type: "select",
            options: [
              "Require Approval",
              "Block",
              "Warn & Log",
              "Auto-Apply Discount",
              "Notify Manager",
            ],
          },
          {
            name: "approver",
            label: "Approver (if any)",
            type: "select",
            options: ["Store Manager", "Finance Manager", "Regional Manager"],
          },
          { name: "active", label: "Activate on save", type: "toggle" },
          { name: "notes", label: "Description", type: "textarea", full: true },
        ],
      },
    ],
  },

  "Add Expense": {
    key: "add-expense",
    title: "Add Expense",
    subtitle: "Log a branch expense or petty-cash spend",
    icon: Wallet,
    steps: [
      {
        name: "Expense",
        fields: [
          { name: "date", label: "Date", type: "date" },
          {
            name: "branch",
            label: "Branch",
            type: "select",
            options: ["Riyadh Main", "Jeddah", "Dammam", "Makkah", "Madinah"],
            required: true,
          },
          {
            name: "category",
            label: "Category",
            type: "select",
            options: [
              "Logistics",
              "Utilities",
              "Maintenance",
              "Consumables",
              "Marketing",
              "Rent",
              "Other",
            ],
            required: true,
          },
          {
            name: "description",
            label: "Description",
            type: "text",
            placeholder: "e.g. Delivery truck fuel",
            required: true,
            full: true,
          },
          { name: "vendor", label: "Vendor", type: "text", placeholder: "e.g. Petromin" },
          { name: "amount", label: "Amount (ر.س)", type: "number", required: true },
          { name: "vat", label: "VAT (ر.س)", type: "number", placeholder: "0" },
          {
            name: "method",
            label: "Payment Method",
            type: "select",
            options: ["Petty Cash", "Cash", "Card", "Bank Transfer"],
            default: "Petty Cash",
          },
        ],
      },
    ],
  },

  "Create Pricing Rule": {
    key: "create-pricing-rule",
    title: "Create Pricing Rule",
    subtitle: "Trade tier, quantity discount, fee or coupon — goes live once approved",
    icon: Percent,
    steps: [
      {
        name: "Rule",
        fields: [
          {
            name: "name",
            label: "Rule Name",
            type: "text",
            placeholder: "e.g. Contractor Trade Price",
            required: true,
          },
          {
            name: "type",
            label: "Type",
            type: "select",
            options: ["Trade Tier", "Quantity", "Fee", "Coupon", "Bundle", "Promo"],
            required: true,
          },
          {
            name: "scope",
            label: "Scope",
            type: "text",
            placeholder: "e.g. Contractor customers, SKU: CEM-OPC-50KG",
            required: true,
          },
          {
            name: "condition",
            label: "Condition",
            type: "text",
            placeholder: "e.g. >= 50 bags, Any",
          },
          {
            name: "action",
            label: "Action",
            type: "text",
            placeholder: "e.g. -8%, +10% fee, 150 ر.س off",
            required: true,
          },
          { name: "priority", label: "Priority", type: "number", placeholder: "10" },
          { name: "validUntil", label: "Valid Until", type: "date" },
        ],
      },
      {
        name: "Coupon (if Type = Coupon)",
        desc: "Only needed for Type = Coupon — this is what a cashier types at checkout to redeem it.",
        fields: [
          { name: "code", label: "Coupon Code", type: "text", placeholder: "e.g. RAM26" },
          {
            name: "discountType",
            label: "Discount Type",
            type: "select",
            options: ["Percentage", "Fixed"],
            default: "Percentage",
          },
          { name: "value", label: "Discount Value", type: "number", placeholder: "10" },
        ],
      },
    ],
  },

  "New Return": {
    key: "new-return",
    title: "New Return",
    subtitle: "Process a customer return, exchange or damaged-goods claim",
    icon: Undo2,
    steps: [
      {
        name: "Source",
        fields: [
          {
            name: "invoice",
            label: "Order / Invoice #",
            type: "text",
            placeholder: "e.g. ORD-2026-0042",
          },
          {
            name: "customer",
            label: "Customer",
            type: "text",
            placeholder: "Leave blank for walk-in",
          },
          {
            name: "type",
            label: "Return Type",
            type: "select",
            options: ["Standard", "Surplus", "Damaged", "Exchange"],
            required: true,
          },
          {
            name: "reason",
            label: "Reason",
            type: "text",
            placeholder: "e.g. Wrong Size, Broken Boxes",
            required: true,
          },
        ],
      },
      {
        name: "Items",
        fields: [
          {
            name: "items",
            label: "SKU · Qty · Refund Amount",
            type: "tags",
            placeholder: "PVC-PIPE-2IN x 4 @ 180, TILE-GRY-60X60 x 2 @ 92",
            full: true,
            required: true,
          },
        ],
      },
    ],
  },

  "Approve Return": {
    key: "approve-return",
    title: "Approve Return",
    subtitle: "Restock items (if applicable) and issue the refund",
    icon: PackageCheck,
    steps: [
      {
        name: "Warehouse",
        desc: "Non-damaged items are added back to this warehouse's stock.",
        fields: [
          {
            name: "warehouse",
            label: "Restock To Warehouse",
            type: "select",
            options: ["Riyadh Main Yard", "Jeddah Distribution Center"],
            required: true,
          },
        ],
      },
    ],
  },

  "Add Tax/Fee Code": {
    key: "add-tax-code",
    title: "Add Tax/Fee Code",
    subtitle: "Register a VAT rate, fee rule or compliance record",
    icon: Receipt,
    steps: [
      {
        name: "Code",
        fields: [
          {
            name: "code",
            label: "Code",
            type: "text",
            placeholder: "TAX-STD, FEE-DELIV",
            required: true,
          },
          {
            name: "name",
            label: "Name",
            type: "text",
            placeholder: "e.g. Standard VAT 15%",
            required: true,
          },
          {
            name: "type",
            label: "Type",
            type: "select",
            options: ["VAT", "Fee", "Compliance"],
            default: "VAT",
          },
          {
            name: "rate",
            label: "Rate / Amount",
            type: "number",
            placeholder: "e.g. 15 for %, 50 for ر.س",
            required: true,
          },
          {
            name: "appliesTo",
            label: "Applies To",
            type: "text",
            placeholder: "e.g. All taxable SKUs, Delivery orders",
            required: true,
          },
          { name: "effectiveFrom", label: "Effective From", type: "date" },
          { name: "glAccount", label: "GL Account Code", type: "text", placeholder: "e.g. 24010" },
        ],
      },
    ],
  },

  "Edit Tax/Fee Code": {
    key: "edit-tax-code",
    title: "Edit Tax/Fee Code",
    subtitle: "Update a VAT rate, fee rule or compliance record",
    icon: Receipt,
    steps: [
      {
        name: "Code",
        fields: [
          { name: "code", label: "Code", type: "text", required: true },
          { name: "name", label: "Name", type: "text", required: true },
          { name: "type", label: "Type", type: "select", options: ["VAT", "Fee", "Compliance"] },
          { name: "rate", label: "Rate / Amount", type: "number", required: true },
          { name: "appliesTo", label: "Applies To", type: "text", required: true },
          { name: "effectiveFrom", label: "Effective From", type: "date" },
          { name: "glAccount", label: "GL Account Code", type: "text" },
        ],
      },
    ],
  },
};

export function getFlow(action?: string): Flow | undefined {
  if (!action) return undefined;
  return flows[action];
}
