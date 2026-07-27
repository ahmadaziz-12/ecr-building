import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete } from "./client";
import type {
  DeliveryOrder, Driver, Vehicle, Zone, Stage, Priority, DeliveryLine,
} from "@/lib/delivery/store";

// ---- Backend DTO shapes (raw, PascalCase-no-space enums) ----
type ApiDeliveryLine = {
  productId: number; sku: string; productName: string; ordered: number; uom: string; unitWeight: number;
  deliveryQty: number; loadedQty: number; missingQty: number; damagedQty: number; deliveredQty: number;
};
type ApiHistory = { at: string; fromStage: string; toStage: string; byName: string; note: string | null };
export type ApiDeliveryOrder = {
  id: number; deliveryNo: string; orderId: number | null; customerId: number | null; customerName: string; customerType: string;
  project: string | null; poRef: string | null; branchId: number; branchName: string; paymentStatus: string;
  weightTons: number; area: string; addressType: string; contactName: string; contactMobile: string; city: string;
  district: string | null; street: string | null; landmark: string | null; instructions: string | null;
  promisedDate: string; promisedTime: string; timeSlot: string | null; priority: string;
  driverId: number | null; driverName: string | null; vehicleId: number | null; vehicleRegistration: string | null;
  amount: number; feeCharge: number; handlingCharge: number; heavyCharge: number; discountCharge: number; vatCharge: number;
  stockReserved: boolean; stage: string; dispatchedAt: string | null; deliveredAt: string | null; receivedBy: string | null;
  proof: string | null; failureReason: string | null; nextAction: string | null; notes: string | null;
  lines: ApiDeliveryLine[]; history: ApiHistory[]; overdue: boolean;
};
export type ApiDriver = {
  id: number; name: string; branchId: number; branchName: string; mobile: string; license: string; licenseExpiry: string;
  vehicleId: number | null; status: string; deliveriesToday: number; available: boolean;
};
export type ApiVehicle = {
  id: number; registration: string; type: string; branchId: number; branchName: string; capacityTons: number;
  currentLoad: number; status: string; deviceStatus: string;
};
export type ApiZone = { id: number; name: string; city: string; distanceKm: number; fee: number };

const STAGE_TO_FRONTEND: Record<string, Stage> = {
  Pending: "Pending", Assigned: "Assigned", Loading: "Loading", ReadyToDispatch: "Ready to Dispatch",
  Dispatched: "Dispatched", PartiallyDelivered: "Partially Delivered", Delivered: "Delivered", Failed: "Failed",
  ReturnedToBranch: "Returned to Branch", Cancelled: "Cancelled", Rescheduled: "Rescheduled",
};
export const STAGE_TO_BACKEND: Record<Stage, string> = {
  Pending: "Pending", Assigned: "Assigned", Loading: "Loading", "Ready to Dispatch": "ReadyToDispatch",
  Dispatched: "Dispatched", "Partially Delivered": "PartiallyDelivered", Delivered: "Delivered", Failed: "Failed",
  "Returned to Branch": "ReturnedToBranch", Cancelled: "Cancelled", Rescheduled: "Rescheduled",
};
const DRIVER_STATUS_TO_FRONTEND: Record<string, Driver["status"]> = {
  Available: "Available", Assigned: "Assigned", Loading: "Loading", OnDelivery: "On Delivery",
  OnBreak: "On Break", OffShift: "Off Shift", OnLeave: "On Leave", LicenceExpired: "Licence Expired", Inactive: "Inactive",
};
export const DRIVER_STATUS_TO_BACKEND: Record<string, string> = Object.fromEntries(Object.entries(DRIVER_STATUS_TO_FRONTEND).map(([k, v]) => [v, k]));
const VEHICLE_TYPE_TO_FRONTEND: Record<string, Vehicle["type"]> = {
  FlatbedTruck: "Flatbed Truck", BoxTruck: "Box Truck", Pickup: "Pickup", DeliveryVan: "Delivery Van", HeavyTruck: "Heavy Truck",
};
export const VEHICLE_TYPE_TO_BACKEND: Record<string, string> = Object.fromEntries(Object.entries(VEHICLE_TYPE_TO_FRONTEND).map(([k, v]) => [v, k]));
const VEHICLE_STATUS_TO_FRONTEND: Record<string, Vehicle["status"]> = {
  Available: "Available", Assigned: "Assigned", Loading: "Loading", OnDelivery: "On Delivery", Maintenance: "Maintenance", Inactive: "Inactive",
};
export const VEHICLE_STATUS_TO_BACKEND: Record<string, string> = Object.fromEntries(Object.entries(VEHICLE_STATUS_TO_FRONTEND).map(([k, v]) => [v, k]));
const CUSTOMER_TYPE_TO_FRONTEND: Record<string, DeliveryOrder["customerType"]> = {
  WalkIn: "Walk-in", Retail: "Retail", Contractor: "Contractor", B2B: "B2B",
};
const PAYMENT_STATUS_TO_FRONTEND: Record<string, DeliveryOrder["paymentStatus"]> = {
  Unpaid: "Unpaid", Paid: "Paid", PartiallyPaid: "Partial", Refunded: "Unpaid", Cancelled: "Unpaid",
};

