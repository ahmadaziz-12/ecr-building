import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeliveryStore, type DeliveryOrder, type Stage, allowedNext } from "@/lib/delivery/store";
import { useHrStore, driverAvailable } from "@/lib/hr/store";

export function StageActionDialog({
  order,
  onClose,
}: {
  order: DeliveryOrder | null;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<Stage | "">("");
  const [reason, setReason] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [linesLoaded, setLinesLoaded] = useState<Record<string, number>>({});
  const [linesDelivered, setLinesDelivered] = useState<Record<string, number>>({});
  const [driverEmpId, setDriverEmpId] = useState(order?.driverEmpId ?? "");
  const [vehicleId, setVehicleId] = useState(order?.vehicleId ?? "");
  const [signature, setSignature] = useState("");

  const moveStage = useDeliveryStore((s) => s.moveStage);
  const updateOrder = useDeliveryStore((s) => s.updateOrder);
  const drivers = useDeliveryStore((s) => s.drivers);
  const vehicles = useDeliveryStore((s) => s.vehicles);
  const employees = useHrStore((s) => s.employees);

  const next = useMemo(() => (order ? allowedNext(order.stage) : []), [order]);

  if (!order) return null;
  const driverEmp = employees.find((e) => e.id === driverEmpId);
  const chk = driverEmpId ? driverAvailable(driverEmpId) : null;

  function submit() {
    if (!target) {
      toast.error("Choose a next stage.");
      return;
    }
    // Apply per-stage side-effects
    if (target === "Assigned") {
      if (!driverEmpId || !vehicleId) {
        toast.error("Driver and vehicle are required.");
        return;
      }
      if (chk && !chk.ok) {
        toast.error(`Driver unavailable — ${chk.reason}.`);
        return;
      }
      updateOrder(order.id, { driverEmpId, driverName: driverEmp ? `${driverEmp.firstName} ${driverEmp.lastName}` : undefined, vehicleId });
    }
    if (target === "Loading") {
      updateOrder(order.id, { stockReserved: true });
    }
    if (target === "Ready to Dispatch") {
      const lines = order.lines.map((l) => ({ ...l, loadedQty: linesLoaded[l.sku] ?? l.deliveryQty }));
      updateOrder(order.id, { lines });
    }
    if (target === "Delivered" || target === "Partially Delivered") {
      if (!receivedBy) {
        toast.error("Receiver name is required for delivery confirmation.");
        return;
      }
      const lines = order.lines.map((l) => ({ ...l, deliveredQty: linesDelivered[l.sku] ?? (target === "Delivered" ? l.deliveryQty : 0) }));
      updateOrder(order.id, { lines, receivedBy, proof: signature || undefined });
    }
    if (target === "Failed") {
      if (!reason) {
        toast.error("Failure reason is required.");
        return;
      }
      updateOrder(order.id, { failureReason: reason, nextAction: "Reschedule" });
    }
    if (target === "Returned to Branch" && !reason) {
      toast.error("Reason is required for return-to-branch.");
      return;
    }
    const res = moveStage(order.id, target as Stage, "Current User", reason || undefined);
    if (!res.ok) {
      toast.error(res.error ?? "Could not move stage.");
      return;
    }
    toast.success(`${order.id} → ${target}`);
    // Update driver / vehicle statuses
    if (target === "Dispatched" && order.driverEmpId) {
      useDeliveryStore.getState().updateDriver(order.driverEmpId, { status: "On Delivery", currentDelivery: order.id });
      if (order.vehicleId) useDeliveryStore.getState().updateVehicle(order.vehicleId, { status: "On Delivery", currentDelivery: order.id });
    }
    if ((target === "Delivered" || target === "Failed") && order.driverEmpId) {
      useDeliveryStore.getState().updateDriver(order.driverEmpId, { status: "Available", currentDelivery: undefined });
      if (order.vehicleId) useDeliveryStore.getState().updateVehicle(order.vehicleId, { status: "Available", currentDelivery: undefined });
    }
    onClose();
  }

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{order.id} · move to next stage</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-black/5 bg-canvas p-3 text-xs">
            <div><span className="text-muted-foreground">Current:</span> <strong>{order.stage}</strong></div>
            <div><span className="text-muted-foreground">Customer:</span> <strong>{order.customer}</strong></div>
            <div><span className="text-muted-foreground">Driver:</span> <strong>{order.driverName ?? "—"}</strong></div>
            <div><span className="text-muted-foreground">Vehicle:</span> <strong>{order.vehicleId ?? "—"}</strong></div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Move to</label>
            <div className="flex flex-wrap gap-2">
              {next.length === 0 && <span className="text-sm text-muted-foreground">Terminal stage — no further transitions.</span>}
              {next.map((s) => (
                <button
                  key={s}
                  onClick={() => setTarget(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    target === s ? "border-brand bg-brand text-brand-foreground" : "border-black/10 bg-white hover:border-brand/40"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {target === "Assigned" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Driver</label>
                <select className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm" value={driverEmpId} onChange={(e) => setDriverEmpId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {drivers.map((d) => {
                    const c = driverAvailable(d.empId);
                    return <option key={d.empId} value={d.empId} disabled={!c.ok}>{d.name} — {c.ok ? d.status : `⛔ ${c.reason}`}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vehicle</label>
                <select className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.id} — {v.type} · {v.capacityTons}t</option>)}
                </select>
              </div>
            </div>
          )}

          {target === "Ready to Dispatch" && (
            <div className="overflow-x-auto rounded-lg border border-black/5">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-[10px] uppercase text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left">SKU</th><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Reserved</th><th className="px-3 py-2 text-right">Loaded</th></tr>
                </thead>
                <tbody>
                  {order.lines.map((l) => (
                    <tr key={l.sku} className="border-t border-black/5">
                      <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                      <td className="px-3 py-2">{l.product}</td>
                      <td className="px-3 py-2 text-right">{l.deliveryQty}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" max={l.deliveryQty} defaultValue={l.deliveryQty} onChange={(e) => setLinesLoaded((s) => ({ ...s, [l.sku]: Number(e.target.value) }))} className="w-20 rounded border border-black/10 px-2 py-1 text-right text-sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(target === "Delivered" || target === "Partially Delivered") && (
            <>
              <div className="overflow-x-auto rounded-lg border border-black/5">
                <table className="w-full text-sm">
                  <thead className="bg-canvas text-[10px] uppercase text-muted-foreground">
                    <tr><th className="px-3 py-2 text-left">SKU</th><th className="px-3 py-2 text-right">Dispatched</th><th className="px-3 py-2 text-right">Delivered</th></tr>
                  </thead>
                  <tbody>
                    {order.lines.map((l) => (
                      <tr key={l.sku} className="border-t border-black/5">
                        <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                        <td className="px-3 py-2 text-right">{l.loadedQty ?? l.deliveryQty}</td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" max={l.loadedQty ?? l.deliveryQty} defaultValue={target === "Delivered" ? (l.loadedQty ?? l.deliveryQty) : 0} onChange={(e) => setLinesDelivered((s) => ({ ...s, [l.sku]: Number(e.target.value) }))} className="w-20 rounded border border-black/10 px-2 py-1 text-right text-sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input placeholder="Receiver name *" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm" />
                <input placeholder="Signature (type name as proof)" value={signature} onChange={(e) => setSignature(e.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm italic" />
              </div>
            </>
          )}

          {(target === "Failed" || target === "Returned to Branch" || target === "Rescheduled" || target === "Cancelled" || target === "Partially Delivered") && (
            <textarea placeholder="Reason / note *" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm" />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={!target} className="bg-brand text-brand-foreground hover:bg-brand/90">Confirm</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}