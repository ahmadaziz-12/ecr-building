/**
 * §6 Stock Locations — lightweight location management (Location → Zone → Aisle → Rack → Bin →
 * Floor). Deliberately NOT a WMS: no routing, occupancy maps, bin capacity planning, put-away or
 * picking algorithms. It exists so every stock balance/movement can name where the goods physically
 * are, and so quarantine / supplier-return-hold stock is kept out of sellable balances.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";

export const LOCATION_TYPES = [
  "Central Stock Location",
  "Branch Stockroom",
  "Sales Floor",
  "Outdoor Stock Yard",
  "Quarantine Area",
  "Supplier Return Hold",
  "Dispatch Hold Area",
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export type StockLocation = {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  branch: string;
  address?: string;
  zone: string;
  aisle: string;
  rack: string;
  bin: string;
  floor: string;
  allowedCategories: string[];
  sellable: boolean;
  quarantine: boolean;
  supplierReturnHold: boolean;
  active: boolean;
  /** Marks the location POS/checkout deducts from when the cashier isn't asked to pick one (§6.3). */
  defaultSellable?: boolean;
};

// §6.2 seeded locations — added ALONGSIDE anything the user creates; never reset.
const SEED: StockLocation[] = [
  {
    id: "LOC-RYD-CEN-001",
    code: "RYD-CENTRAL",
    name: "Central Riyadh Stock Location",
    type: "Central Stock Location",
    branch: "Central",
    zone: "Heavy Materials",
    aisle: "CEM-01",
    rack: "Floor Stack",
    bin: "CEM-A",
    floor: "Ground Floor",
    allowedCategories: ["Cement & Binders", "Steel & Reinforcement", "Aggregates & Sand", "Landscaping"],
    sellable: true,
    quarantine: false,
    supplierReturnHold: false,
    active: true,
    defaultSellable: true,
  },
  {
    id: "LOC-RYD-BR-001",
    code: "RYD-BR-STOCK",
    name: "Riyadh Main Branch Stockroom",
    type: "Branch Stockroom",
    branch: "Riyadh Main Branch",
    zone: "Building Materials",
    aisle: "TILE-02",
    rack: "R-04",
    bin: "B-12",
    floor: "Ground Floor",
    allowedCategories: ["Tiles & Stone", "Paint & Coatings", "Pipes & Plumbing", "Electrical", "Power & Hand Tools"],
    sellable: true,
    quarantine: false,
    supplierReturnHold: false,
    active: true,
  },
  {
    id: "LOC-RYD-QUA-001",
    code: "RYD-QUARANTINE",
    name: "Riyadh Quarantine Area",
    type: "Quarantine Area",
    branch: "Riyadh Main Branch",
    zone: "Restricted",
    aisle: "Q-01",
    rack: "QR-01",
    bin: "QB-01",
    floor: "Ground Floor",
    allowedCategories: [],
    sellable: false,
    quarantine: true,
    supplierReturnHold: true,
    active: true,
  },
];

export type LocationDraft = Omit<StockLocation, "id">;

type State = {
  locations: StockLocation[];
  create: (draft: LocationDraft, user: string) => { ok: boolean; error?: string; id?: string };
  update: (id: string, patch: Partial<StockLocation>, user: string) => void;
  setActive: (id: string, active: boolean, user: string) => void;
  setDefaultSellable: (id: string, user: string) => void;
};

function nextId(type: LocationType, branch: string, existing: StockLocation[]) {
  const branchTag = (branch || "GEN").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "GEN";
  const typeTag = type.split(" ")[0].slice(0, 3).toUpperCase();
  const seq = String(existing.length + 1).padStart(3, "0");
  return `LOC-${branchTag}-${typeTag}-${seq}`;
}

export const useLocationStore = create<State>()(
  persist(
    (set, get) => ({
      locations: SEED,
      create: (draft, user) => {
        const code = draft.code.trim().toUpperCase();
        if (!code) return { ok: false, error: "Location Code is required." };
        if (!draft.name.trim()) return { ok: false, error: "Location Name is required." };
        if (get().locations.some((l) => l.code.toUpperCase() === code)) {
          return { ok: false, error: `Location code ${code} already exists. Enter a unique code.` };
        }
        const id = nextId(draft.type, draft.branch, get().locations);
        const location: StockLocation = { ...draft, code, id };
        set((s) => ({ locations: [location, ...s.locations] }));
        useAuditStore.getState().log({
          module: "system",
          event: "STOCK_LOCATION_CREATED",
          recordId: id,
          user,
          branch: draft.branch,
          newValue: `${code} — ${draft.name}`,
          severity: "info",
        });
        return { ok: true, id };
      },
      update: (id, patch, user) => {
        set((s) => ({ locations: s.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
        useAuditStore.getState().log({
          module: "system",
          event: "STOCK_LOCATION_UPDATED",
          recordId: id,
          user,
          newValue: Object.keys(patch).join(", "),
          severity: "info",
        });
      },
      setActive: (id, active, user) => {
        set((s) => ({ locations: s.locations.map((l) => (l.id === id ? { ...l, active } : l)) }));
        useAuditStore.getState().log({
          module: "system",
          event: active ? "STOCK_LOCATION_ACTIVATED" : "STOCK_LOCATION_DEACTIVATED",
          recordId: id,
          user,
          severity: active ? "info" : "warning",
        });
      },
      setDefaultSellable: (id, user) => {
        set((s) => ({
          locations: s.locations.map((l) => ({ ...l, defaultSellable: l.id === id })),
        }));
        useAuditStore.getState().log({
          module: "system",
          event: "STOCK_LOCATION_DEFAULT_SET",
          recordId: id,
          user,
          severity: "info",
        });
      },
    }),
    {
      name: "buildpos-stock-locations-v1",
      // Existing installs keep their records; only genuinely-new seeds are merged in, so the seeded
      // three never vanish and user-created rows are never overwritten.
      merge: (persisted, current) => {
        const saved = (persisted as State | undefined)?.locations ?? [];
        const missing = SEED.filter((s) => !saved.some((l) => l.id === s.id));
        return { ...current, ...(persisted as object), locations: [...saved, ...missing] };
      },
    },
  ),
);

/** The location POS deducts from when no explicit pick is made (§6.3). */
export function defaultSellableLocation(locations: StockLocation[]): StockLocation | undefined {
  return (
    locations.find((l) => l.active && l.sellable && l.defaultSellable) ??
    locations.find((l) => l.active && l.sellable)
  );
}

/** "Zone · Aisle · Rack · Bin · Floor" for inventory screens, skipping blanks. */
export function locationPath(l: StockLocation): string {
  return [l.zone, l.aisle, l.rack, l.bin, l.floor].filter(Boolean).join(" · ");
}
