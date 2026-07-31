import { useMemo, useState } from "react";
import { Filter, Search, FileText } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { MultiSelectFilter } from "@/components/buildpos/FilterControls";
import { STAGES, STAGE_TONE, useDeliveryStore, canSplit, type DeliveryOrder } from "@/lib/delivery/store";
import { useAuth } from "@/lib/api/auth";
import { deriveMovement, MOVEMENT_TYPES } from "@/lib/delivery/fleet-store";
import { CreateDeliveryDialog } from "./CreateDeliveryDialog";
import { StageActionDialog } from "./StageActionDialog";
import { SplitDeliveryDialog } from "./SplitDeliveryDialog";
import { DeliveryTimeline } from "./DeliveryTimeline";

function PendingApprovalsPanel() {
  const pendingApprovals = useDeliveryStore((s) => s.pendingApprovals);
  const approveMove = useDeliveryStore((s) => s.approveMove);
  const rejectMove = useDeliveryStore((s) => s.rejectMove);
  const { hasAccess } = useAuth();
  const canApprove = hasAccess("/delivery/orders", "Approve");
  const [busyId, setBusyId] = useState<number | null>(null);

  if (pendingApprovals.length === 0) return null;

  async function resolve(id: number, action: "approve" | "reject") {
    setBusyId(id);
    const res = await (action === "approve" ? approveMove(id) : rejectMove(id));
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error ?? `Could not ${action} this request.`);
      return;
    }
    toast.success(action === "approve" ? "Move approved." : "Move rejected.");
  }

  return (
    <SectionCard title="Pending Move Requests" desc={`${pendingApprovals.length} awaiting approval`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2 text-left">DO #</th>
              <th className="px-2 py-2 text-left">Requested by</th>
              <th className="px-2 py-2 text-left">Move</th>
              <th className="px-2 py-2 text-left">Reason</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {pendingApprovals.map((a) => (
              <tr key={a.id} className="border-t border-black/5">
                <td className="px-2 py-2 font-mono text-xs text-brand">{a.deliveryNo}</td>
                <td className="px-2 py-2">{a.requestedByName}</td>
                <td className="px-2 py-2 text-xs">{a.fromStage} → {a.toStage}</td>
                <td className="px-2 py-2 text-muted-foreground">{a.reason}</td>
                <td className="px-2 py-2">
                  {canApprove ? (
                    <div className="flex justify-end gap-1">
                      <button disabled={busyId === a.id} onClick={() => resolve(a.id, "reject")} className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-foreground hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                        Reject
                      </button>
                      <button disabled={busyId === a.id} onClick={() => resolve(a.id, "approve")} className="rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50">
                        Approve
                      </button>
                    </div>
                  ) : (
                    <span className="block text-right text-[11px] text-muted-foreground">Awaiting approval</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export function DeliveryOrdersPage() {
  const orders = useDeliveryStore((s) => s.orders);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string[]>([]);
  const [movement, setMovement] = useState<string[]>([]);
  const [priority, setPriority] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<DeliveryOrder | null>(null);
  const [splitting, setSplitting] = useState<DeliveryOrder | null>(null);
  const [detail, setDetail] = useState<DeliveryOrder | null>(null);

  const rows = useMemo(() => {
    return orders.filter((o) => {
      if (stage.length && !stage.includes(o.stage)) return false;
      if (movement.length && !movement.includes(deriveMovement(o).movementType)) return false;
      if (priority.length && !priority.includes(o.priority)) return false;
      if (q) {
        const t = q.toLowerCase();
        return o.id.toLowerCase().includes(t) || o.customer.toLowerCase().includes(t) || o.orderId.toLowerCase().includes(t) || o.area.toLowerCase().includes(t);
      }
      return true;
    });
  }, [orders, stage, movement, priority, q]);

  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Delivery Orders" desc="All delivery orders with source order, customer, driver, vehicle, stage and value." primary="Create Delivery Order" onPrimary={() => setCreating(true)} onExport={() => alert("Exported CSV (mock)")} />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
        <Filter className="ml-1 h-4 w-4 text-muted-foreground" />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input placeholder="Search DO, order, customer, area…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-72 rounded-lg border border-black/10 bg-canvas pl-8 pr-3 text-sm outline-none focus:border-brand" />
        </div>
        <MultiSelectFilter
          label="Stage"
          allLabel="All Stages"
          options={[...STAGES, "Cancelled", "Rescheduled", "Returned to Branch"]}
          selected={stage}
          onChange={setStage}
        />
        <MultiSelectFilter label="Movement Type" allLabel="All Movements" options={[...MOVEMENT_TYPES]} selected={movement} onChange={setMovement} />
        <MultiSelectFilter label="Priority" allLabel="All Priorities" options={["Urgent", "High", "Standard", "Low"]} selected={priority} onChange={setPriority} />
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} of {orders.length}</span>
      </div>

      <PendingApprovalsPanel />

      <SectionCard title="Delivery Order Ledger" desc={`${rows.length} records`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2 text-left">DO #</th>
                <th className="px-2 py-2 text-left">Movement Type</th>
                <th className="px-2 py-2 text-left">Source</th>
                <th className="px-2 py-2 text-left">Destination</th>
                <th className="px-2 py-2 text-left">Reference</th>
                <th className="px-2 py-2 text-left">Customer</th>
                <th className="px-2 py-2 text-left">Promised</th>
                <th className="px-2 py-2 text-left">Driver</th>
                <th className="px-2 py-2 text-left">Vehicle</th>
                <th className="px-2 py-2 text-right">Weight</th>
                <th className="px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2 text-left">Stage</th>
                <th className="px-2 py-2 text-left">Priority</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-black/5 hover:bg-canvas">
                  <td className="px-2 py-2 font-mono text-xs text-brand">
                    {o.id}
                    {o.sourceDeliveryNo && <span className="mt-0.5 block font-sans text-[10px] font-normal text-muted-foreground">↳ redelivery of {o.sourceDeliveryNo}</span>}
                  </td>
                  <td className="px-2 py-2 text-xs">{deriveMovement(o).movementType}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{deriveMovement(o).source}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{deriveMovement(o).destination}</td>
                  <td className="px-2 py-2 font-mono text-xs">{o.poRef || o.orderId}</td>
                  <td className="px-2 py-2">{o.customer}</td>
                  <td className="px-2 py-2 text-muted-foreground">{o.promisedDate} · {o.promisedTime}</td>
                  <td className="px-2 py-2">{o.driverName ?? "—"}</td>
                  <td className="px-2 py-2 font-mono text-xs">{o.vehicleId ?? "—"}</td>
                  <td className="px-2 py-2 text-right font-mono">{o.weightTons.toFixed(1)}t</td>
                  <td className="px-2 py-2 text-right font-mono">{o.amount.toFixed(0)}</td>
                  <td className="px-2 py-2"><Pill tone={STAGE_TONE[o.stage]}>{o.stage}</Pill></td>
                  <td className="px-2 py-2 text-xs">{o.priority}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setDetail(o)} className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] font-medium text-foreground hover:border-brand/40 hover:text-brand">
                        View
                      </button>
                      <button onClick={() => setActive(o)} className="rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-brand-foreground hover:bg-brand/90">
                        Move
                      </button>
                      {canSplit(o, orders) && (
                        <button onClick={() => setSplitting(o)} className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100">
                          Split
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={14} className="px-2 py-8 text-center text-sm text-muted-foreground">No delivery orders match those filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {detail && (
        <SectionCard
          title={`${detail.id} · timeline`}
          desc={`${detail.customer} — ${detail.area}`}
          action={
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-md border border-black/10 bg-white px-2 py-1 text-xs hover:border-brand/40 hover:text-brand">
                <FileText className="h-3.5 w-3.5" /> Print
              </button>
              <button onClick={() => setDetail(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
            </div>
          }
        >
          <DeliveryTimeline order={detail} />
        </SectionCard>
      )}

      <CreateDeliveryDialog open={creating} onOpenChange={setCreating} />
      <StageActionDialog order={active} onClose={() => setActive(null)} />
      <SplitDeliveryDialog order={splitting} onClose={() => setSplitting(null)} />
    </div>
  );
}