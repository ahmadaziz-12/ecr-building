import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { DateRangeValue } from "@/components/buildpos/FilterControls";

/* Spec §6 — Global Filters. Options are static per the BuildPOS blueprint.
   NOTE: FilterBar (sections.tsx) swaps the Category/Branch/Terminal/Cashier options for the live
   names once loaded — these static lists are only the pre-load fallback.
   Every group here is multi-select: an empty selection means "All" (no filtering) rather than a
   literal "All X" option living inside the options array — see MultiSelectFilter. */

export const primaryFilterGroups: { label: string; options: string[] }[] = [
  {
    label: "Branch",
    options: ["Riyadh Main Branch", "Jeddah Branch", "Dammam Branch", "Makkah Branch", "Madinah Branch"],
  },
  {
    label: "Terminal",
    options: ["POS-01", "POS-02", "POS-03", "POS-04", "POS-05", "POS-06"],
  },
  {
    label: "Cashier",
    options: ["Ahmed Al-Harbi", "Fahad Al-Qahtani", "Sara Al-Otaibi", "Khalid Al-Mutairi", "Noura Al-Salem", "Abdullah Al-Rashid"],
  },
  {
    label: "Category",
    options: [
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
    ],
  },
  {
    label: "Status",
    // Matches the real OrderDto.status values (see src/lib/api/pos.ts) so this filter can
    // actually narrow live orders instead of comparing against labels that never occur.
    options: ["Pending", "Completed", "Dispatched", "Delivered", "Returned", "Voided"],
  },
];

export const moreFilterGroups: { label: string; options: string[] }[] = [
  { label: "Customer", options: ["Walk-in", "Retail", "Loyalty Member"] },
  { label: "Contractor Account", options: ["Al Noor Contracting", "Modern Villas Est.", "Gulf Build Co."] },
  { label: "Supplier", options: ["Al Noor Cement", "Gulf Steel Supply", "Saudi Tiles Trading", "ColorPro Paints"] },
  { label: "Payment Method", options: ["Cash", "Card", "Wallet", "Bank Transfer", "Account Credit", "Loyalty Points"] },
  { label: "Order Status", options: ["Draft", "Confirmed", "Delivery Planned", "Completed", "Voided"] },
  { label: "Delivery Status", options: ["Pending", "Assigned", "Loading", "Dispatched", "Delivered", "Failed / Returned"] },
  { label: "Stock Status", options: ["Healthy", "Low", "Critical", "Out of Stock", "Quarantine"] },
  { label: "Return Type", options: ["Standard", "Damaged", "Surplus", "Exchange"] },
  { label: "Invoice Status", options: ["Submitted", "Cleared", "Queued", "Failed"] },
  { label: "Employee Department", options: ["Sales", "Warehouse", "Dispatch", "Finance", "Admin"] },
  { label: "Shift Status", options: ["Open", "Closed", "Needs Review"] },
];

export const filterGroups = primaryFilterGroups;

// The closed trigger's "nothing picked" label — "All Categories" rather than the bare group name
// "Category" — for every multi-select group in the bar.
export const allLabels: Record<string, string> = {
  Branch: "All Branches",
  Terminal: "All Terminals",
  Cashier: "All Cashiers",
  Category: "All Categories",
  Status: "All Statuses",
  Customer: "All Customers",
  "Contractor Account": "All Contractor Accounts",
  Supplier: "All Suppliers",
  "Payment Method": "All Payment Methods",
  "Order Status": "All Order Statuses",
  "Delivery Status": "All Delivery Statuses",
  "Stock Status": "All Stock Statuses",
  "Return Type": "All Return Types",
  "Invoice Status": "All Invoice Statuses",
  "Employee Department": "All Departments",
  "Shift Status": "All Shift Statuses",
};

export const filterDefaults: Record<string, string[]> = Object.fromEntries(
  [...primaryFilterGroups, ...moreFilterGroups].map((g) => [g.label, []]),
);

const DATE_RANGE_DEFAULT: DateRangeValue = { preset: "" };

type Ctx = {
  values: Record<string, string[]>;
  setValue: (label: string, values: string[]) => void;
  setValues: (v: Record<string, string[]>) => void;
  dateRange: DateRangeValue;
  setDateRange: (v: DateRangeValue) => void;
  reset: () => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
};

const FilterCtx = createContext<Ctx | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [values, setValuesState] = useState<Record<string, string[]>>(filterDefaults);
  const [dateRange, setDateRange] = useState<DateRangeValue>(DATE_RANGE_DEFAULT);
  const [activeTab, setActiveTab] = useState("overview");
  const setValue = useCallback((label: string, next: string[]) => {
    setValuesState((s) => ({ ...s, [label]: next }));
  }, []);
  const reset = useCallback(() => {
    setValuesState(filterDefaults);
    setDateRange(DATE_RANGE_DEFAULT);
  }, []);
  const ctx = useMemo(
    () => ({ values, setValue, setValues: setValuesState, dateRange, setDateRange, reset, activeTab, setActiveTab }),
    [values, setValue, dateRange, reset, activeTab],
  );
  return <FilterCtx.Provider value={ctx}>{children}</FilterCtx.Provider>;
}

export function useFilters() {
  const ctx = useContext(FilterCtx);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}

/** Map a top-category display name to the closest Category filter option, or null if none match
 *  (null means "show all" — the caller should clear the Category selection instead of guessing). */
export function categoryToFilter(name: string): string | null {
  const cats = primaryFilterGroups.find((g) => g.label === "Category")!.options;
  const lower = name.toLowerCase();
  return cats.find((c) => lower.includes(c.split(" ")[0].toLowerCase())) ?? null;
}
