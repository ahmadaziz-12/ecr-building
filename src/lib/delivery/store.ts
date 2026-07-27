import { create } from "zustand";
import { useAuditStore } from "@/lib/store/audit";
import {
  apiCreateDeliveryOrder, apiCreateZone, apiDeleteZone, apiReserveStock, apiTransitionDelivery,
  apiCreateDriver, apiUpdateDriver, apiCreateVehicle, apiUpdateVehicle,
  apiApproveDeliveryMove, apiRejectDeliveryMove,
  mapApiDriver, mapApiOrder, mapApiVehicle, mapApiZone, mapApiApproval, type DeliveryApproval,
  STAGE_TO_BACKEND, VEHICLE_TYPE_TO_BACKEND, DRIVER_STATUS_TO_BACKEND, VEHICLE_STATUS_TO_BACKEND,
} from "@/lib/api/delivery";

export type { DeliveryApproval } from "@/lib/api/delivery";

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

export type ActionResult = { ok: boolean; error?: string };

export type DriverInput = { name: string; branch: string; mobile: string; license: string; licenseExpiry: string };
export type DriverEditInput = DriverInput & { vehicleId?: string; status: Driver["status"] };
export type VehicleInput = { registration: string; type: Vehicle["type"]; branch: string; capacityTons: number };
export type VehicleEditInput = VehicleInput & { status: Vehicle["status"] };