export function mapApiOrder(o: ApiDeliveryOrder): DeliveryOrder {
  const lines: DeliveryLine[] = o.lines.map((l) => ({
    sku: l.sku, product: l.productName, ordered: l.ordered, uom: l.uom, unitWeight: l.unitWeight,
    deliveryQty: l.deliveryQty, loadedQty: l.loadedQty, missingQty: l.missingQty, damagedQty: l.damagedQty, deliveredQty: l.deliveredQty,
    reserved: o.stockReserved,
  }));
  return {
    id: o.deliveryNo, orderId: o.orderId ? String(o.orderId) : "", customer: o.customerName,
    customerType: CUSTOMER_TYPE_TO_FRONTEND[o.customerType] ?? "Walk-in", project: o.project ?? undefined, poRef: o.poRef ?? undefined,
    branch: o.branchName, paymentStatus: PAYMENT_STATUS_TO_FRONTEND[o.paymentStatus] ?? "Unpaid", lines,
    weightTons: o.weightTons, area: o.area,
    address: {
      type: (o.addressType as DeliveryOrder["address"]["type"]) ?? "Customer Address", contactName: o.contactName,
      contactMobile: o.contactMobile, city: o.city, district: o.district ?? "", street: o.street ?? "",
      landmark: o.landmark ?? undefined, instructions: o.instructions ?? undefined,
    },
    promisedDate: o.promisedDate, promisedTime: o.promisedTime, timeSlot: o.timeSlot ?? undefined,
    priority: o.priority as Priority,
    driverEmpId: o.driverId ? `EMP-${o.driverId}` : undefined, driverName: o.driverName ?? undefined,
    vehicleId: o.vehicleRegistration ?? undefined, vehicleType: undefined, vehicleCapacity: undefined,
    amount: o.amount, charges: { fee: o.feeCharge, handling: o.handlingCharge, heavy: o.heavyCharge, discount: o.discountCharge, vat: o.vatCharge },
    stockReserved: o.stockReserved, stage: STAGE_TO_FRONTEND[o.stage] ?? "Pending",
    dispatchedAt: o.dispatchedAt ? new Date(o.dispatchedAt).getTime() : undefined,
    deliveredAt: o.deliveredAt ? new Date(o.deliveredAt).getTime() : undefined,
    receivedBy: o.receivedBy ?? undefined, proof: o.proof ?? undefined, failureReason: o.failureReason ?? undefined,
    nextAction: o.nextAction ?? undefined, notes: o.notes ?? undefined,
    history: o.history.map((h) => ({
      at: new Date(h.at).getTime(), from: STAGE_TO_FRONTEND[h.fromStage] ?? "Pending", to: STAGE_TO_FRONTEND[h.toStage] ?? "Pending",
      by: h.byName, note: h.note ?? undefined,
    })),
    _backendId: o.id,
  } as DeliveryOrder & { _backendId: number };
}

export function mapApiDriver(d: ApiDriver): Driver {
  return {
    empId: `EMP-${d.id}`, name: d.name, branch: d.branchName, mobile: d.mobile, license: d.license,
    licenseExpiry: d.licenseExpiry, vehicleId: d.vehicleId ? String(d.vehicleId) : undefined,
    status: DRIVER_STATUS_TO_FRONTEND[d.status] ?? "Available", deliveriesToday: d.deliveriesToday,
    _backendId: d.id,
  } as Driver & { _backendId: number };
}

