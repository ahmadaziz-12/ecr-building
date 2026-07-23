import { create } from "zustand";
import { useAuditStore } from "@/lib/store/audit";
import {
  apiCreateZone, apiReserveStock, apiTransitionDelivery, STAGE_TO_BACKEND, VEHICLE_TYPE_TO_BACKEND,
} from "@/lib/api/delivery";

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
  _backendId?: number;
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
  _backendId?: number;
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
  _backendId?: number;
};

export type Zone = {
  id: string;
  name: string;
  city: string;
  distanceKm: number;
  fee: number;
  _backendId?: number;
};

/* -------- store (backed by the .NET API — see DeliverySync in AppLayout) -------- */

type LookupMaps = {
  productIdBySku: Record<string, number>;
  branchIdByName: Record<string, number>;
};

type S = {
  orders: DeliveryOrder[];
  drivers: Driver[];
  vehicles: Vehicle[];
  zones: Zone[];
  seq: number;
  lookups: LookupMaps;
  setSynced: (data: Partial<Pick<S, "orders" | "drivers" | "vehicles" | "zones" | "lookups">>) => void;
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

export const useDeliveryStore = create<S>()((set, get) => ({
  orders: [],
  drivers: [],
  vehicles: [],
  zones: [],
  seq: orderSeq,
  lookups: { productIdBySku: {}, branchIdByName: {} },
  setSynced: (data) => set((s) => ({ ...s, ...data })),
  addOrder: (o) => {
    const id = `DO-2026-${String(get().seq).padStart(4, "0")}`;
    const doc: DeliveryOrder = { ...o, id, history: [] };
    set((s) => ({ orders: [doc, ...s.orders], seq: s.seq + 1 }));
    useAuditStore.getState().log({
      module: "delivery", event: "DELIVERY_CREATED", recordId: id, branch: doc.branch, severity: "info",
      newValue: doc.customer,
    });

    // Best-effort real persistence — resolves SKUs/branch against the live catalog synced into `lookups`.
    // Falls back to local-only if a SKU/branch can't be matched (e.g. dialog defaults not seeded).
    const { productIdBySku, branchIdByName } = get().lookups;
    const branchId =
      branchIdByName[doc.branch] ?? Object.entries(branchIdByName).find(([name]) => name.includes(doc.address.city))?.[1];
    const lineInputs = doc.lines
      .map((l) => ({ productId: productIdBySku[l.sku], deliveryQty: l.deliveryQty }))
      .filter((l): l is { productId: number; deliveryQty: number } => Boolean(l.productId));

    if (branchId && lineInputs.length > 0) {
      import("@/lib/api/client").then(({ apiPost }) =>
        apiPost("/api/delivery/orders", {
          orderId: null,
          customerId: null,
          project: doc.project ?? null,
          poRef: doc.poRef ?? null,
          branchId,
          weightTons: doc.weightTons,
          area: doc.area,
          address: {
            type: doc.address.type, contactName: doc.address.contactName, contactMobile: doc.address.contactMobile,
            city: doc.address.city, district: doc.address.district, street: doc.address.street,
            landmark: doc.address.landmark ?? null, instructions: doc.address.instructions ?? null,
          },
          promisedDate: doc.promisedDate,
          promisedTime: doc.promisedTime,
          timeSlot: doc.timeSlot ?? null,
          priority: doc.priority,
          driverId: null,
          vehicleId: null,
          amount: doc.amount,
          charges: { fee: doc.charges.fee, handling: doc.charges.handling, heavy: doc.charges.heavy, discount: doc.charges.discount },
          lines: lineInputs,
        }).catch((err) => console.warn("Delivery order not persisted to backend:", err)),
      );
    }
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

    // Real transition against the backend state machine — same guards, persisted to MariaDB.
    if (o._backendId) {
      const driverBackendId = o.driverEmpId ? Number(o.driverEmpId.replace("EMP-", "")) : undefined;
      const vehicleBackendId = get().vehicles.find((v) => v.id === o.vehicleId)?._backendId;
      apiTransitionDelivery(o._backendId, {
        toStage: STAGE_TO_BACKEND[to],
        driverId: driverBackendId, vehicleId: vehicleBackendId,
        lines: o.lines.map((l) => ({
          productId: get().lookups.productIdBySku[l.sku], loadedQty: l.loadedQty, deliveredQty: l.deliveredQty,
          missingQty: l.missingQty, damagedQty: l.damagedQty,
        })).filter((l) => l.productId),
        receivedBy: o.receivedBy ?? null, proof: o.proof ?? null, failureReason: o.failureReason ?? null,
        nextAction: o.nextAction ?? null, note: note ?? null,
      }).catch((err) => console.warn("Stage transition not persisted to backend:", err));
    }
    return { ok: true };
  },
  addDriver: (d) => set((s) => ({ drivers: [...s.drivers, d] })),
  updateDriver: (empId, patch) =>
    set((s) => ({ drivers: s.drivers.map((d) => (d.empId === empId ? { ...d, ...patch } : d)) })),
  addVehicle: (v) => set((s) => ({ vehicles: [...s.vehicles, v] })),
  updateVehicle: (id, patch) =>
    set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
  addZone: (z) => {
    const tempId = `Z-${String(get().zones.length + 1).padStart(2, "0")}`;
    set((s) => ({ zones: [...s.zones, { ...z, id: tempId }] }));
    apiCreateZone(z).catch((err) => console.warn("Zone not persisted to backend:", err));
  },
  removeZone: (id) => set((s) => ({ zones: s.zones.filter((z) => z.id !== id) })),
  reset: () => set({ orders: [], drivers: [], vehicles: [], zones: [], seq: 1026 }),
}));

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

export { apiReserveStock, VEHICLE_TYPE_TO_BACKEND };