type S = {
  orders: DeliveryOrder[];
  drivers: Driver[];
  vehicles: Vehicle[];
  zones: Zone[];
  lookups: LookupMaps;
  // Delivery:Edit users' moves land here as Pending instead of changing `orders` directly — see
  // moveStage below. Delivery:Full users never populate this for their own moves.
  pendingApprovals: DeliveryApproval[];
  setSynced: (data: Partial<Pick<S, "orders" | "drivers" | "vehicles" | "zones" | "lookups" | "pendingApprovals">>) => void;
  addOrder: (o: Omit<DeliveryOrder, "id" | "history">) => Promise<ActionResult & { doc?: DeliveryOrder }>;
  updateOrder: (id: string, patch: Partial<DeliveryOrder>) => void;
  reserveStock: (id: string) => Promise<ActionResult>;
  moveStage: (id: string, to: Stage, by: string, note?: string) => Promise<ActionResult & { applied?: boolean; pendingApproval?: DeliveryApproval }>;
  approveMove: (approvalId: number) => Promise<ActionResult>;
  rejectMove: (approvalId: number) => Promise<ActionResult>;
  addDriver: (input: DriverInput) => Promise<ActionResult>;
  updateDriver: (empId: string, patch: Partial<Driver>) => void;
  editDriver: (empId: string, input: DriverEditInput) => Promise<ActionResult>;
  addVehicle: (input: VehicleInput) => Promise<ActionResult>;
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void;
  editVehicle: (id: string, input: VehicleEditInput) => Promise<ActionResult>;
  addZone: (z: Omit<Zone, "id">) => Promise<ActionResult>;
  removeZone: (id: string) => Promise<ActionResult>;
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

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const useDeliveryStore = create<S>()((set, get) => ({
  orders: [],
  drivers: [],
  vehicles: [],
  zones: [],
  lookups: { productIdBySku: {}, branchIdByName: {} },
  pendingApprovals: [],
  setSynced: (data) => set((s) => ({ ...s, ...data })),

  // Backend-first: resolves SKUs/branch/driver/vehicle against the live catalog synced into
  // `lookups`, then waits for the real DB row before it ever appears in the UI — no phantom
  // orders that look created but never made it past a validation error on the server.
  addOrder: async (o) => {
    const { productIdBySku, branchIdByName } = get().lookups;
    const branchId =
      branchIdByName[o.branch] ?? Object.entries(branchIdByName).find(([name]) => name.includes(o.address.city))?.[1];
    if (!branchId) return { ok: false, error: `Unknown branch "${o.branch}".` };

    const lineInputs = o.lines
      .map((l) => ({ productId: productIdBySku[l.sku], deliveryQty: l.deliveryQty }))
      .filter((l): l is { productId: number; deliveryQty: number } => Boolean(l.productId));
    if (lineInputs.length === 0) return { ok: false, error: "None of these SKUs match the product catalog." };

    const driverId = o.driverEmpId ? Number(o.driverEmpId.replace("EMP-", "")) : null;
    const vehicleBackendId = o.vehicleId ? (get().vehicles.find((v) => v.id === o.vehicleId)?._backendId ?? null) : null;

    try {
      let created = await apiCreateDeliveryOrder({
        orderId: null, customerId: null, project: o.project ?? null, poRef: o.poRef ?? null, branchId,
        weightTons: o.weightTons, area: o.area,
        address: {
          type: o.address.type, contactName: o.address.contactName, contactMobile: o.address.contactMobile,
          city: o.address.city, district: o.address.district || null, street: o.address.street || null,
          landmark: o.address.landmark ?? null, instructions: o.address.instructions ?? null,
        },
        promisedDate: o.promisedDate, promisedTime: o.promisedTime, timeSlot: o.timeSlot ?? null, priority: o.priority,
        driverId, vehicleId: vehicleBackendId, amount: o.amount,
        charges: { fee: o.charges.fee, handling: o.charges.handling, heavy: o.charges.heavy, discount: o.charges.discount },
        lines: lineInputs,
      });

      if (o.stockReserved) {
        try {
          created = await apiReserveStock(created.id);
        } catch (err) {
          console.warn("Order created but stock reservation failed:", err);
        }
      }

      const doc = mapApiOrder(created);
      set((s) => ({ orders: [doc, ...s.orders] }));
      useAuditStore.getState().log({
        module: "delivery", event: "DELIVERY_CREATED", recordId: doc.id, branch: doc.branch, severity: "info",
        newValue: doc.customer,
      });
      return { ok: true, doc };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not create delivery order.") };
    }
  },

  updateOrder: (id, patch) =>
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),

  // Backend-first: the reserved flag only flips once the server actually reserved the stock —
  // a failed reservation surfaces its error instead of faking the flag locally.
  reserveStock: async (id) => {
    const o = get().orders.find((x) => x.id === id);
    if (!o) return { ok: false, error: "Not found" };
    if (o.stockReserved) return { ok: true };
    if (!o._backendId) return { ok: false, error: "This order has no backend record to reserve." };
    try {
      const updated = await apiReserveStock(o._backendId);
      const doc = mapApiOrder(updated);
      set((s) => ({ orders: s.orders.map((x) => (x.id === id ? doc : x)) }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not reserve stock.") };
    }
  },

  // Backend-first: the state-machine guards run here for a fast local rejection, but the stage
  // only actually changes once the server confirms the transition — same guards run again there
  // against the authoritative row, so a stale client can't fake a transition it lost the race on.
  moveStage: async (id, to, by, note) => {
    const o = get().orders.find((x) => x.id === id);
    if (!o) return { ok: false, error: "Not found" };
    const err = validate(o, to);
    if (err) return { ok: false, error: err };
    if (!o._backendId) return { ok: false, error: "This order has no backend record to transition." };

    const driverBackendId = o.driverEmpId ? Number(o.driverEmpId.replace("EMP-", "")) : undefined;
    const vehicleBackendId = get().vehicles.find((v) => v.id === o.vehicleId)?._backendId;

    try {
      const result = await apiTransitionDelivery(o._backendId, {
        toStage: STAGE_TO_BACKEND[to],
        driverId: driverBackendId, vehicleId: vehicleBackendId,
        lines: o.lines.map((l) => ({
          productId: get().lookups.productIdBySku[l.sku], loadedQty: l.loadedQty, deliveredQty: l.deliveredQty,
          missingQty: l.missingQty, damagedQty: l.damagedQty,
        })).filter((l) => l.productId),
        receivedBy: o.receivedBy ?? null, proof: o.proof ?? null, failureReason: o.failureReason ?? null,
        nextAction: o.nextAction ?? null, note: note ?? null,
      });

      const doc = mapApiOrder(result.order);
      set((s) => ({ orders: s.orders.map((x) => (x.id === id ? doc : x)) }));

      // Delivery:Edit users land here instead of actually moving the order — a Delivery:Full user
      // (which may or may not be them) still has to approve it via approveMove below.
      if (!result.applied) {
        const pendingApproval = result.pendingApproval ? mapApiApproval(result.pendingApproval) : undefined;
        if (pendingApproval) set((s) => ({ pendingApprovals: [pendingApproval, ...s.pendingApprovals] }));
        useAuditStore.getState().log({
          module: "delivery", event: "DELIVERY_STAGE_CHANGE_REQUESTED", recordId: id, branch: o.branch,
          oldValue: o.stage, newValue: to, reason: note, severity: "info",
        });
        return { ok: true, applied: false, pendingApproval };
      }

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
        oldValue: o.stage, newValue: to, reason: note, severity: to === "Failed" ? "critical" : "info",
      });
      return { ok: true, applied: true };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not move stage.") };
    }
  },

  // Delivery:Full only (enforced server-side) — approves someone else's pending move request and
  // actually applies the stage change; self-approval is rejected by the server regardless.
  approveMove: async (approvalId) => {
    try {
      const result = await apiApproveDeliveryMove(approvalId);
      const doc = mapApiOrder(result.order);
      set((s) => ({
        orders: s.orders.map((x) => (x._backendId === result.order.id ? doc : x)),
        pendingApprovals: s.pendingApprovals.filter((a) => a.id !== approvalId),
      }));
      useAuditStore.getState().log({
        module: "delivery", event: "DELIVERY_STAGE_CHANGE_APPROVED", recordId: doc.id, branch: doc.branch, severity: "info",
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not approve this request.") };
    }
  },

  rejectMove: async (approvalId) => {
    try {
      await apiRejectDeliveryMove(approvalId);
      set((s) => ({ pendingApprovals: s.pendingApprovals.filter((a) => a.id !== approvalId) }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not reject this request.") };
    }
  },

  addDriver: async (input) => {
    const branchId = get().lookups.branchIdByName[input.branch];
    if (!branchId) return { ok: false, error: `Unknown branch "${input.branch}".` };
    try {
      const created = await apiCreateDriver({
        name: input.name, branchId, mobile: input.mobile, license: input.license, licenseExpiry: input.licenseExpiry,
      });
      set((s) => ({ drivers: [...s.drivers, mapApiDriver(created)] }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not create driver.") };
    }
  },
  updateDriver: (empId, patch) =>
    set((s) => ({ drivers: s.drivers.map((d) => (d.empId === empId ? { ...d, ...patch } : d)) })),
  editDriver: async (empId, input) => {
    const driver = get().drivers.find((d) => d.empId === empId);
    if (!driver?._backendId) return { ok: false, error: "Driver not found." };
    const branchId = get().lookups.branchIdByName[input.branch];
    if (!branchId) return { ok: false, error: `Unknown branch "${input.branch}".` };
    const vehicleBackendId = input.vehicleId ? (get().vehicles.find((v) => v.id === input.vehicleId)?._backendId ?? null) : null;
    try {
      const updated = await apiUpdateDriver(driver._backendId, {
        name: input.name, branchId, mobile: input.mobile, license: input.license, licenseExpiry: input.licenseExpiry,
        vehicleId: vehicleBackendId, status: DRIVER_STATUS_TO_BACKEND[input.status] ?? "Available",
      });
      set((s) => ({ drivers: s.drivers.map((d) => (d.empId === empId ? mapApiDriver(updated) : d)) }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not update driver.") };
    }
  },

  addVehicle: async (input) => {
    const branchId = get().lookups.branchIdByName[input.branch];
    if (!branchId) return { ok: false, error: `Unknown branch "${input.branch}".` };
    try {
      const created = await apiCreateVehicle({
        registration: input.registration, type: VEHICLE_TYPE_TO_BACKEND[input.type] ?? "Pickup", branchId, capacityTons: input.capacityTons,
      });
      set((s) => ({ vehicles: [...s.vehicles, mapApiVehicle(created)] }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not create vehicle.") };
    }
  },
  updateVehicle: (id, patch) =>
    set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
  editVehicle: async (id, input) => {
    const vehicle = get().vehicles.find((v) => v.id === id);
    if (!vehicle?._backendId) return { ok: false, error: "Vehicle not found." };
    const branchId = get().lookups.branchIdByName[input.branch];
    if (!branchId) return { ok: false, error: `Unknown branch "${input.branch}".` };
    try {
      const updated = await apiUpdateVehicle(vehicle._backendId, {
        registration: input.registration, type: VEHICLE_TYPE_TO_BACKEND[input.type] ?? "Pickup", branchId,
        capacityTons: input.capacityTons, status: VEHICLE_STATUS_TO_BACKEND[input.status] ?? "Available",
      });
      set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === id ? mapApiVehicle(updated) : v)) }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not update vehicle.") };
    }
  },

  addZone: async (z) => {
    try {
      const created = await apiCreateZone(z);
      set((s) => ({ zones: [...s.zones, mapApiZone(created)] }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not create zone.") };
    }
  },
  removeZone: async (id) => {
    const zone = get().zones.find((z) => z.id === id);
    if (!zone?._backendId) return { ok: false, error: "Zone not found." };
    try {
      await apiDeleteZone(zone._backendId);
      set((s) => ({ zones: s.zones.filter((z) => z.id !== id) }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err, "Could not delete zone.") };
    }
  },

  reset: () => set({ orders: [], drivers: [], vehicles: [], zones: [] }),
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
