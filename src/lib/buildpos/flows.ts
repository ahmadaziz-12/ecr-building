import type { LucideIcon } from "lucide-react";
import type { PosCeilings } from "@/lib/api/auth";
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
  PackageCheck,
  Receipt,
  Wallet,
  ShieldCheck,
  Wrench,
} from "lucide-react";

export type FieldType =
  | "text"
  | "number"
  | "select"
  | "textarea"
  | "tags"
  | "toggle"
  | "date"
  | "lineItems"
  | "image";

// A lineItems field renders as an add/remove-able table instead of a single input. "product" and
// "branch" columns pull their options live (products/branches) inside FlowDialog; "select" columns
// use `options` as-is — pass per-open dynamic {value,label} options via Field.lineItemColumns
// overrides (see FlowDialog's `fieldOverrides` prop) when the choices depend on which record a row
// action was opened from (e.g. Receive PO's outstanding lines).
// "uom" renders the purchasing unit for the row's chosen product (its stock UOM plus any configured
// conversions, e.g. Pallet/Ton) — requires a "product"-type column elsewhere on the same row; picking
// a UOM re-suggests the unit cost scaled by that UOM's factor (same convention as the POS cart).
export type LineItemColumnType =
  | "product"
  | "branch"
  | "select"
  | "number"
  | "text"
  | "date"
  | "uom";
