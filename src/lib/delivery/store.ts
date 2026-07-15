import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";

export type Stage =
  | "Pending"
  | "Assigned"
  | "Loading"
  | "Ready to Dispatch"
  | "Dispatched"
  | "Partially Delivered"
  | "Delivered"
  | "Failed"
  | "Returned to Branch"
  | "Cancelled"
  | "Rescheduled";

export const STAGES: Stage[] = [
  "Pending",
  "Assigned",
  "Loading",
  "Ready to Dispatch",
  "Dispatched",
  "Partially Delivered",
  "Delivered",
  "Failed",
];

export type Priority = "Urgent" | "High" | "Standard" | "Low";

export type DeliveryLine = {
  sku: string;
  product: string;
  ordered: number;
  uom: string;
  unitWeight: number;
  deliveryQty: number;
  loadedQty?: number;
  missingQty?: number;
  damagedQty?: number;
  deliveredQty?: number;
  reserved?: boolean;
};

export type DeliveryOrder = {
  id: string; // DO-2026-1021
  orderId: string;
  invoiceId?: string;
  customer: string;
  customerType: "Walk-in" | "Retail" | "Contractor" | "B2B";
  project?: string;
  poRef?: string;
  branch: string;
  paymentStatus: "Paid" | "Unpaid" | "Partial" | "Credit";
  lines: DeliveryLine[];
  weightTons: number;
  area: string;
  address: {
    type: "Customer Address" | "Project Site" | "Different Address" | "Branch Pickup";
    contactName: string;
    contactMobile: string;
    city: string;
    district: string;
    street: string;
    landmark?: string;
    latLng?: string;
    instructions?: string;
  };
  promisedDate: string; // ISO
  promisedTime: string; // "04:00 PM"
  timeSlot?: string;
  priority: Priority;
  driverEmpId?: string; // links to hr
  driverName?: string;
  vehicleId?: string;
  vehicleType?: string;
  vehicleCapacity?: number;
  amount: number;
  charges: { fee: number; handling: number; heavy: number; discount: number; vat: number };
  stockReserved: boolean;
  stage: Stage;
  dispatchedAt?: number;
  deliveredAt?: number;
  receivedBy?: string;
  proof?: string; // base64 signature
  failureReason?: string;
  nextAction?: string;
  notes?: string;
  history: { at: number; from: Stage; to: Stage; by: string; note?: string }[];
};

export type Driver = {
  empId: string;
  name: string;
  branch: string;
  mobile: string;
  license: string;
  licenseExpiry: string; // ISO
  vehicleId?: string;
  status:
    | "Available"
    | "Assigned"
    | "Loading"
    | "On Delivery"
    | "On Break"
    | "Off Shift"
    | "On Leave"
    | "Licence Expired"
    | "Inactive";
  deliveriesToday: number;
  currentDelivery?: string;
};

export type Vehicle = {
  id: string;
  registration: string;
  type: "Flatbed Truck" | "Box Truck" | "Pickup" | "Delivery Van" | "Heavy Truck";
  branch: string;
  capacityTons: number;
  currentLoad?: number;
  driverEmpId?: string;
  status: "Available" | "Assigned" | "Loading" | "On Delivery" | "Maintenance" | "Inactive";
  currentDelivery?: string;
  deviceStatus: "Online" | "Offline" | "Idle";
};

export type Zone = {
  id: string;
  name: string;
  city: string;
  distanceKm: number;
  fee: number;
};

/* -------- seed data -------- */