export function mapApiVehicle(v: ApiVehicle): Vehicle {
  return {
    id: v.registration, registration: v.registration, type: VEHICLE_TYPE_TO_FRONTEND[v.type] ?? "Pickup", branch: v.branchName,
    capacityTons: v.capacityTons, currentLoad: v.currentLoad, status: VEHICLE_STATUS_TO_FRONTEND[v.status] ?? "Available",
    deviceStatus: v.deviceStatus as Vehicle["deviceStatus"], _backendId: v.id,
  } as Vehicle & { _backendId: number };
}

export function mapApiZone(z: ApiZone): Zone {
  return { id: `Z-${z.id}`, name: z.name, city: z.city, distanceKm: z.distanceKm, fee: z.fee, _backendId: z.id } as Zone & { _backendId: number };
}

export const useDeliveryOrdersApi = (enabled = true) => useQuery({ queryKey: ["delivery", "orders"], queryFn: () => apiGet<ApiDeliveryOrder[]>("/api/delivery/orders"), enabled });
export const useDriversApi = (enabled = true) => useQuery({ queryKey: ["delivery", "drivers"], queryFn: () => apiGet<ApiDriver[]>("/api/delivery/drivers"), enabled });
export const useVehiclesApi = (enabled = true) => useQuery({ queryKey: ["delivery", "vehicles"], queryFn: () => apiGet<ApiVehicle[]>("/api/delivery/vehicles"), enabled });
export const useZonesApi = (enabled = true) => useQuery({ queryKey: ["delivery", "zones"], queryFn: () => apiGet<ApiZone[]>("/api/delivery/zones"), enabled });

export function useInvalidateDelivery() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["delivery"] });
  };
}

export type CreateDeliveryOrderRequest = {
  orderId: number | null; customerId: number | null; project: string | null; poRef: string | null; branchId: number;
  weightTons: number; area: string;
  address: {
    type: string; contactName: string; contactMobile: string; city: string;
    district: string | null; street: string | null; landmark: string | null; instructions: string | null;
  };
  promisedDate: string; promisedTime: string; timeSlot: string | null; priority: string;
  driverId: number | null; vehicleId: number | null; amount: number;
  charges: { fee: number; handling: number; heavy: number; discount: number };
  lines: { productId: number; deliveryQty: number }[];
};
export async function apiCreateDeliveryOrder(body: CreateDeliveryOrderRequest) {
  return apiPost<ApiDeliveryOrder>("/api/delivery/orders", body);
}
export async function apiTransitionDelivery(backendId: number, body: Record<string, unknown>) {
  return apiPut<ApiDeliveryOrder>(`/api/delivery/orders/${backendId}/transition`, body);
}
export async function apiReserveStock(backendId: number) {
  return apiPut<ApiDeliveryOrder>(`/api/delivery/orders/${backendId}/reserve-stock`);
}
export async function apiCreateZone(body: { name: string; city: string; distanceKm: number; fee: number }) {
  return apiPost<ApiZone>("/api/delivery/zones", body);
}
export async function apiDeleteZone(backendId: number) {
  return apiDelete<void>(`/api/delivery/zones/${backendId}`);
}

export type UpsertDriverRequest = { name: string; branchId: number; mobile: string; license: string; licenseExpiry: string };
export type UpdateDriverRequest = UpsertDriverRequest & { vehicleId: number | null; status: string };
export async function apiCreateDriver(body: UpsertDriverRequest) {
  return apiPost<ApiDriver>("/api/delivery/drivers", body);
}
export async function apiUpdateDriver(backendId: number, body: UpdateDriverRequest) {
  return apiPut<ApiDriver>(`/api/delivery/drivers/${backendId}`, body);
}

export type UpsertVehicleRequest = { registration: string; type: string; branchId: number; capacityTons: number };
export type UpdateVehicleRequest = UpsertVehicleRequest & { status: string };
export async function apiCreateVehicle(body: UpsertVehicleRequest) {
  return apiPost<ApiVehicle>("/api/delivery/vehicles", body);
}
export async function apiUpdateVehicle(backendId: number, body: UpdateVehicleRequest) {
  return apiPut<ApiVehicle>(`/api/delivery/vehicles/${backendId}`, body);
}