export type LineItemColumn = {
  key: string;
  label: string;
  type: LineItemColumnType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** For a "product" column: the name of another field in the same flow holding a
   *  "Warehouse: <name>" / "Branch: <name>" location value — when set, FlowDialog shows each
   *  product's available quantity at that location and flags a qty column that exceeds it. */
  availabilityField?: string;
  /** The line's qty column key, checked against `availabilityField`'s available quantity. */
  availabilityQtyKey?: string;
};

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  /** Pull this select's options live inside FlowDialog (branches → nameEn, terminals → code,
   *  topCategories → top-level category names only, subcategories → children of whichever
   *  top-level category is currently picked in `dependsOn`, users → name, roles → name). Any
   *  static `options` are kept as leading entries, so restrict them to special placeholders like
   *  "Unassigned" / "— This is a Main Category —". */
  optionsSource?: "branches" | "terminals" | "topCategories" | "subcategories" | "users" | "roles";
  /** For optionsSource "subcategories": the name of the sibling field whose live value (a
   *  top-level category name) narrows this select's options to that category's children. */
  dependsOn?: string;
  hint?: string;
  required?: boolean;
  full?: boolean;
  default?: string;
  /** This field accepts a barcode scanner: auto-focused and shows a scan affordance. */
  scannable?: boolean;
  /** Only used when type === "lineItems". */
  lineItemColumns?: LineItemColumn[];
  /** For a "select" field: the name of another field in the same flow whose current value is
   *  removed from this field's own option list — e.g. Stock Transfer's "to" excludes whatever
   *  "from" currently holds, so the same warehouse/branch can never be picked as both ends. */
  excludeValueOf?: string;
  /** Locks this field read-only for the current user unless their role's POS ceilings grant this
   *  flag (e.g. "canManagePriceListAndUsers" for Contractor/Wholesale/Project price fields) —
   *  mirrors the same server-side gate enforced in CatalogController, so a user without it never
   *  gets to type a value the save request will 403 on. */
  requiresCeiling?: keyof PosCeilings;
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
            // BRD §7 (CR-038): which of the product's list prices (set on each SKU's Pricing & Tax
            // step) this customer is charged — independent of Customer Type above.
            options: ["Retail", "Contractor", "Wholesale", "Project"],
            default: "Retail",
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
            optionsSource: "topCategories",
            required: true,
          },
          {
            name: "subcategory",
            label: "Subcategory (optional)",
            type: "select",
            optionsSource: "subcategories",
            dependsOn: "category",
            hint: 'Pick one if this product belongs to a specific subcategory, e.g. "Pipe" under "Electric".',
          },
          { name: "brand", label: "Brand", type: "text", placeholder: "e.g. Al Noor" },
          { name: "imageUrl", label: "Product Photo", type: "image", full: true },
          {
            name: "attributes",
            label: "Attributes (Grade, Size, Colour, Diameter…)",
            type: "text",
            full: true,
            placeholder: "Grade=A36; Diameter=12mm; Color=Grey",
            hint: "Match the category's Attribute Template names (Categories & Attributes) so they filter/search consistently.",
          },
        ],
      },
      {
        name: "UOM & Pack",
        desc: "Stock UOM is the smallest unit everything is deducted in. List every other unit it's sold in, with its conversion factor.",
        fields: [
          {
            name: "stockUom",
            label: "Stock UOM",
            type: "select",
            options: ["Bag", "Piece", "Box", "Bundle", "Kg", "Ton", "m²", "m³", "m", "Can", "Roll"],
          },
          {
            name: "uomConversions",
            label: "Selling Units & Conversions",
            type: "text",
            full: true,
            placeholder:
              "Pallet=50; Ton=20  (1 unit = N stock UOM — leave blank if only sold in the stock unit)",
          },
          {
            name: "cutToSizeMode",
            label: "Cut-to-size",
            type: "select",
            options: ["Not cut-to-size", "Length (linear m)", "Area (m²)", "Volume (m³)"],
            default: "Not cut-to-size",
            hint: "The POS will ask for length / length×width / length×width×height at checkout and bill the computed quantity — e.g. cable by the metre, glass by the m², sand by the m³.",
          },
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
            name: "contractorPrice",
            label: "Contractor Price (ر.س)",
            type: "number",
            hint: "The price charged to customers on the Contractor price list — leave blank to charge them the Selling Price. Requires the Manage Price List permission to change.",
            requiresCeiling: "canManagePriceListAndUsers",
          },
          {
            name: "wholesalePrice",
            label: "Wholesale Price (ر.س)",
            type: "number",
            hint: "The price charged to customers on the Wholesale price list — leave blank to charge them the Selling Price. Requires the Manage Price List permission to change.",
            requiresCeiling: "canManagePriceListAndUsers",
          },
          {
            name: "projectPrice",
            label: "Project Price (ر.س)",
            type: "number",
            hint: "The price charged to customers on the Project price list — leave blank to charge them the Selling Price. Requires the Manage Price List permission to change.",
            requiresCeiling: "canManagePriceListAndUsers",
          },
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
            optionsSource: "topCategories",
            required: true,
          },
          {
            name: "subcategory",
            label: "Subcategory (optional)",
            type: "select",
            optionsSource: "subcategories",
            dependsOn: "category",
            hint: 'Pick one if this product belongs to a specific subcategory, e.g. "Pipe" under "Electric".',
          },
          { name: "brand", label: "Brand", type: "text" },
          { name: "imageUrl", label: "Product Photo", type: "image", full: true },
          {
            name: "attributes",
            label: "Attributes (Grade, Size, Colour, Diameter…)",
            type: "text",
            full: true,
            placeholder: "Grade=A36; Diameter=12mm; Color=Grey",
            hint: "Match the category's Attribute Template names (Categories & Attributes) so they filter/search consistently.",
          },
        ],
      },
      {
        name: "UOM & Pack",
        fields: [
          {
            name: "stockUom",
            label: "Stock UOM",
            type: "select",
            options: ["Bag", "Piece", "Box", "Bundle", "Kg", "Ton", "m²", "m³", "m", "Can", "Roll"],
          },
          {
            name: "uomConversions",
            label: "Selling Units & Conversions",
            type: "text",
            full: true,
            placeholder:
              "Pallet=50; Ton=20  (1 unit = N stock UOM — leave blank if only sold in the stock unit)",
          },
          {
            name: "cutToSizeMode",
            label: "Cut-to-size",
            type: "select",
            options: ["Not cut-to-size", "Length (linear m)", "Area (m²)", "Volume (m³)"],
            hint: "The POS will ask for length / length×width / length×width×height at checkout and bill the computed quantity — e.g. cable by the metre, glass by the m², sand by the m³.",
          },
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
            name: "contractorPrice",
            label: "Contractor Price (ر.س)",
            type: "number",
            hint: "The price charged to customers on the Contractor price list — leave blank to charge them the Selling Price. Requires the Manage Price List permission to change.",
            requiresCeiling: "canManagePriceListAndUsers",
          },
          {
            name: "wholesalePrice",
            label: "Wholesale Price (ر.س)",
            type: "number",
            hint: "The price charged to customers on the Wholesale price list — leave blank to charge them the Selling Price. Requires the Manage Price List permission to change.",
            requiresCeiling: "canManagePriceListAndUsers",
          },
          {
            name: "projectPrice",
            label: "Project Price (ر.س)",
            type: "number",
            hint: "The price charged to customers on the Project price list — leave blank to charge them the Selling Price. Requires the Manage Price List permission to change.",
            requiresCeiling: "canManagePriceListAndUsers",
          },
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
            label: "Belongs Under (optional)",
            type: "select",
            options: ["— This is a Main Category —"],
            optionsSource: "topCategories",
            hint: 'Pick an existing category to make this a subcategory of it — e.g. pick "Electric" to create "Pipe" as Electric → Pipe.',
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
            label: "Belongs Under (optional)",
            type: "select",
            options: ["— This is a Main Category —"],
            optionsSource: "topCategories",
            hint: 'Pick an existing category to make this a subcategory of it — e.g. pick "Electric" to create "Pipe" as Electric → Pipe.',
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
            optionsSource: "users",
          },
          { name: "attachEvidence", label: "Attach evidence document", type: "toggle" },
        ],
      },
    ],
  },

  "Add Warehouse": {
    key: "add-warehouse",
    title: "Add Warehouse",
    subtitle: "Register a new storage or distribution location",
    icon: Boxes,
    steps: [
      {
        name: "Details",
        fields: [
          { name: "code", label: "Code", type: "text", placeholder: "WH-RUH-02", required: true },
          {
            name: "name",
            label: "Name",
            type: "text",
            placeholder: "Riyadh Overflow Yard",
            required: true,
            full: true,
          },
          {
            name: "branch",
            label: "Branch",
            type: "select",
            optionsSource: "branches",
            required: true,
          },
          {
            name: "type",
            label: "Type",
            type: "select",
            required: true,
            options: ["MainYard", "Distribution", "ColdStorage", "Overflow"],
          },
        ],
      },
    ],
  },

  "Bin Setup": {
    key: "bin-setup",
    title: "Add Storage Bin",
    subtitle: "Add a bin or rack location to a warehouse",
    icon: Layers,
    steps: [
      {
        name: "Bin",
        fields: [
          {
            name: "warehouse",
            label: "Warehouse",
            type: "select",
            options: ["Riyadh Main Yard", "Jeddah Distribution Center"],
            required: true,
          },
          { name: "binCode", label: "Bin Code", type: "text", placeholder: "C1", required: true },
          {
            name: "label",
            label: "Label",
            type: "text",
            placeholder: "Overflow Rack",
            required: true,
            full: true,
          },
          { name: "capacity", label: "Capacity (tons)", type: "number", placeholder: "0" },
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
            label: "From Location",
            type: "select",
            options: [
              "Warehouse: Riyadh Main Yard",
              "Warehouse: Jeddah Distribution Center",
              "Branch: Riyadh Main Yard",
              "Branch: Jeddah Industrial Branch",
            ],
            required: true,
            hint: "A warehouse holds bulk/backroom stock; a branch is its own shop-floor stock.",
          },
          {
            name: "to",
            label: "To Location",
            type: "select",
            options: [
              "Warehouse: Riyadh Main Yard",
              "Warehouse: Jeddah Distribution Center",
              "Branch: Riyadh Main Yard",
              "Branch: Jeddah Industrial Branch",
            ],
            required: true,
            excludeValueOf: "from",
            hint: "Can't match the From Location — pick a different warehouse or branch.",
          },
          { name: "eta", label: "Expected Arrival", type: "date" },
        ],
      },
      {
        name: "Items",
        fields: [
          {
            name: "items",
            label: "Line Items",
            type: "lineItems",
            full: true,
            required: true,
            lineItemColumns: [
              {
                key: "sku",
                label: "Item",
                type: "product",
                availabilityField: "from",
                availabilityQtyKey: "qty",
              },
              { key: "qty", label: "Qty", type: "number", placeholder: "0" },
              { key: "unitCost", label: "Unit Cost (ر.س)", type: "number", placeholder: "0.00" },
              { key: "batchNo", label: "Batch (optional)", type: "text" },
              { key: "expiryDate", label: "Expiry (optional)", type: "date" },
            ],
            hint: "Batch and expiry are optional — only fill them in for shelf-life-sensitive items (cement, paint, sealants). Available quantity at the source location is shown per item.",
          },
          { name: "carrier", label: "Carrier / Truck", type: "text" },
          { name: "notes", label: "Handover Notes", type: "textarea", full: true },
        ],
      },
    ],
  },

  "Receive Transfer": {
    key: "receive-transfer",
    title: "Receive Stock Transfer",
    subtitle: "Log actual quantities received against an in-transit transfer",
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
            // from the specific transfer's own lines — this static array is just a fallback.
            lineItemColumns: [
              { key: "line", label: "Transfer Line", type: "select", options: [] },
              { key: "qty", label: "Qty Received", type: "number", placeholder: "0" },
            ],
            hint: "Defaults to the full planned quantity — edit a row only if less (or more) actually arrived.",
          },
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
            name: "location",
            label: "Location",
            type: "select",
            options: [
              "Warehouse: Riyadh Main Yard",
              "Warehouse: Jeddah Distribution Center",
              "Branch: Riyadh Main Yard",
              "Branch: Jeddah Industrial Branch",
            ],
            required: true,
            hint: "A warehouse holds bulk/backroom stock; a branch is its own shop-floor stock (post-transfer or a direct receipt with no linked warehouse).",
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

  // "Create Bundle" is handled by the bespoke BundleFormDialog (see ModulePage.tsx), not this
  // generic flow — bundle components need a real product search + qty per line, which the generic
  // flow's free-text "SKU x Qty" tags field can't drive, and it also handles Edit (this flow never
  // did).

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

  "Edit Supplier": {
    key: "edit-supplier",
    title: "Edit Supplier",
    subtitle: "Update vendor tax details and payment terms",
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

  "Pay Supplier": {
    key: "pay-supplier",
    title: "Pay Supplier",
    subtitle: "Settle Accounts Payable — posts to the general ledger and the supplier's own ledger",
    icon: Wallet,
    steps: [
      {
        name: "Payment",
        fields: [
          { name: "amount", label: "Amount (SAR)", type: "number", required: true },
          {
            name: "method",
            label: "Payment Method",
            type: "select",
            options: ["BankTransfer", "Cash", "Cheque", "Card"],
            required: true,
          },
          { name: "referenceNo", label: "Reference # (optional)", type: "text" },
          { name: "notes", label: "Notes (optional)", type: "textarea", full: true },
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
              // Order in whatever unit the supplier actually invoices — a Pallet of cement, a Ton of
              // rebar, a m² of glass — not forced into the stock unit; receiving converts automatically.
              { key: "uom", label: "Unit", type: "uom" },
              { key: "unitCost", label: "Unit Cost (ر.س)", type: "number", placeholder: "0.00" },
              { key: "batchNo", label: "Batch (optional)", type: "text" },
              { key: "expiryDate", label: "Expiry (optional)", type: "date" },
            ],
            hint: "Select multiple branches on one row to send the same qty/cost to each — or add a separate row for a different quantity per branch. Pick a unit once an item is selected; Qty is in that unit.",
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
            optionsSource: "users",
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
            optionsSource: "branches",
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
            options: ["Unassigned"],
            optionsSource: "users",
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
            optionsSource: "terminals",
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
          {
            name: "behaviorProfile",
            label: "Behavior Profile",
            type: "text",
            placeholder: "Alert on idle > 10m",
          },
        ],
      },
    ],
  },

  "Add User": {
    key: "add-user",
    title: "Add User",
    subtitle: "Register a new employee login",
    icon: UserPlus,
    steps: [
      {
        name: "Account",
        fields: [
          { name: "name", label: "Full Name", type: "text", required: true },
          {
            name: "email",
            label: "Email",
            type: "text",
            placeholder: "name@ecr-building.local",
            required: true,
          },
          {
            name: "password",
            label: "Temporary Password",
            type: "text",
            placeholder: "Passw0rd!",
            required: true,
          },
          { name: "role", label: "Role", type: "select", required: true, optionsSource: "roles" },
          {
            name: "branch",
            label: "Branch",
            type: "select",
            options: ["All Branches"],
            optionsSource: "branches",
          },
        ],
      },
    ],
  },

  "Edit User": {
    key: "edit-user",
    title: "Edit User",
    subtitle: "Update role, branch and status",
    icon: UserPlus,
    steps: [
      {
        name: "Account",
        fields: [
          { name: "name", label: "Full Name", type: "text", required: true },
          { name: "role", label: "Role", type: "select", required: true, optionsSource: "roles" },
          {
            name: "branch",
            label: "Branch",
            type: "select",
            options: ["All Branches"],
            optionsSource: "branches",
          },
          {
            name: "status",
            label: "Status",
            type: "select",
            options: ["Active", "Suspended", "Inactive"],
          },
        ],
      },
    ],
  },

  "Edit Branch": {
    key: "edit-branch",
    title: "Edit Branch",
    subtitle: "Update branch master details",
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
          { name: "manager", label: "Branch Manager", type: "text" },
          { name: "warehouse", label: "Attached Warehouse", type: "text" },
          { name: "hours", label: "Opening Hours", type: "text", placeholder: "07:00 – 23:00" },
          { name: "zatca", label: "ZATCA VAT Number", type: "text" },
        ],
      },
    ],
  },

  "Edit Terminal": {
    key: "edit-terminal",
    title: "Edit Terminal",
    subtitle: "Update terminal registration",
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
            optionsSource: "branches",
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
            options: ["Unassigned"],
            optionsSource: "users",
          },
          { name: "offline", label: "Enable offline mode", type: "toggle" },
        ],
      },
    ],
  },

  "Edit Device": {
    key: "edit-device",
    title: "Edit Device",
    subtitle: "Update device configuration",
    icon: Printer,
    steps: [
      {
        name: "Device",
        fields: [
          { name: "model", label: "Model", type: "text", placeholder: "Epson TM-T88VII" },
          { name: "serial", label: "Serial Number", type: "text" },
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
          {
            name: "behaviorProfile",
            label: "Behavior Profile",
            type: "text",
            placeholder: "Alert on idle > 10m",
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
              "POS",
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
            optionsSource: "users",
          },
          { name: "active", label: "Activate on save", type: "toggle" },
          { name: "notes", label: "Description", type: "textarea", full: true },
        ],
      },
    ],
  },

  "Edit Rule": {
    key: "edit-rule",
    title: "Edit Rule",
    subtitle: "Update a policy in the rules engine",
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
              "POS",
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
          { name: "approver", label: "Approver (if any)", type: "select", optionsSource: "users" },
          { name: "active", label: "Active", type: "toggle" },
          { name: "notes", label: "Description", type: "textarea", full: true },
        ],
      },
    ],
  },

  "Add Control": {
    key: "add-control",
    title: "Add Control",
    subtitle: "Log a compliance/audit control",
    icon: ShieldCheck,
    steps: [
      {
        name: "Control",
        fields: [
          {
            name: "control",
            label: "Control Name",
            type: "text",
            placeholder: "Quarterly access review",
            required: true,
          },
          {
            name: "framework",
            label: "Framework",
            type: "select",
            options: ["ZATCA", "SAMA", "ISO 27001", "Internal Policy", "Data Retention"],
          },
          {
            name: "owner",
            label: "Owner",
            type: "text",
            placeholder: "Compliance Officer",
            required: true,
          },
          { name: "lastReview", label: "Last Review", type: "date" },
          { name: "nextDue", label: "Next Due", type: "date", required: true },
        ],
      },
      {
        name: "Evidence",
        fields: [
          { name: "evidence", label: "Evidence Link / Reference", type: "text", full: true },
          { name: "findings", label: "Findings", type: "textarea", full: true },
          {
            name: "status",
            label: "Status",
            type: "select",
            options: ["Compliant", "Overdue"],
            default: "Compliant",
          },
        ],
      },
    ],
  },

  "Edit Control": {
    key: "edit-control",
    title: "Edit Control",
    subtitle: "Update a compliance/audit control",
    icon: ShieldCheck,
    steps: [
      {
        name: "Control",
        fields: [
          { name: "control", label: "Control Name", type: "text", required: true },
          {
            name: "framework",
            label: "Framework",
            type: "select",
            options: ["ZATCA", "SAMA", "ISO 27001", "Internal Policy", "Data Retention"],
          },
          { name: "owner", label: "Owner", type: "text", required: true },
          { name: "lastReview", label: "Last Review", type: "date" },
          { name: "nextDue", label: "Next Due", type: "date", required: true },
        ],
      },
      {
        name: "Evidence",
        fields: [
          { name: "evidence", label: "Evidence Link / Reference", type: "text", full: true },
          { name: "findings", label: "Findings", type: "textarea", full: true },
          { name: "status", label: "Status", type: "select", options: ["Compliant", "Overdue"] },
        ],
      },
    ],
  },

  "Create Ticket": {
    key: "create-ticket",
    title: "Create Ticket",
    subtitle: "Log a device, product or operational maintenance ticket",
    icon: Wrench,
    steps: [
      {
        name: "Ticket",
        fields: [
          {
            name: "deviceOrModule",
            label: "Device / Module",
            type: "text",
            placeholder: "POS-03 Receipt Printer",
            required: true,
          },
          {
            name: "branch",
            label: "Branch",
            type: "select",
            options: ["All Branches"],
            optionsSource: "branches",
          },
          {
            name: "severity",
            label: "Severity",
            type: "select",
            options: ["Info", "Warning", "Critical"],
            default: "Warning",
          },
          {
            name: "owner",
            label: "Assigned To",
            type: "text",
            placeholder: "IT Support",
            required: true,
          },
          { name: "slaHours", label: "SLA (hours)", type: "number", placeholder: "24" },
        ],
      },
    ],
  },

  "Edit Setting": {
    key: "edit-setting",
    title: "Edit Setting",
    subtitle: "Update this setting's value",
    icon: Sliders,
    steps: [
      {
        name: "Value",
        fields: [{ name: "value", label: "Value", type: "text", required: true, full: true }],
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
            optionsSource: "branches",
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

  // "Create Pricing Rule" is handled by the bespoke CreatePricingRuleDialog (see ModulePage.tsx),
  // not this generic flow — Trade Tier/Quantity/Coupon rules need structured, type-specific fields
  // a free-text Condition/Action pair can't drive.

  // "New Return" (BRD §3.2.2 no-receipt returns) is handled by the bespoke NoReceiptReturnDialog
  // (see ModulePage.tsx), not this generic flow — this used to be a mock free-text "SKU · Qty ·
  // Refund Amount" tags field with no real backing at all; a no-receipt return needs a real
  // customer + product picker, not a string the server never parsed.

  "Approve Return": {
    key: "approve-return",
    title: "Approve Return",
    subtitle: "Restock items (if applicable) and issue the refund",
    icon: PackageCheck,
    steps: [
      {
        name: "Refund",
        desc: "Non-damaged items restock to the branch's own shelf stock. Original splits the cashback proportionally across the original payment methods (BRD §3.2.4).",
        fields: [
          {
            name: "branch",
            label: "Restock To Branch",
            type: "select",
            optionsSource: "branches",
            required: true,
          },
          {
            name: "refundMethod",
            label: "Refund Method",
            type: "select",
            options: ["Original", "Cash", "StoreCredit", "AccountCredit"],
            default: "Original",
          },
        ],
      },
      {
        name: "Dual Authorization",
        desc: "Cash refunds above the configured threshold (Returns & Refunds → Return Policy) need a second supervisor confirming with their own PIN — leave blank otherwise.",
        fields: [
          {
            name: "secondAuthEmail",
            label: "Second Supervisor Email",
            type: "text",
            placeholder: "supervisor@…",
          },
          {
            name: "secondAuthPin",
            label: "Second Supervisor PIN",
            type: "text",
            placeholder: "••••••",
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
          {
            name: "branch",
            label: "Branch",
            type: "select",
            options: ["All Branches"],
            optionsSource: "branches",
          },
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
          {
            name: "branch",
            label: "Branch",
            type: "select",
            options: ["All Branches"],
            optionsSource: "branches",
          },
        ],
      },
    ],
  },
};

export function getFlow(action?: string): Flow | undefined {
  if (!action) return undefined;
  return flows[action];
}
