import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/* Spec §6 — Global Filters. Options are static per the BuildPOS blueprint.
   NOTE: FilterBar (sections.tsx) swaps the Category and Branch options for the live
   category/branch names once loaded — these static lists are only the pre-load fallback. */

export const primaryFilterGroups: { label: string; options: string[] }[] = [
  {
    label: "Date Range",
    options: ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "Custom Range"],
  },
  {
    label: "Branch",
    options: [
      "All Permitted Branches",
      "Riyadh Main Branch",
      "Jeddah Branch",
      "Dammam Branch",
      "Makkah Branch",
      "Madinah Branch",
    ],
  },
  {
    label: "Terminal",
    options: ["All Terminals", "POS-01", "POS-02", "POS-03", "POS-04", "POS-05", "POS-06"],
  },
  {
    label: "Cashier",
    options: [
      "All Cashiers",
      "Ahmed Al-Harbi",
      "Fahad Al-Qahtani",
      "Sara Al-Otaibi",
      "Khalid Al-Mutairi",
      "Noura Al-Salem",
      "Abdullah Al-Rashid",
    ],
  },
  {
    label: "Category",
    options: [
      "All Categories",
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
    options: ["All", "Active", "Pending", "Completed", "Failed", "On Hold"],
  },
];

export const moreFilterGroups: { label: string; options: string[] }[] = [
  { label: "Customer", options: ["All", "Walk-in", "Retail", "Loyalty Member"] },
  { label: "Contractor Account", options: ["All", "Al Noor Contracting", "Modern Villas Est.", "Gulf Build Co."] },
  { label: "Supplier", options: ["All", "Al Noor Cement", "Gulf Steel Supply", "Saudi Tiles Trading", "ColorPro Paints"] },
  { label: "Payment Method", options: ["All", "Cash", "Card", "Wallet", "Bank Transfer", "Account Credit", "Loyalty Points"] },
  { label: "Order Status", options: ["All", "Draft", "Confirmed", "Delivery Planned", "Completed", "Voided"] },
  { label: "Delivery Status", options: ["All", "Pending", "Assigned", "Loading", "Dispatched", "Delivered", "Failed / Returned"] },
  { label: "Stock Status", options: ["All", "Healthy", "Low", "Critical", "Out of Stock", "Quarantine"] },
  { label: "Return Type", options: ["All", "Standard", "Damaged", "Surplus", "Exchange"] },
  { label: "Invoice Status", options: ["All", "Submitted", "Cleared", "Queued", "Failed"] },
  { label: "Employee Department", options: ["All", "Sales", "Warehouse", "Dispatch", "Finance", "Admin"] },
  { label: "Shift Status", options: ["All", "Open", "Closed", "Needs Review"] },
];

export const filterGroups = primaryFilterGroups;

export const filterDefaults: Record<string, string> = Object.fromEntries(
  [...primaryFilterGroups, ...moreFilterGroups].map((g) => [g.label, g.options[0]])
);

type Ctx = {
  values: Record<string, string>;
  setValue: (label: string, value: string) => void;
  setValues: (v: Record<string, string>) => void;
  reset: () => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
};

const FilterCtx = createContext<Ctx | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [values, setValuesState] = useState<Record<string, string>>(filterDefaults);
  const [activeTab, setActiveTab] = useState("overview");
  const setValue = useCallback((label: string, value: string) => {
    setValuesState((s) => ({ ...s, [label]: value }));
  }, []);
  const reset = useCallback(() => setValuesState(filterDefaults), []);
  const ctx = useMemo(
    () => ({ values, setValue, setValues: setValuesState, reset, activeTab, setActiveTab }),
    [values, setValue, reset, activeTab]
  );
  return <FilterCtx.Provider value={ctx}>{children}</FilterCtx.Provider>;
}

export function useFilters() {
  const ctx = useContext(FilterCtx);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}

/** Map a top-category display name to the closest Category filter option. */
export function categoryToFilter(name: string): string {
  const cats = primaryFilterGroups.find((g) => g.label === "Category")!.options;
  const lower = name.toLowerCase();
  return (
    cats.find((c) => c !== "All Categories" && lower.includes(c.split(" ")[0].toLowerCase())) ??
    "All Categories"
  );
}