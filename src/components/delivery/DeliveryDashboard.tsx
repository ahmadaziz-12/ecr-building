import { useMemo, useState } from "react";
import { Truck, Users, Package, AlertTriangle, Timer, ClipboardList, CheckCircle2 } from "lucide-react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { useDeliveryStore, STAGE_TONE, type Stage } from "@/lib/delivery/store";
import { useHrStore, driverAvailable } from "@/lib/hr/store";
import { useAuditStore } from "@/lib/store/audit";
import { CreateDeliveryDialog } from "./CreateDeliveryDialog";

export function DeliveryDashboard() {
  const orders = useDeliveryStore((s) => s.orders);
  const drivers = useDeliveryStore((s) => s.drivers);
  const vehicles = useDeliveryStore((s) => s.vehicles);
  const events = useAuditStore((s) => s.events).filter((e) => e.module === "delivery").slice(0, 8);
  const [open, setOpen] = useState(false);

  const kpis = useMemo(() => {
    const byStage = (s: Stage) => orders.filter((o) => o.stage === s);
    const feesCollected = orders
      .filter((o) => o.stage === "Delivered")
      .reduce((s, o) => s + o.charges.fee + o.charges.handling + o.charges.heavy + o.charges.vat - o.charges.discount, 0);
    const delivered = byStage("Delivered").length;
    const attempts = orders.filter((o) => ["Delivered", "Failed", "Returned to Branch", "Partially Delivered"].includes(o.stage)).length;
    return {
      pending: byStage("Pending").length,
      assigned: byStage("Assigned").length,
      loading: byStage("Loading").length + byStage("Ready to Dispatch").length,
      dispatched: byStage("Dispatched").length,
      delivered,
      failed: byStage("Failed").length + byStage("Returned to Branch").length,
      fees: feesCollected,
      onTime: attempts === 0 ? 100 : Math.round((delivered / attempts) * 100),
    };
  }, [orders]);

  const today = new Date().toISOString().slice(0, 10);
  const dueToday = orders.filter((o) => o.promisedDate === today).slice(0, 5);
  const failed = orders.filter((o) => o.stage === "Failed" || o.stage === "Returned to Branch");

  return (
    <div className="space-y-4">
      <PageHeader
        group="Delivery"
        title="Delivery & Dispatch Operations"
        desc="Monitor pending deliveries, loading activity, dispatched orders, failed deliveries, drivers, vehicles, and promised delivery times."
        primary="Create Delivery Order"
        onPrimary={() => setOpen(true)}
        onRefresh={() => location.reload()}
        onExport={() => alert("Exported delivery dashboard snapshot (mock)")}
      />

      <KpiGrid
        items={[
          { label: "Pending Deliveries", value: kpis.pending, sub: "Awaiting assignment", tone: "warning" },
          { label: "Assigned", value: kpis.assigned, sub: "Driver + vehicle set", tone: "info" },
          { label: "Loading", value: kpis.loading, sub: "At warehouse", tone: "info" },
          { label: "Dispatched", value: kpis.dispatched, sub: "En route", tone: "info" },
          { label: "Delivered Today", value: kpis.delivered, sub: "Confirmed", tone: "success" },
          { label: "Failed / Returned", value: kpis.failed, sub: "Needs action", tone: "critical" },
          { label: "Delivery Fees Collected", value: `${kpis.fees.toFixed(0)} ر.س`, sub: "Today", tone: "success" },
          { label: "On-Time Rate", value: `${kpis.onTime}%`, sub: "Delivered vs attempts", tone: kpis.onTime >= 90 ? "success" : "warning" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Deliveries Due Today" desc={`${dueToday.length} scheduled`} className="lg:col-span-2">
          <div className="divide-y divide-black/5">
            {dueToday.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nothing scheduled today.</p>}
            {dueToday.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-mono text-xs text-brand">{o.id}</span>
                <span className="font-medium text-foreground">{o.customer}</span>
                <span className="text-muted-foreground">{o.area}</span>
                <span className="text-muted-foreground">{o.promisedTime}</span>
                <Pill tone={STAGE_TONE[o.stage]}>{o.stage}</Pill>
                <span className="ml-auto font-mono text-xs">{o.weightTons.toFixed(1)} t</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Recent Delivery Activity" desc={`${events.length} events`}>
          <div className="space-y-2 text-xs">
            {events.length === 0 && <p className="text-muted-foreground">No recent activity.</p>}
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2 rounded-lg border border-black/5 bg-canvas p-2">
                <span className={`mt-0.5 h-2 w-2 flex-none rounded-full ${e.severity === "critical" ? "bg-critical" : e.severity === "warning" ? "bg-warning" : "bg-info"}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{e.event}</p>
                  <p className="text-muted-foreground">{e.recordId} · {new Date(e.ts).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Driver Availability" desc={`${drivers.length} drivers`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">Driver</th><th className="px-3 py-2 text-left">Branch</th><th className="px-3 py-2 text-left">Vehicle</th><th className="px-3 py-2 text-left">Status</th></tr>
              </thead>
              <tbody>
                {drivers.map((d) => {
                  const chk = driverAvailable(d.empId);
                  return (
                    <tr key={d.empId} className="border-t border-black/5">
                      <td className="px-3 py-2">{d.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.branch}</td>
                      <td className="px-3 py-2 font-mono text-xs">{d.vehicleId ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Pill tone={chk.ok ? (d.status === "Available" ? "success" : "info") : "critical"}>{chk.ok ? d.status : chk.reason ?? "Blocked"}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Vehicle Availability" desc={`${vehicles.length} vehicles`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">Vehicle</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Capacity</th><th className="px-3 py-2 text-left">Status</th></tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-t border-black/5">
                    <td className="px-3 py-2 font-mono text-xs">{v.id}</td>
                    <td className="px-3 py-2">{v.type}</td>
                    <td className="px-3 py-2 text-right">{v.capacityTons} t</td>
                    <td className="px-3 py-2"><Pill tone={v.status === "Available" ? "success" : v.status === "Inactive" ? "muted" : "info"}>{v.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Failed & Rescheduled" desc={`${failed.length} requiring attention`}>
        {failed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failures today.</p>
        ) : (
          <div className="divide-y divide-black/5">
            {failed.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-critical" />
                <span className="font-mono text-xs text-brand">{o.id}</span>
                <span className="font-medium">{o.customer}</span>
                <span className="text-muted-foreground">{o.area}</span>
                <Pill tone={STAGE_TONE[o.stage]}>{o.stage}</Pill>
                <span className="text-muted-foreground">{o.failureReason ?? "—"}</span>
                <span className="ml-auto text-xs text-brand">Next: {o.nextAction ?? "Reschedule"}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <CreateDeliveryDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export const _icons = { Truck, Users, Package, Timer, ClipboardList, CheckCircle2 };