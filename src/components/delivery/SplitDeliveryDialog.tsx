import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeliveryStore, type DeliveryOrder, remainingLines } from "@/lib/delivery/store";
import { useAuth } from "@/lib/api/auth";

const TIME_SLOTS = ["08:00 AM–10:00 AM", "10:00 AM–12:00 PM", "12:00 PM–02:00 PM", "02:00 PM–04:00 PM", "04:00 PM–06:00 PM", "06:00 PM–08:00 PM"];

export function SplitDeliveryDialog({ order, onClose }: { order: DeliveryOrder | null; onClose: () => void }) {
  if (!order) return null;
  return <SplitDeliveryInner order={order} onClose={onClose} />;
}

function SplitDeliveryInner({ order, onClose }: { order: DeliveryOrder; onClose: () => void }) {
  const lines = useMemo(() => remainingLines(order), [order]);
  const [promisedDate, setPromisedDate] = useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0]);
  const [driverEmpId, setDriverEmpId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const splitOrder = useDeliveryStore((s) => s.splitOrder);
  const drivers = useDeliveryStore((s) => s.drivers);
  const vehicles = useDeliveryStore((s) => s.vehicles);
  const { hasAccess } = useAuth();
  const canSplitDirectly = hasAccess("/delivery/orders", "Approve");

  async function submit() {
    if (!promisedDate) {
      toast.error("Promised date is required.");
      return;
    }
    setSaving(true);
    const res = await splitOrder(order.id, {
      promisedDate, promisedTime: timeSlot.split("–")[0], timeSlot,
      driverEmpId: driverEmpId || undefined, vehicleId: vehicleId || undefined, note: note || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not split this delivery order.");
      return;
    }
    if (!res.applied) {
      toast.info(`Redelivery request for ${order.id} sent for approval.`);
      onClose();
      return;
    }
    toast.success(`Created ${res.newOrder?.id ?? "a new delivery order"} for the remaining quantity.`);
    onClose();
  }

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{order.id} · split remainder into a new delivery</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!canSplitDirectly && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You don't have direct move authority — this will be sent as a request for a Delivery supervisor to approve.
            </p>
          )}

          {lines.length === 0 ? (
            <p className="rounded-lg border border-black/5 bg-canvas px-3 py-2 text-sm text-muted-foreground">
              Nothing left to redeliver — every line is already fully delivered or written off as damaged.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-black/5">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Ordered</th>
                    <th className="px-3 py-2 text-right">Delivered</th>
                    <th className="px-3 py-2 text-right">Damaged</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.sku} className="border-t border-black/5">
                      <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                      <td className="px-3 py-2">{l.product}</td>
                      <td className="px-3 py-2 text-right">{l.ordered}</td>
                      <td className="px-3 py-2 text-right">{l.deliveredQty ?? 0}</td>
                      <td className="px-3 py-2 text-right">{l.damagedQty ?? 0}</td>
                      <td className="px-3 py-2 text-right font-semibold">{l.remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Promised date</label>
              <input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Time slot</label>
              <select className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm" value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}>
                {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Driver</label>
              <select className="h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-sm" value={driverEmpId} onChange={(e) => setDriverEmpId(e.target.value)}>
                <option value="">Unassigned</option>
                {drivers.map((d) => <option key={d.empId} value={d.empId}>{d.name}</option>)}
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

          <textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm" />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={lines.length === 0 || saving} className="bg-brand text-brand-foreground hover:bg-brand/90">
              {saving ? "Saving…" : canSplitDirectly ? "Create Redelivery" : "Send Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