const seedOrders: DeliveryOrder[] = [
  {
    id: "DO-2026-1021",
    orderId: "ORD-2026-8091",
    invoiceId: "INV-2026-00889",
    customer: "Al Noor Contracting Company",
    customerType: "Contractor",
    project: "PRJ-RYD-221 — Al Noor Residential Tower",
    poRef: "PO-AN-7781",
    branch: "Riyadh Main Branch",
    paymentStatus: "Credit",
    lines: [
      { sku: "CEM-OPC-50KG", product: "OPC Cement 50KG", ordered: 40, deliveryQty: 40, uom: "Bag", unitWeight: 50, reserved: true },
      { sku: "STEEL-RBR-12MM", product: "Steel Rebar 12MM", ordered: 12, deliveryQty: 12, uom: "Bundle", unitWeight: 483, reserved: true },
    ],
    weightTons: 7.8,
    area: "Riyadh North",
    address: {
      type: "Project Site",
      contactName: "Abdullah Site Engineer",
      contactMobile: "+966 55 111 2233",
      city: "Riyadh",
      district: "Al Malqa",
      street: "King Fahd Rd",
      landmark: "Near Riyadh Front",
      instructions: "Deliver to gate 3, contractor's site foreman",
    },
    promisedDate: "2026-07-15",
    promisedTime: "04:00 PM",
    timeSlot: "04:00 PM–06:00 PM",
    priority: "High",
    driverEmpId: "EMP-006",
    driverName: "Hamad Al-Qahtani",
    vehicleId: "TRK-07",
    vehicleType: "Flatbed Truck",
    vehicleCapacity: 12,
    amount: 7850,
    charges: { fee: 350, handling: 0, heavy: 0, discount: 0, vat: 52.5 },
    stockReserved: true,
    stage: "Assigned",
    history: [
      { at: Date.now() - 3 * 3600_000, from: "Pending", to: "Assigned", by: "Dispatch Supervisor" },
    ],
  },
  {
    id: "DO-2026-1022",
    orderId: "ORD-2026-8092",
    customer: "Walk-in Customer",
    customerType: "Walk-in",
    branch: "Riyadh Main Branch",
    paymentStatus: "Paid",
    lines: [
      { sku: "TILE-GRY-60X60", product: "Grey Porcelain Tile 60×60", ordered: 32, deliveryQty: 32, uom: "Box", unitWeight: 60 },
    ],
    weightTons: 1.9,
    area: "Olaya",
    address: {
      type: "Customer Address",
      contactName: "Walk-in Buyer",
      contactMobile: "+966 50 202 1010",
      city: "Riyadh",
      district: "Olaya",
      street: "Olaya St",
    },
    promisedDate: "2026-07-15",
    promisedTime: "06:00 PM",
    priority: "Standard",
    amount: 2300,
    charges: { fee: 120, handling: 0, heavy: 0, discount: 0, vat: 18 },
    stockReserved: false,
    stage: "Pending",
    history: [],
  },
  {
    id: "DO-2026-1023",
    orderId: "ORD-2026-8093",
    customer: "Modern Villas Establishment",
    customerType: "Contractor",
    branch: "Riyadh Main Branch",
    paymentStatus: "Paid",
    lines: [
      { sku: "PAINT-WHT-20L", product: "Interior White Paint 20L", ordered: 16, deliveryQty: 16, uom: "Can", unitWeight: 24, reserved: true, loadedQty: 16 },
      { sku: "TOOL-DRL-500", product: "Bosch Drill 500W", ordered: 8, deliveryQty: 8, uom: "Piece", unitWeight: 3, reserved: true, loadedQty: 8 },
    ],
    weightTons: 0.85,
    area: "Al Malqa",
    address: {
      type: "Customer Address",
      contactName: "Modern Villas PM",
      contactMobile: "+966 50 998 7654",
      city: "Riyadh",
      district: "Al Malqa",
      street: "N Ring Rd",
    },
    promisedDate: "2026-07-15",
    promisedTime: "05:30 PM",
    priority: "Standard",
    driverEmpId: "EMP-014",
    driverName: "Saad Al-Dossari",
    vehicleId: "VAN-02",
    vehicleType: "Delivery Van",
    vehicleCapacity: 2,
    amount: 4780,
    charges: { fee: 200, handling: 0, heavy: 0, discount: 0, vat: 30 },
    stockReserved: true,
    stage: "Dispatched",
    dispatchedAt: Date.now() - 60 * 60_000,
    history: [
      { at: Date.now() - 5 * 3600_000, from: "Pending", to: "Assigned", by: "Dispatch" },
      { at: Date.now() - 3 * 3600_000, from: "Assigned", to: "Loading", by: "Loader Ali" },
      { at: Date.now() - 2 * 3600_000, from: "Loading", to: "Ready to Dispatch", by: "Loader Ali" },
      { at: Date.now() - 60 * 60_000, from: "Ready to Dispatch", to: "Dispatched", by: "Dispatch" },
    ],
  },
  {
    id: "DO-2026-1024",
    orderId: "ORD-2026-8094",
    customer: "Gulf Build Company",
    customerType: "B2B",
    branch: "Riyadh Main Branch",
    paymentStatus: "Paid",
    lines: [
      { sku: "CEM-OPC-50KG", product: "OPC Cement pallets", ordered: 5, deliveryQty: 5, uom: "Pallet", unitWeight: 2000, reserved: true, loadedQty: 5, deliveredQty: 5 },
    ],
    weightTons: 10,
    area: "Exit 8",
    address: {
      type: "Project Site",
      contactName: "Abdullah Al-Shammari",
      contactMobile: "+966 55 220 1010",
      city: "Riyadh",
      district: "Exit 8",
      street: "Eastern Ring",
    },
    promisedDate: "2026-07-15",
    promisedTime: "02:00 PM",
    priority: "High",
    driverEmpId: "EMP-020",
    driverName: "Khaled Al-Harthi",
    vehicleId: "TRK-03",
    vehicleType: "Flatbed Truck",
    vehicleCapacity: 15,
    amount: 11500,
    charges: { fee: 500, handling: 100, heavy: 300, discount: 0, vat: 135 },
    stockReserved: true,
    stage: "Delivered",
    dispatchedAt: Date.now() - 4 * 3600_000,
    deliveredAt: Date.now() - 1.5 * 3600_000,
    receivedBy: "Abdullah Al-Shammari",
    history: [
      { at: Date.now() - 8 * 3600_000, from: "Pending", to: "Assigned", by: "Dispatch" },
      { at: Date.now() - 6 * 3600_000, from: "Assigned", to: "Loading", by: "Loader" },
      { at: Date.now() - 5 * 3600_000, from: "Loading", to: "Ready to Dispatch", by: "Loader" },
      { at: Date.now() - 4 * 3600_000, from: "Ready to Dispatch", to: "Dispatched", by: "Dispatch" },
      { at: Date.now() - 1.5 * 3600_000, from: "Dispatched", to: "Delivered", by: "Khaled Al-Harthi" },
    ],
  },
  {
    id: "DO-2026-1025",
    orderId: "ORD-2026-8095",
    customer: "Abdullah Trading",
    customerType: "Retail",
    branch: "Dammam Branch",
    paymentStatus: "Paid",
    lines: [
      { sku: "PVC-PIPE-2IN", product: "Plumbing Items (mixed)", ordered: 48, deliveryQty: 48, uom: "Piece", unitWeight: 5, reserved: true, loadedQty: 48 },
    ],
    weightTons: 0.24,
    area: "Dammam Road",
    address: {
      type: "Customer Address",
      contactName: "Abdullah Owner",
      contactMobile: "+966 55 445 7788",
      city: "Dammam",
      district: "Al Rakah",
      street: "Prince Naif",
    },
    promisedDate: "2026-07-15",
    promisedTime: "12:00 PM",
    priority: "Standard",
    driverEmpId: "EMP-021",
    driverName: "Faisal Al-Mutairi",
    vehicleId: "VAN-05",
    vehicleType: "Delivery Van",
    vehicleCapacity: 2,
    amount: 1950,
    charges: { fee: 120, handling: 0, heavy: 0, discount: 0, vat: 18 },
    stockReserved: true,
    stage: "Failed",
    failureReason: "Customer site closed",
    nextAction: "Reschedule",
    history: [
      { at: Date.now() - 6 * 3600_000, from: "Pending", to: "Assigned", by: "Dispatch" },
      { at: Date.now() - 5 * 3600_000, from: "Assigned", to: "Loading", by: "Loader" },
      { at: Date.now() - 4 * 3600_000, from: "Loading", to: "Ready to Dispatch", by: "Loader" },
      { at: Date.now() - 3 * 3600_000, from: "Ready to Dispatch", to: "Dispatched", by: "Dispatch" },
      { at: Date.now() - 2 * 3600_000, from: "Dispatched", to: "Failed", by: "Faisal Al-Mutairi", note: "Customer site closed" },
    ],
  },
];

