import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { filters } from "./data";

export const filterDefaults: Record<string, string> = {
  Date: "Today",
  Branch: "Riyadh Main",
  Terminal: "POS-01",
  Cashier: "Ahmed",
  Category: "All",
  Payment: "All",
  Stock: "All",
  Delivery: "All",
  "Alert Type": "All",
};

export const filterGroups: { label: string; options: string[] }[] = [
  { label: "Date", options: filters.dateRange },
  { label: "Branch", options: filters.branch },
  { label: "Terminal", options: filters.terminal },
  { label: "Cashier", options: filters.cashier },
  { label: "Category", options: ["All", ...filters.category] },
  { label: "Payment", options: ["All", ...filters.payment] },
  { label: "Stock", options: ["All", ...filters.stockStatus] },
  { label: "Delivery", options: ["All", ...filters.deliveryStatus] },
  { label: "Alert Type", options: ["All", ...filters.alertType] },
];

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

/** Map a top-category display name to the filter's Category value. */
export function categoryToFilter(name: string): string {
  const first = name.split(/\s|&/)[0];
  const opts = filters.category;
  return opts.find((o) => o.toLowerCase() === first.toLowerCase()) ?? "All";
}