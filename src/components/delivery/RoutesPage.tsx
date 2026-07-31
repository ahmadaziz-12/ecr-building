import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Field, Select } from "@/components/delivery/FormFields";
import {
  useFleetStore, MOVEMENT_TYPES, ROUTE_TYPES, LOCATION_TYPES, VEHICLE_TYPES, COVERAGE_AREAS,
  MOVEMENT_ENDPOINTS, STOCK_LOCATIONS,
  type DeliveryRoute, type MovementType, type RouteType, type LocationType, type FleetVehicleType,
} from "@/lib/delivery/fleet-store";

const ROUTE_TYPE_BY_MOVEMENT: Record<MovementType, RouteType> = {
  "Warehouse to Branch": "Stock Replenishment Route",
  "Branch to Branch": "Inter-Branch Route",
  "Branch to Customer": "Customer Delivery Route",
  "Branch to Project Site": "Contractor Project Route",
  "Customer Return Pickup": "Return Pickup Route",
  "Branch to Supplier": "Supplier Return Route",
  "Supplier Pickup": "Supplier Pickup Route",
  "Failed Delivery Return": "Return Pickup Route",
};

type Form = Omit<DeliveryRoute, "id">;

const EMPTY: Form = {
  name: "", code: "", movementType: "Branch to Customer", routeType: "Customer Delivery Route",
  sourceType: "Branch", sourceLocation: "", destinationType: "Customer", destination: "",
  coverageArea: "", distanceKm: 0, travelTime: "", allowedVehicleTypes: [], maxWeightTons: 0, maxVolumeM3: 0,
  standardFee: 0, heavyFee: 0, loadingFee: 0, minOrderValue: 0, freeThreshold: undefined,
  sameDay: false, scheduled: true, activeDays: "Sat–Thu", cutOffTime: "14:00", requiresApproval: false,
  status: "Active", notes: "",
};

function Toggle({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-sm">
      <input type="checkbox" checked={v} onChange={(e) => onChange(e.target.checked)} className="accent-[hsl(var(--brand,262_80%_50%))]" />
      <span className="truncate">{label}</span>
    </label>
  );
}

