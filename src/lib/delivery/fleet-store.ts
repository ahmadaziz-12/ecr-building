import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";

/* ---------------- movement types ---------------- */

export const MOVEMENT_TYPES = [
  "Warehouse to Branch",
  "Branch to Branch",
  "Branch to Customer",
  "Branch to Project Site",
  "Customer Return Pickup",
  "Branch to Supplier",
  "Supplier Pickup",
  "Failed Delivery Return",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const LOCATION_TYPES = ["Stock Location", "Branch", "Supplier", "Customer", "Contractor Project Site"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const MOVEMENT_ENDPOINTS: Record<MovementType, { source: LocationType; destination: LocationType; internal: boolean }> = {
  "Warehouse to Branch": { source: "Stock Location", destination: "Branch", internal: true },
  "Branch to Branch": { source: "Branch", destination: "Branch", internal: true },
  "Branch to Customer": { source: "Branch", destination: "Customer", internal: false },
  "Branch to Project Site": { source: "Branch", destination: "Contractor Project Site", internal: false },
  "Customer Return Pickup": { source: "Customer", destination: "Branch", internal: false },
  "Branch to Supplier": { source: "Branch", destination: "Supplier", internal: true },
  "Supplier Pickup": { source: "Supplier", destination: "Branch", internal: true },
  "Failed Delivery Return": { source: "Customer", destination: "Branch", internal: true },
};

export const ROUTE_TYPES = [
  "Stock Replenishment Route",
  "Inter-Branch Route",
  "Customer Delivery Route",
  "Contractor Project Route",
  "Return Pickup Route",
  "Supplier Return Route",
  "Supplier Pickup Route",
] as const;
export type RouteType = (typeof ROUTE_TYPES)[number];

export const VEHICLE_TYPES = [
  "Delivery Van",
  "Pickup",
  "Box Truck",
  "Flatbed Truck",
  "Heavy Truck",
  "Tipper Truck",
  "Crane Truck",
] as const;
export type FleetVehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_TYPE_GUIDE: Record<FleetVehicleType, { suitable: string[]; capacity: string }> = {
  "Delivery Van": { suitable: ["Paint", "Tools", "Hardware", "Electrical", "Plumbing fittings", "Small customer orders"], capacity: "1–2 Tons" },
  Pickup: { suitable: ["Pipes", "Timber", "Small steel quantities", "Tiles", "Customer returns"], capacity: "1–3 Tons" },
  "Box Truck": { suitable: ["Tiles", "Paint", "Tools", "Insulation", "Inter-branch transfer"], capacity: "3–8 Tons" },
  "Flatbed Truck": { suitable: ["Cement pallets", "Steel rebar", "Pipes", "Timber", "Branch replenishment"], capacity: "8–18 Tons" },
  "Heavy Truck": { suitable: ["Large stock transfers", "Cement pallets", "Steel", "Aggregates"], capacity: "18–30 Tons" },
  "Tipper Truck": { suitable: ["Sand", "Aggregates", "Gravel", "Loose landscaping"], capacity: "10–25 Tons" },
  "Crane Truck": { suitable: ["Heavy steel", "Large pallets", "Glass frames", "Mechanical unloading"], capacity: "8–20 Tons" },
};

export const MATERIAL_CATEGORIES = [
  "Cement & Binders", "Aggregates & Sand", "Steel & Reinforcement", "Tiles & Stone", "Timber & Boards",
  "Paint & Coatings", "Pipes & Plumbing", "Electrical", "Insulation", "Glass & Windows",
  "Hardware & Fasteners", "Power & Hand Tools", "Waterproofing", "Landscaping",
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const OWNERSHIP_TYPES = ["Company Owned", "Leased", "Third-Party Logistics", "Supplier Vehicle", "Temporary Rental"] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

export const FLEET_STATUSES = ["Available", "Assigned", "Loading", "In Transit", "Returning", "On Hold", "Inactive"] as const;
export type FleetStatus = (typeof FLEET_STATUSES)[number];

export const COVERAGE_AREAS = ["Riyadh North", "Riyadh South", "Riyadh East", "Riyadh West", "Central Riyadh", "Outside City Limit"] as const;

export const STOCK_LOCATIONS = ["Central Riyadh Stock Location", "Jeddah Stock Yard", "Dammam Stock Location"];

/* ---------------- entities ---------------- */

export type DeliveryRoute = {
  id: string;
  name: string;
  code: string;
  movementType: MovementType;
  routeType: RouteType;
  sourceType: LocationType;
  sourceLocation: string;
  destinationType: LocationType;
  destination: string; // named location or coverage area
  coverageArea?: string;
  distanceKm: number;
  travelTime: string;
  allowedVehicleTypes: FleetVehicleType[];
  maxWeightTons: number;
  maxVolumeM3: number;
  standardFee: number;
  heavyFee: number;
  loadingFee: number;
  minOrderValue: number;
  freeThreshold?: number;
  sameDay: boolean;
  scheduled: boolean;
  activeDays: string;
  cutOffTime: string;
  requiresApproval: boolean;
  status: "Active" | "Inactive";
  notes?: string;
};

export type FleetVehicle = {
  id: string;
  name: string;
  registration: string;
  type: FleetVehicleType;
  brand: string;
  model: string;
  modelYear: string;
  color: string;
  ownership: OwnershipType;
  branch?: string;
  stockLocation?: string;
  status: FleetStatus;
  holdNote?: string;
  maxWeightTons: number;
  maxVolumeM3: number;
  maxPallets: number;
  maxLengthM: number;
  maxWidthM: number;
  maxHeightM: number;
  heavyCompatible: boolean;
  openBody: boolean;
  covered: boolean;
  crane: boolean;
  tailLift: boolean;
  allowedMovements: MovementType[];
  allowedCategories: string[];
  primaryDriver?: string;
  secondaryDriver?: string;
  assignmentStart?: string;
  assignmentEnd?: string;
  registrationExpiry: string;
  insuranceExpiry: string;
  permitExpiry?: string;
  currentDelivery?: string;
  notes?: string;
};

export type MovementLine = { product: string; qty: number; uom: string; weightTons: number; category: string; receivedQty?: number; damagedQty?: number; missingQty?: number };

export type InternalMovementStage = "Draft" | "Approved" | "Reserved" | "Loading" | "In Transit" | "Received" | "Closed" | "Cancelled";

export type InternalMovement = {
  id: string;
  movementType: MovementType;
  sourceType: LocationType;
  source: string;
  destinationType: LocationType;
  destination: string;
  transferRef?: string;
  lines: MovementLine[];
  weightTons: number;
  vehicleId?: string;
  driver?: string;
  routeId?: string;
  loadingTime?: string;
  dispatchTime?: string;
  expectedArrival?: string;
  stockReserved: boolean;
  stage: InternalMovementStage;
  customerCharge: number; // always 0 for internal
  notes?: string;
  history: { at: number; from: InternalMovementStage; to: InternalMovementStage; note?: string }[];
};

/* ---------------- seed ---------------- */

const SEED_ROUTES: DeliveryRoute[] = [
  {
    id: "ROUTE-001", name: "Central Stock Location to Riyadh Main Branch", code: "RTE-RYD-REP",
    movementType: "Warehouse to Branch", routeType: "Stock Replenishment Route",
    sourceType: "Stock Location", sourceLocation: "Central Riyadh Stock Location",
    destinationType: "Branch", destination: "Riyadh Main Branch",
    distanceKm: 28, travelTime: "45 Minutes",
    allowedVehicleTypes: ["Heavy Truck", "Flatbed Truck", "Box Truck"],
    maxWeightTons: 25, maxVolumeM3: 60, standardFee: 0, heavyFee: 0, loadingFee: 0, minOrderValue: 0,
    sameDay: true, scheduled: true, activeDays: "Daily", cutOffTime: "10:00", requiresApproval: false,
    status: "Active", notes: "Internal Transfer — No Customer Charge. Window 06:00–10:00.",
  },
  {
    id: "ROUTE-002", name: "Jeddah to Riyadh Branch Transfer", code: "RTE-JED-RYD",
    movementType: "Branch to Branch", routeType: "Inter-Branch Route",
    sourceType: "Branch", sourceLocation: "Jeddah Branch",
    destinationType: "Branch", destination: "Riyadh Main Branch",
    distanceKm: 950, travelTime: "10–12 Hours",
    allowedVehicleTypes: ["Heavy Truck", "Flatbed Truck"],
    maxWeightTons: 30, maxVolumeM3: 80, standardFee: 0, heavyFee: 0, loadingFee: 0, minOrderValue: 0,
    sameDay: false, scheduled: true, activeDays: "Sun, Tue, Thu", cutOffTime: "14:00", requiresApproval: true,
    status: "Active",
  },
  {
    id: "ROUTE-003", name: "Riyadh Main to Riyadh North Customers", code: "RTE-RYD-N",
    movementType: "Branch to Customer", routeType: "Customer Delivery Route",
    sourceType: "Branch", sourceLocation: "Riyadh Main Branch",
    destinationType: "Customer", destination: "Riyadh North", coverageArea: "Riyadh North",
    distanceKm: 22, travelTime: "60–120 Minutes",
    allowedVehicleTypes: ["Delivery Van", "Pickup", "Flatbed Truck", "Box Truck"],
    maxWeightTons: 12, maxVolumeM3: 40, standardFee: 120, heavyFee: 250, loadingFee: 50, minOrderValue: 300,
    freeThreshold: 5000, sameDay: true, scheduled: true, activeDays: "Sat–Thu", cutOffTime: "14:00",
    requiresApproval: false, status: "Active", notes: "Same-day delivery available before 02:00 PM.",
  },
  {
    id: "ROUTE-004", name: "Riyadh Main to Contractor Projects", code: "RTE-RYD-PRJ",
    movementType: "Branch to Project Site", routeType: "Contractor Project Route",
    sourceType: "Branch", sourceLocation: "Riyadh Main Branch",
    destinationType: "Contractor Project Site", destination: "Riyadh City and 50 KM Radius",
    coverageArea: "Riyadh City and 50 KM Radius",
    distanceKm: 50, travelTime: "90–180 Minutes",
    allowedVehicleTypes: ["Pickup", "Flatbed Truck", "Heavy Truck"],
    maxWeightTons: 25, maxVolumeM3: 70, standardFee: 0, heavyFee: 0, loadingFee: 100, minOrderValue: 0,
    sameDay: false, scheduled: true, activeDays: "Sat–Thu", cutOffTime: "12:00", requiresApproval: false,
    status: "Active", notes: "Fee calculated by weight and distance. Project PO and site contact required.",
  },
  {
    id: "ROUTE-005", name: "Customer Return Pickup — Riyadh", code: "RTE-RYD-RET",
    movementType: "Customer Return Pickup", routeType: "Return Pickup Route",
    sourceType: "Customer", sourceLocation: "Customer Address",
    destinationType: "Branch", destination: "Riyadh Main Branch",
    distanceKm: 25, travelTime: "60–120 Minutes",
    allowedVehicleTypes: ["Delivery Van", "Pickup", "Box Truck"],
    maxWeightTons: 8, maxVolumeM3: 25, standardFee: 75, heavyFee: 150, loadingFee: 0, minOrderValue: 0,
    sameDay: false, scheduled: true, activeDays: "Sat–Thu", cutOffTime: "13:00", requiresApproval: true,
    status: "Active", notes: "Return approval required before pickup.",
  },
];

const SEED_VEHICLES: FleetVehicle[] = [
  {
    id: "VEH-001", name: "Riyadh Heavy Replenishment Truck", registration: "RDB 7821", type: "Heavy Truck",
    brand: "Mercedes-Benz", model: "Actros", modelYear: "2024", color: "White", ownership: "Company Owned",
    stockLocation: "Central Riyadh Stock Location", status: "Available",
    maxWeightTons: 25, maxVolumeM3: 70, maxPallets: 20, maxLengthM: 13.6, maxWidthM: 2.5, maxHeightM: 3,
    heavyCompatible: true, openBody: true, covered: false, crane: false, tailLift: false,
    allowedMovements: ["Warehouse to Branch", "Branch to Branch"],
    allowedCategories: ["Cement & Binders", "Steel & Reinforcement", "Aggregates & Sand", "Tiles & Stone", "Landscaping"],
    primaryDriver: "Hamad Al-Qahtani", registrationExpiry: "2027-03-31", insuranceExpiry: "2027-01-15",
  },
  {
    id: "VEH-002", name: "Riyadh Flatbed 07", registration: "RFA 4587", type: "Flatbed Truck",
    brand: "Isuzu", model: "F-Series", modelYear: "2023", color: "White", ownership: "Company Owned",
    branch: "Riyadh Main Branch", status: "Assigned", currentDelivery: "DO-2026-1021",
    maxWeightTons: 12, maxVolumeM3: 45, maxPallets: 12, maxLengthM: 12, maxWidthM: 2.4, maxHeightM: 2.8,
    heavyCompatible: true, openBody: true, covered: false, crane: false, tailLift: true,
    allowedMovements: ["Branch to Customer", "Branch to Project Site", "Branch to Branch", "Failed Delivery Return"],
    allowedCategories: ["Cement & Binders", "Steel & Reinforcement", "Pipes & Plumbing", "Timber & Boards", "Tiles & Stone", "Landscaping"],
    primaryDriver: "Saad Al-Dossari", registrationExpiry: "2026-11-30", insuranceExpiry: "2026-12-20",
  },
  {
    id: "VEH-003", name: "Customer Delivery Van 02", registration: "RVD 2104", type: "Delivery Van",
    brand: "Toyota", model: "Hiace", modelYear: "2025", color: "White", ownership: "Company Owned",
    branch: "Riyadh Main Branch", status: "Available",
    maxWeightTons: 1.8, maxVolumeM3: 9, maxPallets: 3, maxLengthM: 3.2, maxWidthM: 1.7, maxHeightM: 1.9,
    heavyCompatible: false, openBody: false, covered: true, crane: false, tailLift: false,
    allowedMovements: ["Branch to Customer", "Customer Return Pickup", "Branch to Supplier"],
    allowedCategories: ["Paint & Coatings", "Hardware & Fasteners", "Power & Hand Tools", "Electrical", "Pipes & Plumbing", "Waterproofing"],
    primaryDriver: "Faisal Al-Mutairi", registrationExpiry: "2028-02-28", insuranceExpiry: "2027-06-30",
  },
  {
    id: "VEH-004", name: "Aggregate Tipper 01", registration: "RTP 9093", type: "Tipper Truck",
    brand: "MAN", model: "TGS", modelYear: "2023", color: "Yellow", ownership: "Company Owned",
    stockLocation: "Central Riyadh Stock Location", status: "Available",
    maxWeightTons: 20, maxVolumeM3: 16, maxPallets: 0, maxLengthM: 6, maxWidthM: 2.5, maxHeightM: 2.2,
    heavyCompatible: true, openBody: true, covered: false, crane: false, tailLift: false,
    allowedMovements: ["Warehouse to Branch", "Branch to Project Site"],
    allowedCategories: ["Aggregates & Sand", "Landscaping"],
    registrationExpiry: "2027-05-31", insuranceExpiry: "2027-05-31",
  },
  {
    id: "VEH-005", name: "Protected Materials Box Truck", registration: "RBX 6612", type: "Box Truck",
    brand: "Hino", model: "500 Series", modelYear: "2024", color: "White", ownership: "Company Owned",
    branch: "Jeddah Branch", status: "Available",
    maxWeightTons: 7, maxVolumeM3: 30, maxPallets: 8, maxLengthM: 6.5, maxWidthM: 2.4, maxHeightM: 2.5,
    heavyCompatible: false, openBody: false, covered: true, crane: false, tailLift: true,
    allowedMovements: ["Branch to Branch", "Branch to Customer", "Branch to Project Site"],
    allowedCategories: ["Tiles & Stone", "Paint & Coatings", "Insulation", "Power & Hand Tools", "Electrical", "Glass & Windows"],
    registrationExpiry: "2027-09-30", insuranceExpiry: "2027-08-31",
  },
];

const SEED_MOVEMENTS: InternalMovement[] = [
  {
    id: "INT-MOV-2026-0058", movementType: "Warehouse to Branch",
    sourceType: "Stock Location", source: "Central Riyadh Stock Location",
    destinationType: "Branch", destination: "Riyadh Main Branch",
    transferRef: "TRF-2026-0125",
    lines: [
      { product: "OPC Cement 50KG", qty: 10, uom: "Pallet", weightTons: 10, category: "Cement & Binders" },
      { product: "Steel Rebar 12MM", qty: 20, uom: "Bundle", weightTons: 6, category: "Steel & Reinforcement" },
      { product: "Grey Porcelain Tile", qty: 100, uom: "Box", weightTons: 2.4, category: "Tiles & Stone" },
    ],
    weightTons: 18.4, vehicleId: "VEH-001", driver: "Hamad Al-Qahtani", routeId: "ROUTE-001",
    loadingTime: "06:30 AM", dispatchTime: "07:10 AM", expectedArrival: "08:00 AM",
    stockReserved: true, stage: "In Transit", customerCharge: 0,
    history: [
      { at: Date.now() - 7200000, from: "Draft", to: "Approved" },
      { at: Date.now() - 5400000, from: "Approved", to: "Reserved" },
      { at: Date.now() - 3600000, from: "Reserved", to: "Loading" },
      { at: Date.now() - 1800000, from: "Loading", to: "In Transit" },
    ],
  },
];

/* ---------------- eligibility ---------------- */

export type EligibilityInput = {
  movementType: MovementType;
  categories: string[];
  weightTons: number;
  volumeM3?: number;
  longestLengthM?: number;
  branch?: string;
  stockLocation?: string;
  routeId?: string;
  excludeDeliveryId?: string;
};

export type EligibilityResult = { vehicle: FleetVehicle; eligible: boolean; reasons: string[] };

function expired(iso?: string) {
  return Boolean(iso) && new Date(iso as string).getTime() < Date.now();
}

export function evaluateVehicles(vehicles: FleetVehicle[], input: EligibilityInput, route?: DeliveryRoute): EligibilityResult[] {
  return vehicles
    .map((v) => {
      const reasons: string[] = [];
      if (v.status === "Inactive") reasons.push("Vehicle is inactive.");
      if (v.status === "On Hold") reasons.push(`Vehicle is on hold${v.holdNote ? ` — ${v.holdNote}` : ""}.`);
      if (!v.allowedMovements.includes(input.movementType)) reasons.push(`Vehicle does not support ${input.movementType}.`);
      if (input.weightTons > v.maxWeightTons) reasons.push(`Weight ${input.weightTons}t exceeds capacity ${v.maxWeightTons}t.`);
      if (input.volumeM3 && input.volumeM3 > v.maxVolumeM3) reasons.push(`Volume ${input.volumeM3} m³ exceeds ${v.maxVolumeM3} m³.`);
      if (input.longestLengthM && input.longestLengthM > v.maxLengthM) reasons.push(`Material length ${input.longestLengthM} m exceeds ${v.maxLengthM} m.`);
      const badCats = input.categories.filter((c) => c && !v.allowedCategories.includes(c));
      if (badCats.length) reasons.push(`Category not permitted: ${badCats.join(", ")}.`);
      if (expired(v.registrationExpiry)) reasons.push("Vehicle registration has expired.");
      if (expired(v.insuranceExpiry)) reasons.push("Vehicle insurance has expired.");
      if (route && !route.allowedVehicleTypes.includes(v.type)) reasons.push(`Vehicle type not allowed on ${route.id}.`);
      if (v.currentDelivery && v.currentDelivery !== input.excludeDeliveryId) reasons.push(`Already assigned to ${v.currentDelivery}.`);
      if (input.branch && v.branch && v.branch !== input.branch && !v.stockLocation) reasons.push(`Vehicle is based at ${v.branch}.`);
      return { vehicle: v, eligible: reasons.length === 0, reasons };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible));
}

/* ---------------- store ---------------- */

function audit(event: string, recordId: string, extra?: Record<string, unknown>) {
  useAuditStore.getState().log({ module: "delivery", event, recordId, severity: "info", ...(extra ?? {}) } as never);
}

function nextId(prefix: string, existing: string[], pad = 3) {
  const max = existing.reduce((m, id) => {
    const n = Number(id.split("-").pop());
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(pad, "0")}`;
}

type FleetState = {
  routes: DeliveryRoute[];
  vehicles: FleetVehicle[];
  movements: InternalMovement[];
  addRoute: (r: Omit<DeliveryRoute, "id">) => string;
  updateRoute: (id: string, patch: Partial<DeliveryRoute>) => void;
  removeRoute: (id: string) => void;
  addVehicle: (v: Omit<FleetVehicle, "id">) => { ok: boolean; error?: string; id?: string };
  updateVehicle: (id: string, patch: Partial<FleetVehicle>) => { ok: boolean; error?: string };
  setVehicleActive: (id: string, active: boolean) => void;
  holdVehicle: (id: string, note: string) => void;
  assignVehicle: (id: string, deliveryId: string, driver?: string) => { ok: boolean; error?: string };
  unassignVehicle: (id: string) => void;
  addMovement: (m: Omit<InternalMovement, "id" | "history" | "customerCharge">) => string;
  updateMovement: (id: string, patch: Partial<InternalMovement>) => void;
  moveMovementStage: (id: string, to: InternalMovementStage, note?: string) => { ok: boolean; error?: string };
  resetFleet: () => void;
};

const MOVEMENT_FLOW: Record<InternalMovementStage, InternalMovementStage[]> = {
  Draft: ["Approved", "Cancelled"],
  Approved: ["Reserved", "Cancelled"],
  Reserved: ["Loading", "Cancelled"],
  Loading: ["In Transit", "Reserved"],
  "In Transit": ["Received"],
  Received: ["Closed"],
  Closed: [],
  Cancelled: [],
};

export const useFleetStore = create<FleetState>()(
  persist(
    (set, get) => ({
      routes: SEED_ROUTES,
      vehicles: SEED_VEHICLES,
      movements: SEED_MOVEMENTS,

      addRoute: (r) => {
        const id = nextId("ROUTE", get().routes.map((x) => x.id));
        set((s) => ({ routes: [...s.routes, { ...r, id }] }));
        audit("DELIVERY_ROUTE_CREATED", id, { newValue: r.name });
        return id;
      },
      updateRoute: (id, patch) => {
        set((s) => ({ routes: s.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
        audit("DELIVERY_ROUTE_UPDATED", id);
      },
      removeRoute: (id) => {
        set((s) => ({ routes: s.routes.filter((r) => r.id !== id) }));
        audit("DELIVERY_ROUTE_UPDATED", id, { newValue: "removed" });
      },

      addVehicle: (v) => {
        const reg = v.registration.trim().toUpperCase();
        if (!reg) return { ok: false, error: "Registration number is required." };
        if (get().vehicles.some((x) => x.registration.toUpperCase() === reg)) return { ok: false, error: "Registration number must be unique." };
        if (!v.type) return { ok: false, error: "Vehicle type is mandatory." };
        if (!(v.maxWeightTons > 0)) return { ok: false, error: "Maximum weight must be greater than zero." };
        const id = nextId("VEH", get().vehicles.map((x) => x.id));
        set((s) => ({ vehicles: [...s.vehicles, { ...v, id, registration: reg }] }));
        audit("VEHICLE_CREATED", id, { newValue: v.name || reg });
        return { ok: true, id };
      },
      updateVehicle: (id, patch) => {
        if (patch.registration) {
          const reg = patch.registration.trim().toUpperCase();
          if (get().vehicles.some((x) => x.id !== id && x.registration.toUpperCase() === reg)) return { ok: false, error: "Registration number must be unique." };
          patch = { ...patch, registration: reg };
        }
        if (patch.maxWeightTons !== undefined && !(patch.maxWeightTons > 0)) return { ok: false, error: "Maximum weight must be greater than zero." };
        set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
        audit("VEHICLE_UPDATED", id);
        return { ok: true };
      },
      setVehicleActive: (id, active) => {
        set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, status: active ? "Available" : "Inactive", holdNote: active ? undefined : v.holdNote } : v)) }));
        audit(active ? "VEHICLE_ACTIVATED" : "VEHICLE_DEACTIVATED", id);
      },
      holdVehicle: (id, note) => {
        set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, status: "On Hold", holdNote: note } : v)) }));
        audit("VEHICLE_UPDATED", id, { reason: note, newValue: "On Hold" });
      },
      assignVehicle: (id, deliveryId, driver) => {
        const v = get().vehicles.find((x) => x.id === id);
        if (!v) return { ok: false, error: "Vehicle not found." };
        if (v.status === "Inactive" || v.status === "On Hold") return { ok: false, error: "Vehicle cannot be assigned when inactive or on hold." };
        if (expired(v.registrationExpiry)) return { ok: false, error: "Expired registration blocks new assignments." };
        if (expired(v.insuranceExpiry)) return { ok: false, error: "Expired insurance blocks new assignments." };
        if (v.currentDelivery && v.currentDelivery !== deliveryId) return { ok: false, error: `Overlapping assignment — already on ${v.currentDelivery}.` };
        set((s) => ({ vehicles: s.vehicles.map((x) => (x.id === id ? { ...x, currentDelivery: deliveryId, status: "Assigned", primaryDriver: driver ?? x.primaryDriver } : x)) }));
        audit("VEHICLE_ASSIGNED", id, { newValue: deliveryId });
        audit("DELIVERY_VEHICLE_ASSIGNED", deliveryId, { newValue: id });
        if (driver) audit("DELIVERY_DRIVER_ASSIGNED", deliveryId, { newValue: driver });
        return { ok: true };
      },
      unassignVehicle: (id) => {
        set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, currentDelivery: undefined, status: "Available" } : v)) }));
        audit("VEHICLE_UNASSIGNED", id);
      },

      addMovement: (m) => {
        const year = new Date().getFullYear();
        const id = nextId(`INT-MOV-${year}`, get().movements.map((x) => x.id), 4);
        set((s) => ({ movements: [{ ...m, id, customerCharge: 0, history: [] }, ...s.movements] }));
        audit("INTERNAL_MOVEMENT_CREATED", id, { newValue: `${m.source} → ${m.destination}` });
        return id;
      },
      updateMovement: (id, patch) => set((s) => ({ movements: s.movements.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      moveMovementStage: (id, to, note) => {
        const m = get().movements.find((x) => x.id === id);
        if (!m) return { ok: false, error: "Movement not found." };
        if (!MOVEMENT_FLOW[m.stage].includes(to)) return { ok: false, error: `Cannot move from ${m.stage} → ${to}.` };
        if (to === "Loading" && !m.stockReserved) return { ok: false, error: "Stock must be reserved before loading." };
        if ((to === "Loading" || to === "In Transit") && (!m.vehicleId || !m.driver)) return { ok: false, error: "Vehicle and driver are required." };
        if (to === "Received" && m.lines.every((l) => (l.receivedQty ?? 0) === 0)) return { ok: false, error: "Record received quantities first." };
        set((s) => ({
          movements: s.movements.map((x) =>
            x.id === id
              ? { ...x, stage: to, stockReserved: to === "Reserved" ? true : x.stockReserved, history: [...x.history, { at: Date.now(), from: x.stage, to, note }] }
              : x,
          ),
        }));
        if (to === "In Transit") audit("INTERNAL_MOVEMENT_DISPATCHED", id);
        if (to === "Received") audit("INTERNAL_MOVEMENT_RECEIVED", id);
        return { ok: true };
      },
      resetFleet: () => set({ routes: SEED_ROUTES, vehicles: SEED_VEHICLES, movements: SEED_MOVEMENTS }),
    }),
    { name: "buildpos-delivery-fleet-v1" },
  ),
);

/* ---------------- delivery-order movement derivation ---------------- */

export type MovementView = { movementType: MovementType; source: string; destination: string };

export function deriveMovement(o: {
  branch: string;
  customer: string;
  customerType?: string;
  project?: string;
  stage?: string;
  address?: { type?: string; city?: string; district?: string };
  area?: string;
}): MovementView {
  const dest = [o.address?.district, o.address?.city].filter(Boolean).join(", ") || o.area || o.customer;
  if (o.stage === "Returned to Branch" || o.stage === "Failed") {
    return { movementType: "Failed Delivery Return", source: dest, destination: o.branch };
  }
  if (o.project || o.address?.type === "Project Site" || o.customerType === "Contractor" || o.customerType === "B2B") {
    return { movementType: "Branch to Project Site", source: o.branch, destination: o.project ? `${o.project} — ${dest}` : dest };
  }
  return { movementType: "Branch to Customer", source: o.branch, destination: dest };
}
