import { useEffect } from "react";
import { useDeliveryOrdersApi, useDriversApi, useVehiclesApi, useZonesApi, useDeliveryApprovalsApi, mapApiOrder, mapApiDriver, mapApiVehicle, mapApiZone, mapApiApproval } from "./delivery";
import { useBranches } from "./admin";
import { useProducts } from "./catalog";
import { useDeliveryStore } from "@/lib/delivery/store";

// Mounted once (in AppLayout) — mirrors the live backend into the existing Zustand delivery
// store so every delivery/*.tsx component keeps working unchanged, but now reads real DB data
// instead of the old localStorage-persisted mock.
export function DeliverySync() {
  const orders = useDeliveryOrdersApi();
  const drivers = useDriversApi();
  const vehicles = useVehiclesApi();
  const zones = useZonesApi();
  const approvals = useDeliveryApprovalsApi();
  const branches = useBranches();
  const products = useProducts();
  const setSynced = useDeliveryStore((s) => s.setSynced);

  useEffect(() => {
    if (orders.data) setSynced({ orders: orders.data.map(mapApiOrder) });
  }, [orders.data, setSynced]);

  useEffect(() => {
    if (approvals.data) setSynced({ pendingApprovals: approvals.data.filter((a) => a.status === "Pending").map(mapApiApproval) });
  }, [approvals.data, setSynced]);

  useEffect(() => {
    if (drivers.data) setSynced({ drivers: drivers.data.map(mapApiDriver) });
  }, [drivers.data, setSynced]);

  useEffect(() => {
    if (vehicles.data) setSynced({ vehicles: vehicles.data.map(mapApiVehicle) });
  }, [vehicles.data, setSynced]);

  useEffect(() => {
    if (zones.data) setSynced({ zones: zones.data.map(mapApiZone) });
  }, [zones.data, setSynced]);

  useEffect(() => {
    if (branches.data && products.data) {
      setSynced({
        lookups: {
          branchIdByName: Object.fromEntries(branches.data.map((b) => [b.nameEn, b.id])),
          productIdBySku: Object.fromEntries(products.data.map((p) => [p.sku, p.id])),
        },
      });
    }
  }, [branches.data, products.data, setSynced]);

  return null;
}
