import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Field, Select } from "@/components/delivery/FormFields";
import { useBranches } from "@/lib/api/admin";
import {
  useFleetStore, MOVEMENT_TYPES, MOVEMENT_ENDPOINTS, MATERIAL_CATEGORIES, STOCK_LOCATIONS, evaluateVehicles,
  type InternalMovement, type InternalMovementStage, type MovementType, type MovementLine,
} from "@/lib/delivery/fleet-store";

const INTERNAL_MOVEMENTS = MOVEMENT_TYPES.filter((m) => MOVEMENT_ENDPOINTS[m].internal);

const NEXT: Record<InternalMovementStage, InternalMovementStage[]> = {
  Draft: ["Approved", "Cancelled"],
  Approved: ["Reserved", "Cancelled"],
  Reserved: ["Loading", "Cancelled"],
  Loading: ["In Transit", "Reserved"],
  "In Transit": ["Received"],
  Received: ["Closed"],
  Closed: [],
  Cancelled: [],
};

function tone(stage: InternalMovementStage) {
  if (stage === "Closed" || stage === "Received") return "success" as const;
  if (stage === "Cancelled") return "critical" as const;
  if (stage === "Draft") return "muted" as const;
  return "info" as const;
}

const EMPTY_LINE: MovementLine = { product: "", qty: 1, uom: "Pallet", weightTons: 0, category: "Cement & Binders" };