const seedDrivers: Driver[] = [
  { empId: "EMP-006", name: "Hamad Al-Qahtani", branch: "Riyadh Main Branch", mobile: "+966 50 311 4567", license: "DL-966-77821", licenseExpiry: "2027-03-18", vehicleId: "TRK-07", status: "Assigned", deliveriesToday: 3, currentDelivery: "DO-2026-1021" },
  { empId: "EMP-014", name: "Saad Al-Dossari", branch: "Riyadh Main Branch", mobile: "+966 50 411 2234", license: "DL-966-88112", licenseExpiry: "2027-08-01", vehicleId: "VAN-02", status: "On Delivery", deliveriesToday: 4, currentDelivery: "DO-2026-1023" },
  { empId: "EMP-020", name: "Khaled Al-Harthi", branch: "Riyadh Main Branch", mobile: "+966 50 511 3345", license: "DL-966-99034", licenseExpiry: "2026-12-11", vehicleId: "TRK-03", status: "Available", deliveriesToday: 2 },
  { empId: "EMP-021", name: "Faisal Al-Mutairi", branch: "Dammam Branch", mobile: "+966 50 611 4456", license: "DL-966-11223", licenseExpiry: "2027-02-04", vehicleId: "VAN-05", status: "Available", deliveriesToday: 1, currentDelivery: "DO-2026-1025" },
  { empId: "EMP-022", name: "Omar Al-Ghamdi", branch: "Riyadh Main Branch", mobile: "+966 50 711 5567", license: "DL-966-33445", licenseExpiry: "2026-09-30", status: "On Leave", deliveriesToday: 0 },
];