export function DeliveryRoutesPage() {
  const routes = useFleetStore((s) => s.routes);
  const addRoute = useFleetStore((s) => s.addRoute);
  const updateRoute = useFleetStore((s) => s.updateRoute);
  const removeRoute = useFleetStore((s) => s.removeRoute);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [movementFilter, setMovementFilter] = useState<string>("");

  const shown = useMemo(
    () => routes.filter((r) => !movementFilter || r.movementType === movementFilter),
    [routes, movementFilter],
  );

  const isCoverage = form.movementType === "Branch to Customer" || form.movementType === "Branch to Project Site";

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function pickMovement(mt: MovementType) {
    const ends = MOVEMENT_ENDPOINTS[mt];
    setForm((f) => ({ ...f, movementType: mt, routeType: ROUTE_TYPE_BY_MOVEMENT[mt], sourceType: ends.source, destinationType: ends.destination }));
  }

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }
  function openEdit(r: DeliveryRoute) {
    setEditingId(r.id);
    const { id: _id, ...rest } = r;
    setForm(rest);
    setOpen(true);
  }

  function save() {
    if (!form.name || !form.sourceLocation) {
      toast.error("Route name and source location are required.");
      return;
    }
    if (!form.destination && !form.coverageArea) {
      toast.error("Set a destination location or a coverage area.");
      return;
    }
    const payload: Form = { ...form, destination: form.destination || form.coverageArea || "" };
    if (editingId) {
      updateRoute(editingId, payload);
      toast.success("Route updated");
    } else {
      const id = addRoute(payload);
      toast.success(`Route ${id} created`);
    }
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Delivery"
        title="Delivery Coverage & Routes"
        desc="Which sources can deliver to which destinations, with permitted vehicles, capacity limits and charges."
      />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/5 bg-white p-2">
        <select
          value={movementFilter}
          onChange={(e) => setMovementFilter(e.target.value)}
          className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm"
        >
          <option value="">All movement types</option>
          {MOVEMENT_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <Button size="sm" onClick={openAdd} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
          <Plus className="h-4 w-4" /> Add Route
        </Button>
      </div>

      <SectionCard title="Routes" desc={`${shown.length} of ${routes.length} routes`}>
        <div className="ui-table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-2 py-2 text-left">Route</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Movement Type</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Source</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Destination / Coverage</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Distance</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Est. Time</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Vehicles</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Max Weight</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Charges</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-black/5 align-top">
                  <td className="px-2 py-2">
                    <div className="font-mono text-xs text-brand">{r.id}</div>
                    <div className="text-xs text-muted-foreground">{r.name}</div>
                  </td>
                  <td className="px-2 py-2">{r.movementType}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.sourceLocation}<div className="text-[10px] uppercase">{r.sourceType}</div></td>
                  <td className="px-2 py-2 text-muted-foreground">{r.coverageArea || r.destination}<div className="text-[10px] uppercase">{r.destinationType}</div></td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{r.distanceKm} km</td>
                  <td className="px-2 py-2 text-xs">{r.travelTime}</td>
                  <td className="px-2 py-2 text-xs">{r.allowedVehicleTypes.join(", ") || "—"}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{r.maxWeightTons} t</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">
                    {r.standardFee === 0 ? <span className="text-muted-foreground">Internal — no charge</span> : `SAR ${r.standardFee}`}
                    {r.heavyFee > 0 && <div className="text-[10px] text-muted-foreground">Heavy SAR {r.heavyFee}</div>}
                  </td>
                  <td className="px-2 py-2">
                    <Pill tone={r.status === "Active" ? "success" : "muted"}>{r.status}</Pill>
                    {r.requiresApproval && <div className="mt-1"><Pill tone="warning">Approval</Pill></div>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button onClick={() => openEdit(r)} className="rounded-md border border-black/10 px-2 py-1 text-xs font-medium hover:border-brand/40 hover:text-brand">Edit</button>
                    <button onClick={() => { removeRoute(r.id); toast.success("Route removed"); }} className="ml-1 rounded-md border border-black/10 px-2 py-1 text-xs hover:border-critical/40 hover:text-critical">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={11} className="px-2 py-6 text-center text-sm text-muted-foreground">No routes match this filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(88vh,60rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? `Edit ${editingId}` : "Add Route"}</DialogTitle></DialogHeader>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Route Name" v={form.name} onChange={(v) => set("name", v)} required />
            <Field label="Route Code" v={form.code} onChange={(v) => set("code", v)} />
            <Select label="Movement Type" v={form.movementType} onChange={(v) => pickMovement(v as MovementType)} options={MOVEMENT_TYPES.map((m) => ({ value: m, label: m }))} />
            <Select label="Route Type" v={form.routeType} onChange={(v) => set("routeType", v as RouteType)} options={ROUTE_TYPES.map((m) => ({ value: m, label: m }))} />
            <Select label="Source Type" v={form.sourceType} onChange={(v) => set("sourceType", v as LocationType)} options={LOCATION_TYPES.map((m) => ({ value: m, label: m }))} />
            {form.sourceType === "Stock Location" ? (
              <Select label="Source Stock Location" v={form.sourceLocation} onChange={(v) => set("sourceLocation", v)} options={STOCK_LOCATIONS.map((m) => ({ value: m, label: m }))} />
            ) : (
              <Field label="Source Location" v={form.sourceLocation} onChange={(v) => set("sourceLocation", v)} required />
            )}
            <Select label="Destination Type" v={form.destinationType} onChange={(v) => set("destinationType", v as LocationType)} options={LOCATION_TYPES.map((m) => ({ value: m, label: m }))} />
            {isCoverage ? (
              <Select label="Coverage Area" v={form.coverageArea ?? ""} onChange={(v) => set("coverageArea", v)} options={COVERAGE_AREAS.map((m) => ({ value: m, label: m }))} />
            ) : (
              <Field label="Destination Location" v={form.destination} onChange={(v) => set("destination", v)} />
            )}
            <Field label="Approx. Distance (km)" type="number" v={String(form.distanceKm)} onChange={(v) => set("distanceKm", Number(v))} />
            <Field label="Estimated Travel Time" v={form.travelTime} onChange={(v) => set("travelTime", v)} />
            <Field label="Maximum Weight (t)" type="number" v={String(form.maxWeightTons)} onChange={(v) => set("maxWeightTons", Number(v))} />
            <Field label="Maximum Volume (m³)" type="number" v={String(form.maxVolumeM3)} onChange={(v) => set("maxVolumeM3", Number(v))} />
            <Field label="Standard Delivery Fee" type="number" v={String(form.standardFee)} onChange={(v) => set("standardFee", Number(v))} />
            <Field label="Heavy-Material Fee" type="number" v={String(form.heavyFee)} onChange={(v) => set("heavyFee", Number(v))} />
            <Field label="Loading Fee" type="number" v={String(form.loadingFee)} onChange={(v) => set("loadingFee", Number(v))} />
            <Field label="Minimum Order Value" type="number" v={String(form.minOrderValue)} onChange={(v) => set("minOrderValue", Number(v))} />
            <Field label="Free Delivery Threshold" type="number" v={String(form.freeThreshold ?? 0)} onChange={(v) => set("freeThreshold", Number(v) || undefined)} />
            <Field label="Active Days" v={form.activeDays} onChange={(v) => set("activeDays", v)} />
            <Field label="Cut-Off Time" v={form.cutOffTime} onChange={(v) => set("cutOffTime", v)} />
            <Select label="Status" v={form.status} onChange={(v) => set("status", v as DeliveryRoute["status"])} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Allowed Vehicle Types</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {VEHICLE_TYPES.map((t) => (
                <Toggle
                  key={t}
                  label={t}
                  v={form.allowedVehicleTypes.includes(t)}
                  onChange={(on) => set("allowedVehicleTypes", (on ? [...form.allowedVehicleTypes, t] : form.allowedVehicleTypes.filter((x) => x !== t)) as FleetVehicleType[])}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Toggle label="Same-Day Delivery" v={form.sameDay} onChange={(v) => set("sameDay", v)} />
            <Toggle label="Scheduled Delivery" v={form.scheduled} onChange={(v) => set("scheduled", v)} />
            <Toggle label="Requires Approval" v={form.requiresApproval} onChange={(v) => set("requiresApproval", v)} />
          </div>

          <Field label="Notes" v={form.notes ?? ""} onChange={(v) => set("notes", v)} />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-brand text-brand-foreground hover:bg-brand/90">Save Route</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