export function InternalMovementsPage() {
  const movements = useFleetStore((s) => s.movements);
  const vehicles = useFleetStore((s) => s.vehicles);
  const routes = useFleetStore((s) => s.routes);
  const addMovement = useFleetStore((s) => s.addMovement);
  const updateMovement = useFleetStore((s) => s.updateMovement);
  const moveStage = useFleetStore((s) => s.moveMovementStage);
  const assignVehicle = useFleetStore((s) => s.assignVehicle);
  const { data: branches } = useBranches();

  const [open, setOpen] = useState(false);
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [movementFilter, setMovementFilter] = useState("");
  const [form, setForm] = useState({
    movementType: "Warehouse to Branch" as MovementType,
    source: STOCK_LOCATIONS[0], destination: "", transferRef: "", routeId: "",
    vehicleId: "", driver: "", loadingTime: "", dispatchTime: "", expectedArrival: "", notes: "",
    lines: [ { ...EMPTY_LINE } ] as MovementLine[],
  });

  const shown = movements.filter((m) => !movementFilter || m.movementType === movementFilter);
  const weight = form.lines.reduce((t, l) => t + (Number(l.weightTons) || 0), 0);

  const eligibility = useMemo(
    () => evaluateVehicles(vehicles, {
      movementType: form.movementType,
      categories: Array.from(new Set(form.lines.map((l) => l.category))),
      weightTons: weight,
    }, routes.find((r) => r.id === form.routeId)),
    [vehicles, form.movementType, form.lines, form.routeId, weight, routes],
  );

  function setLine(i: number, patch: Partial<MovementLine>) {
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  }

  function create() {
    if (!form.destination) { toast.error("Destination is required."); return; }
    if (form.lines.every((l) => !l.product)) { toast.error("Add at least one product line."); return; }
    const ends = MOVEMENT_ENDPOINTS[form.movementType];
    const id = addMovement({
      movementType: form.movementType,
      sourceType: ends.source, source: form.source,
      destinationType: ends.destination, destination: form.destination,
      transferRef: form.transferRef || undefined,
      lines: form.lines.filter((l) => l.product),
      weightTons: Number(weight.toFixed(2)),
      vehicleId: form.vehicleId || undefined, driver: form.driver || undefined, routeId: form.routeId || undefined,
      loadingTime: form.loadingTime || undefined, dispatchTime: form.dispatchTime || undefined, expectedArrival: form.expectedArrival || undefined,
      stockReserved: false, stage: "Draft", notes: form.notes || undefined,
    });
    if (form.vehicleId) {
      const res = assignVehicle(form.vehicleId, id, form.driver);
      if (!res.ok) toast.warning(res.error!);
    }
    toast.success(`${id} created — internal movement, no customer charge`);
    setOpen(false);
  }

  const receiving = movements.find((m) => m.id === receiveId);

  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Internal Stock Movements" desc="Stock location → branch and branch → branch replenishment. Stock source and dispatch reference only — no customer charge." />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/5 bg-white p-2">
        <select value={movementFilter} onChange={(e) => setMovementFilter(e.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm">
          <option value="">All movement types</option>
          {INTERNAL_MOVEMENTS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
          <Plus className="h-4 w-4" /> New Internal Movement
        </Button>
      </div>

      <SectionCard title="Movements" desc={`${shown.length} of ${movements.length}`}>
        <div className="ui-table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-2 py-2 text-left">Movement</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Type</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Source</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Destination</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Transfer Ref</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Materials</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Weight</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Vehicle / Driver</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Schedule</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Stage</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="border-t border-black/5 align-top">
                  <td className="px-2 py-2 font-mono text-xs text-brand">{m.id}</td>
                  <td className="px-2 py-2 text-xs">{m.movementType}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{m.source}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{m.destination}</td>
                  <td className="px-2 py-2 font-mono text-xs">{m.transferRef ?? "—"}</td>
                  <td className="max-w-[16rem] px-2 py-2 text-[11px] text-muted-foreground">{m.lines.map((l) => `${l.product} ×${l.qty} ${l.uom}`).join(", ")}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{m.weightTons} t</td>
                  <td className="px-2 py-2 text-xs">{m.vehicleId ?? "—"}<div className="text-[10px] text-muted-foreground">{m.driver ?? "No driver"}</div></td>
                  <td className="px-2 py-2 text-[11px] text-muted-foreground">{m.loadingTime && <div>Load {m.loadingTime}</div>}{m.dispatchTime && <div>Dispatch {m.dispatchTime}</div>}{m.expectedArrival && <div>ETA {m.expectedArrival}</div>}</td>
                  <td className="px-2 py-2"><Pill tone={tone(m.stage)}>{m.stage}</Pill>{m.stockReserved && <div className="mt-1"><Pill tone="info">Stock reserved</Pill></div>}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {NEXT[m.stage].map((to) => (
                      <button
                        key={to}
                        onClick={() => {
                          if (to === "Received") { setReceiveId(m.id); return; }
                          const res = moveStage(m.id, to);
                          res.ok ? toast.success(`${m.id} → ${to}`) : toast.error(res.error!);
                        }}
                        className="ml-1 rounded-md border border-black/10 px-2 py-1 text-xs font-medium hover:border-brand/40 hover:text-brand"
                      >
                        {to}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={11} className="px-2 py-6 text-center text-sm text-muted-foreground">No internal movements yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* create */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(88vh,60rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>New Internal Movement</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Select label="Movement Type" v={form.movementType} onChange={(v) => setForm({ ...form, movementType: v as MovementType })} options={INTERNAL_MOVEMENTS.map((m) => ({ value: m, label: m }))} />
            {MOVEMENT_ENDPOINTS[form.movementType].source === "Stock Location" ? (
              <Select label="Source Stock Location" v={form.source} onChange={(v) => setForm({ ...form, source: v })} options={STOCK_LOCATIONS.map((m) => ({ value: m, label: m }))} />
            ) : (
              <Select label="Source Branch" v={form.source} onChange={(v) => setForm({ ...form, source: v })} options={(branches ?? []).map((b) => ({ value: b.nameEn, label: b.nameEn }))} />
            )}
            <Select label="Destination Branch" v={form.destination} onChange={(v) => setForm({ ...form, destination: v })} options={(branches ?? []).map((b) => ({ value: b.nameEn, label: b.nameEn }))} />
            <Field label="Transfer Reference" v={form.transferRef} onChange={(v) => setForm({ ...form, transferRef: v })} />
            <Select label="Route" v={form.routeId} onChange={(v) => setForm({ ...form, routeId: v })} options={routes.filter((r) => r.movementType === form.movementType).map((r) => ({ value: r.id, label: `${r.id} — ${r.name}` }))} />
            <Field label="Driver" v={form.driver} onChange={(v) => setForm({ ...form, driver: v })} />
            <Field label="Loading Time" v={form.loadingTime} onChange={(v) => setForm({ ...form, loadingTime: v })} />
            <Field label="Dispatch Time" v={form.dispatchTime} onChange={(v) => setForm({ ...form, dispatchTime: v })} />
            <Field label="Expected Arrival" v={form.expectedArrival} onChange={(v) => setForm({ ...form, expectedArrival: v })} />
          </div>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Products</div>
          {form.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-6">
              <Field label="Product" v={l.product} onChange={(v) => setLine(i, { product: v })} />
              <Field label="Qty" type="number" v={String(l.qty)} onChange={(v) => setLine(i, { qty: Number(v) })} />
              <Field label="UOM" v={l.uom} onChange={(v) => setLine(i, { uom: v })} />
              <Field label="Weight (t)" type="number" v={String(l.weightTons)} onChange={(v) => setLine(i, { weightTons: Number(v) })} />
              <Select label="Category" v={l.category} onChange={(v) => setLine(i, { category: v })} options={MATERIAL_CATEGORIES.map((c) => ({ value: c, label: c }))} />
              <button onClick={() => setForm({ ...form, lines: form.lines.filter((_, x) => x !== i) })} className="mt-6 h-10 rounded-lg border border-black/10 text-xs hover:border-critical/40 hover:text-critical"><Trash2 className="mx-auto h-4 w-4" /></button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, lines: [...form.lines, { ...EMPTY_LINE }] })}>+ Add line</Button>

          <div className="rounded-xl border border-black/5 p-3 text-sm">
            <div className="mb-2 flex justify-between"><span className="text-muted-foreground">Estimated weight</span><span className="font-mono">{weight.toFixed(2)} t</span></div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Eligible vehicles</div>
            <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm">
              <option value="">Select vehicle…</option>
              {eligibility.filter((r) => r.eligible).map((r) => <option key={r.vehicle.id} value={r.vehicle.id}>{r.vehicle.id} — {r.vehicle.type} ({r.vehicle.maxWeightTons} t)</option>)}
            </select>
            <div className="mt-2 space-y-1">
              {eligibility.filter((r) => !r.eligible).map((r) => (
                <div key={r.vehicle.id} className="text-[11px] text-muted-foreground"><span className="font-mono text-critical">{r.vehicle.id}</span> ineligible — {r.reasons.join(" ")}</div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">Internal movement — no customer delivery fee is applied.</div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} className="bg-brand text-brand-foreground hover:bg-brand/90">Create Movement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* receive */}
      <Dialog open={Boolean(receiving)} onOpenChange={(o) => !o && setReceiveId(null)}>
        <DialogContent className="max-h-[min(88vh,60rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Receive {receiving?.id}</DialogTitle></DialogHeader>
          {receiving?.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-4 gap-2">
              <div className="pt-6 text-sm">{l.product}<div className="text-[11px] text-muted-foreground">Sent {l.qty} {l.uom}</div></div>
              <Field label="Accepted" type="number" v={String(l.receivedQty ?? 0)} onChange={(v) => updateMovement(receiving.id, { lines: receiving.lines.map((x, idx) => (idx === i ? { ...x, receivedQty: Number(v) } : x)) })} />
              <Field label="Damaged" type="number" v={String(l.damagedQty ?? 0)} onChange={(v) => updateMovement(receiving.id, { lines: receiving.lines.map((x, idx) => (idx === i ? { ...x, damagedQty: Number(v) } : x)) })} />
              <Field label="Missing" type="number" v={String(l.missingQty ?? 0)} onChange={(v) => updateMovement(receiving.id, { lines: receiving.lines.map((x, idx) => (idx === i ? { ...x, missingQty: Number(v) } : x)) })} />
            </div>
          ))}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReceiveId(null)}>Cancel</Button>
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                if (!receiving) return;
                const res = moveStage(receiving.id, "Received");
                if (!res.ok) { toast.error(res.error!); return; }
                const disc = receiving.lines.some((l) => (l.damagedQty ?? 0) > 0 || (l.missingQty ?? 0) > 0);
                toast.success(disc ? "Received with discrepancy recorded" : "Stock received at destination branch");
                setReceiveId(null);
              }}
            >
              Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