const seedVehicles: Vehicle[] = [
  { id: "TRK-07", registration: "RDB 7821", type: "Flatbed Truck", branch: "Riyadh Main Branch", capacityTons: 12, currentLoad: 7.8, driverEmpId: "EMP-006", status: "Assigned", currentDelivery: "DO-2026-1021", deviceStatus: "Online" },
  { id: "TRK-03", registration: "RDA 3488", type: "Flatbed Truck", branch: "Riyadh Main Branch", capacityTons: 15, driverEmpId: "EMP-020", status: "Available", deviceStatus: "Online" },
  { id: "VAN-02", registration: "RVD 2104", type: "Delivery Van", branch: "Riyadh Main Branch", capacityTons: 2, currentLoad: 0.85, driverEmpId: "EMP-014", status: "On Delivery", currentDelivery: "DO-2026-1023", deviceStatus: "Online" },
  { id: "VAN-05", registration: "RVE 5510", type: "Delivery Van", branch: "Dammam Branch", capacityTons: 2, driverEmpId: "EMP-021", status: "Available", deviceStatus: "Idle" },
  { id: "PICKUP-01", registration: "RPU 1120", type: "Pickup", branch: "Jeddah Branch", capacityTons: 1, status: "Available", deviceStatus: "Online" },
];

const seedZones: Zone[] = [
  { id: "Z-01", name: "Riyadh North", city: "Riyadh", distanceKm: 18, fee: 150 },
  { id: "Z-02", name: "Riyadh South", city: "Riyadh", distanceKm: 22, fee: 180 },
  { id: "Z-03", name: "Olaya", city: "Riyadh", distanceKm: 8, fee: 100 },
  { id: "Z-04", name: "Al Malqa", city: "Riyadh", distanceKm: 14, fee: 130 },
  { id: "Z-05", name: "Exit 8", city: "Riyadh", distanceKm: 24, fee: 200 },
  { id: "Z-06", name: "Dammam Road", city: "Dammam", distanceKm: 12, fee: 120 },
  { id: "Z-07", name: "Al Rakah", city: "Khobar", distanceKm: 16, fee: 150 },
  { id: "Z-08", name: "Jeddah North", city: "Jeddah", distanceKm: 20, fee: 170 },
];

/* -------- store -------- */

type S = {
  orders: DeliveryOrder[];
  drivers: Driver[];
  vehicles: Vehicle[];
  zones: Zone[];
  seq: number;
  addOrder: (o: Omit<DeliveryOrder, "id" | "history">) => DeliveryOrder;
  updateOrder: (id: string, patch: Partial<DeliveryOrder>) => void;
  moveStage: (id: string, to: Stage, by: string, note?: string) => { ok: boolean; error?: string };
  addDriver: (d: Driver) => void;
  updateDriver: (empId: string, patch: Partial<Driver>) => void;
  addVehicle: (v: Vehicle) => void;
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void;
  addZone: (z: Omit<Zone, "id">) => void;
  removeZone: (id: string) => void;
  reset: () => void;
};

const ALLOWED_TRANSITIONS: Record<Stage, Stage[]> = {
  Pending: ["Assigned", "Cancelled"],
  Assigned: ["Loading", "Pending", "Cancelled"],
  Loading: ["Ready to Dispatch", "Assigned"],
  "Ready to Dispatch": ["Dispatched", "Loading"],
  Dispatched: ["Delivered", "Partially Delivered", "Failed", "Returned to Branch"],
  "Partially Delivered": ["Delivered", "Rescheduled", "Returned to Branch"],
  Delivered: [],
  Failed: ["Rescheduled", "Returned to Branch", "Cancelled"],
  "Returned to Branch": ["Rescheduled", "Cancelled"],
  Cancelled: [],
  Rescheduled: ["Pending", "Assigned"],
};

