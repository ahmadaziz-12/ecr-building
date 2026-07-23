import { useMemo, useState } from "react";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { STAGE_TONE, STAGES, useDeliveryStore, type DeliveryOrder, type Stage } from "@/lib/delivery/store";
import { StageActionDialog } from "./StageActionDialog";
import { CreateDeliveryDialog } from "./CreateDeliveryDialog";
import { ArrowRight, GripVertical } from "lucide-react";

export function DeliveryPipeline() {
  const orders = useDeliveryStore((s) => s.orders);
  const [active, setActive] = useState<DeliveryOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const byStage = useMemo(() => {
    const g: Record<Stage, DeliveryOrder[]> = {} as never;
    STAGES.forEach((s) => (g[s] = []));
    orders.forEach((o) => {
      if (g[o.stage]) g[o.stage].push(o);
    });
    return g;
  }, [orders]);

  return (
    <div className="space-y-4">
      <PageHeader
        group="Delivery"
        title="Delivery Pipeline"
        desc="Move deliveries through the dispatch stages. Each transition is validated against required data (driver, stock, loaded/delivered quantities)."
        primary="Create Delivery Order"
        onPrimary={() => setCreating(true)}
      />

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3" style={{ minWidth: `${STAGES.length * 280}px` }}>
          {STAGES.map((stage) => {
            const items = byStage[stage] ?? [];
            const value = items.reduce((s, o) => s + o.amount, 0);
            const weight = items.reduce((s, o) => s + o.weightTons, 0);
            const overdue = items.filter((o) => o.promisedDate < today && !["Delivered", "Cancelled", "Failed"].includes(o.stage)).length;
            return (
              <div key={stage} className="w-[268px] flex-none rounded-2xl border border-black/5 bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-bold text-foreground">{stage}</p>
                  <Pill tone={STAGE_TONE[stage]}>{items.length}</Pill>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                  <span>Value <br /><strong className="text-foreground">{Math.round(value)} ر.س</strong></span>
                  <span>Weight <br /><strong className="text-foreground">{weight.toFixed(1)} t</strong></span>
                  <span>Overdue <br /><strong className={overdue ? "text-critical" : "text-foreground"}>{overdue}</strong></span>
                </div>
                <div className="mt-3 space-y-2">
                  {items.length === 0 && (
                    <div className="rounded-lg border border-dashed border-black/10 py-6 text-center text-xs text-muted-foreground">No orders</div>
                  )}
                  {items.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setActive(o)}
                      className="group block w-full rounded-xl border border-black/5 bg-canvas p-2.5 text-left transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-3.5 w-3.5 text-black/20 group-hover:text-brand" />
                        <span className="font-mono text-[11px] text-brand">{o.id}</span>
                        <Pill tone={o.priority === "Urgent" ? "critical" : o.priority === "High" ? "warning" : "muted"}>{o.priority}</Pill>
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold text-foreground">{o.customer}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{o.lines.map((l) => l.product).join(", ")}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{o.area}</span>
                        <span>·</span>
                        <span>{o.promisedTime}</span>
                        <span>·</span>
                        <span>{o.weightTons.toFixed(1)} t</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                        <span className="rounded bg-white px-1.5 py-0.5 text-foreground/80">{o.driverName ?? "Unassigned"}</span>
                        {o.vehicleId && <span className="rounded bg-white px-1.5 py-0.5 font-mono text-foreground/80">{o.vehicleId}</span>}
                        <span className="ml-auto font-mono text-[11px] font-semibold text-foreground">{o.amount} ر.س</span>
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-brand opacity-0 group-hover:opacity-100">
                        Move stage <ArrowRight className="h-3 w-3" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SectionCard title="Stage transition rules" desc="Enforced on every move — invalid transitions are blocked with an explanation." >
        <ul className="grid grid-cols-1 gap-1 text-xs text-muted-foreground md:grid-cols-2">
          <li>Pending → Assigned: driver + vehicle required.</li>
          <li>Assigned → Loading: stock must be reserved.</li>
          <li>Loading → Ready to Dispatch: at least one loaded qty confirmed.</li>
          <li>Ready to Dispatch → Dispatched: driver + vehicle required.</li>
          <li>Dispatched → Delivered: delivered qty and receiver required.</li>
          <li>Failed / Returned to Branch: reason required, next action queued.</li>
        </ul>
      </SectionCard>

      <StageActionDialog order={active} onClose={() => setActive(null)} />
      <CreateDeliveryDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}