function validate(o: DeliveryOrder, to: Stage): string | null {
  if (!ALLOWED_TRANSITIONS[o.stage].includes(to)) {
    return `Cannot move from ${o.stage} → ${to}.`;
  }
  if (to === "Assigned" && (!o.driverEmpId || !o.vehicleId)) {
    return "Driver and vehicle are required before assignment.";
  }
  if (to === "Loading" && !o.stockReserved) {
    return "Stock must be reserved before loading.";
  }
  if (to === "Ready to Dispatch") {
    const anyLoaded = o.lines.some((l) => (l.loadedQty ?? 0) > 0);
    if (!anyLoaded) return "Confirm loaded quantities before ready-to-dispatch.";
  }
  if (to === "Dispatched" && (!o.driverEmpId || !o.vehicleId)) {
    return "Driver and vehicle are required before dispatch.";
  }
  if (to === "Delivered") {
    const anyDelivered = o.lines.some((l) => (l.deliveredQty ?? 0) > 0);
    if (!anyDelivered) return "Record delivered quantities before completion.";
  }
  return null;
}

let orderSeq = 1026;

export const useDeliveryStore = create<S>()(
  persist(
    (set, get) => ({
      orders: seedOrders,
      drivers: seedDrivers,
      vehicles: seedVehicles,
      zones: seedZones,
      seq: orderSeq,
      addOrder: (o) => {
        const id = `DO-2026-${String(get().seq).padStart(4, "0")}`;
        const doc: DeliveryOrder = { ...o, id, history: [] };
        set((s) => ({ orders: [doc, ...s.orders], seq: s.seq + 1 }));
        useAuditStore.getState().log({
          module: "delivery", event: "DELIVERY_CREATED", recordId: id, branch: doc.branch, severity: "info",
          newValue: doc.customer,
        });
        return doc;
      },
      updateOrder: (id, patch) =>
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      moveStage: (id, to, by, note) => {
        const o = get().orders.find((x) => x.id === id);
        if (!o) return { ok: false, error: "Not found" };
        const err = validate(o, to);
        if (err) return { ok: false, error: err };
        const from = o.stage;
        const patch: Partial<DeliveryOrder> = {
          stage: to,
          history: [...o.history, { at: Date.now(), from, to, by, note }],
        };
        if (to === "Dispatched") patch.dispatchedAt = Date.now();
        if (to === "Delivered") patch.deliveredAt = Date.now();
        set((s) => ({ orders: s.orders.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

        const evMap: Record<Stage, string> = {
          Pending: "DELIVERY_UPDATED",
          Assigned: "DELIVERY_DRIVER_ASSIGNED",
          Loading: "DELIVERY_LOADING_STARTED",
          "Ready to Dispatch": "DELIVERY_LOADING_COMPLETED",
          Dispatched: "DELIVERY_DISPATCHED",
          "Partially Delivered": "DELIVERY_PARTIALLY_COMPLETED",
          Delivered: "DELIVERY_COMPLETED",
          Failed: "DELIVERY_FAILED",
          "Returned to Branch": "DELIVERY_RETURNED_TO_BRANCH",
          Cancelled: "DELIVERY_UPDATED",
          Rescheduled: "DELIVERY_RESCHEDULED",
        };
        useAuditStore.getState().log({
          module: "delivery", event: evMap[to], recordId: id, branch: o.branch,
          oldValue: from, newValue: to, reason: note, severity: to === "Failed" ? "critical" : "info",
        });
        return { ok: true };
      },
      addDriver: (d) => set((s) => ({ drivers: [...s.drivers, d] })),
      updateDriver: (empId, patch) =>
        set((s) => ({ drivers: s.drivers.map((d) => (d.empId === empId ? { ...d, ...patch } : d)) })),
      addVehicle: (v) => set((s) => ({ vehicles: [...s.vehicles, v] })),
      updateVehicle: (id, patch) =>
        set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
      addZone: (z) =>
        set((s) => ({ zones: [...s.zones, { ...z, id: `Z-${String(s.zones.length + 1).padStart(2, "0")}` }] })),
      removeZone: (id) => set((s) => ({ zones: s.zones.filter((z) => z.id !== id) })),
      reset: () => set({ orders: seedOrders, drivers: seedDrivers, vehicles: seedVehicles, zones: seedZones, seq: 1026 }),
    }),
    { name: "buildpos-delivery-v1" }
  )
);

export const STAGE_TONE: Record<Stage, "info" | "warning" | "success" | "critical" | "muted"> = {
  Pending: "warning",
  Assigned: "info",
  Loading: "info",
  "Ready to Dispatch": "info",
  Dispatched: "info",
  "Partially Delivered": "warning",
  Delivered: "success",
  Failed: "critical",
  "Returned to Branch": "warning",
  Cancelled: "muted",
  Rescheduled: "warning",
};

export function allowedNext(stage: Stage): Stage[] {
  return ALLOWED_TRANSITIONS[stage];
}