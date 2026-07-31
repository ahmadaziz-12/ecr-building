import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, PauseCircle, PlayCircle, Power } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Field, Select } from "@/components/delivery/FormFields";
import { useBranches } from "@/lib/api/admin";
import { useDeliveryStore } from "@/lib/delivery/store";
import {
  useFleetStore, VEHICLE_TYPES, VEHICLE_TYPE_GUIDE, OWNERSHIP_TYPES, FLEET_STATUSES, MOVEMENT_TYPES,
  MATERIAL_CATEGORIES, STOCK_LOCATIONS, evaluateVehicles,
  type FleetVehicle, type FleetVehicleType, type MovementType, type OwnershipType, type FleetStatus,
} from "@/lib/delivery/fleet-store";

type Form = Omit<FleetVehicle, "id">;

const EMPTY: Form = {
  name: "", registration: "", type: "Delivery Van", brand: "", model: "", modelYear: String(new Date().getFullYear()),
  color: "", ownership: "Company Owned", branch: "", stockLocation: "", status: "Available",
  maxWeightTons: 0, maxVolumeM3: 0, maxPallets: 0, maxLengthM: 0, maxWidthM: 0, maxHeightM: 0,
  heavyCompatible: false, openBody: false, covered: false, crane: false, tailLift: false,
  allowedMovements: [], allowedCategories: [], primaryDriver: "", secondaryDriver: "",
  assignmentStart: "", assignmentEnd: "", registrationExpiry: "", insuranceExpiry: "", permitExpiry: "", notes: "",
};

function Check({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-xs">
      <input type="checkbox" checked={v} onChange={(e) => onChange(e.target.checked)} />
      <span className="truncate">{label}</span>
    </label>
  );
}

function statusTone(s: FleetStatus) {
  if (s === "Available") return "success" as const;
  if (s === "Inactive" || s === "On Hold") return "critical" as const;
  return "info" as const;
}

function expired(iso?: string) {
  return Boolean(iso) && new Date(iso as string).getTime() < Date.now();
}

export function FleetVehiclesPage() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const addVehicle = useFleetStore((s) => s.addVehicle);
  const updateVehicle = useFleetStore((s) => s.updateVehicle);
  const setActive = useFleetStore((s) => s.setVehicleActive);
  const hold = useFleetStore((s) => s.holdVehicle);
  const unassign = useFleetStore((s) => s.unassignVehicle);
  const routes = useFleetStore((s) => s.routes);
  const drivers = useDeliveryStore((s) => s.drivers);
  const { data: branches } = useBranches();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [typeFilter, setTypeFilter] = useState("");
  const [movementFilter, setMovementFilter] = useState("");

  // Assignment matcher
  const [match, setMatch] = useState({ movementType: "Branch to Project Site" as MovementType, weightTons: 10.5, lengthM: 12, category: "Steel & Reinforcement", routeId: "" });

  const driverOptions = useMemo(() => {
    const fromHr = drivers.map((d) => d.name);
    const seeded = vehicles.map((v) => v.primaryDriver).filter(Boolean) as string[];
    return Array.from(new Set([...fromHr, ...seeded])).map((n) => ({ value: n, label: n }));
  }, [drivers, vehicles]);

  const shown = vehicles.filter(
    (v) => (!typeFilter || v.type === typeFilter) && (!movementFilter || v.allowedMovements.includes(movementFilter as MovementType)),
  );

  const matchResults = useMemo(
    () =>
      evaluateVehicles(vehicles, {
        movementType: match.movementType,
        categories: match.category ? [match.category] : [],
        weightTons: Number(match.weightTons) || 0,
        longestLengthM: Number(match.lengthM) || undefined,
        routeId: match.routeId || undefined,
      }, routes.find((r) => r.id === match.routeId)),
    [vehicles, match, routes],
  );

  function set<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })); }

  function openAdd() { setEditingId(null); setForm(EMPTY); setOpen(true); }
  function openEdit(v: FleetVehicle) {
    setEditingId(v.id);
    const { id: _id, ...rest } = v;
    setForm(rest);
    setOpen(true);
  }

  function save() {
    if (form.primaryDriver) {
      const d = drivers.find((x) => x.name === form.primaryDriver);
      if (d && new Date(d.licenseExpiry).getTime() < Date.now()) {
        toast.error(`${d.name}'s driving licence has expired.`);
        return;
      }
    }
    const res = editingId ? updateVehicle(editingId, form) : addVehicle(form);
    if (!res.ok) { toast.error(res.error ?? "Could not save vehicle."); return; }
    toast.success(editingId ? "Vehicle updated" : `Vehicle ${"id" in res ? res.id : ""} added`);
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Vehicles" desc="Fleet vehicles with capacity, permitted movement types, material categories, drivers and document validity." />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/5 bg-white p-2">
        <div className="flex flex-wrap gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm">
            <option value="">All vehicle types</option>
            {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={movementFilter} onChange={(e) => setMovementFilter(e.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm">
            <option value="">All movement types</option>
            {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
          <Plus className="h-4 w-4" /> Add Vehicle
        </Button>
      </div>

      <SectionCard title="Fleet" desc={`${shown.length} of ${vehicles.length} vehicles`}>
        <div className="ui-table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-2 py-2 text-left">Vehicle</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Registration</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Type</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Base</th>
                <th className="whitespace-nowrap px-2 py-2 text-right">Capacity</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Movements</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Categories</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Driver</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Documents</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Assignment</th>
                <th className="whitespace-nowrap px-2 py-2 text-left">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.id} className="border-t border-black/5 align-top">
                  <td className="px-2 py-2"><div className="font-mono text-xs text-brand">{v.id}</div><div className="text-xs text-muted-foreground">{v.name}</div></td>
                  <td className="px-2 py-2 font-mono text-xs">{v.registration}</td>
                  <td className="px-2 py-2">{v.type}<div className="text-[10px] text-muted-foreground">{v.ownership}</div></td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{v.stockLocation || v.branch || "—"}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{v.maxWeightTons} t<div className="text-[10px] text-muted-foreground">{v.maxVolumeM3} m³ · {v.maxLengthM} m</div></td>
                  <td className="max-w-[14rem] px-2 py-2 text-[11px] text-muted-foreground">{v.allowedMovements.join(", ") || "—"}</td>
                  <td className="max-w-[14rem] px-2 py-2 text-[11px] text-muted-foreground">{v.allowedCategories.join(", ") || "—"}</td>
                  <td className="px-2 py-2 text-xs">{v.primaryDriver || "—"}</td>
                  <td className="px-2 py-2 text-[11px]">
                    <div className={expired(v.registrationExpiry) ? "text-critical" : "text-muted-foreground"}>Reg {v.registrationExpiry || "—"}</div>
                    <div className={expired(v.insuranceExpiry) ? "text-critical" : "text-muted-foreground"}>Ins {v.insuranceExpiry || "—"}</div>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{v.currentDelivery ?? "—"}</td>
                  <td className="px-2 py-2"><Pill tone={statusTone(v.status)}>{v.status}</Pill>{v.holdNote && <div className="mt-1 text-[10px] text-muted-foreground">{v.holdNote}</div>}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button onClick={() => openEdit(v)} className="rounded-md border border-black/10 px-2 py-1 text-xs font-medium hover:border-brand/40 hover:text-brand">Edit</button>
                    <button
                      title={v.status === "Inactive" ? "Activate" : "Deactivate"}
                      onClick={() => setActive(v.id, v.status === "Inactive")}
                      className="ml-1 rounded-md border border-black/10 px-2 py-1 text-xs hover:border-brand/40 hover:text-brand"
                    >
                      {v.status === "Inactive" ? <PlayCircle className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      title="Place on hold"
                      onClick={() => { const note = window.prompt("Hold reason", v.holdNote ?? "Workshop check"); if (note !== null) { hold(v.id, note); toast.success("Vehicle placed on hold"); } }}
                      className="ml-1 rounded-md border border-black/10 px-2 py-1 text-xs hover:border-warning/40"
                    >
                      <PauseCircle className="h-3.5 w-3.5" />
                    </button>
                    {v.currentDelivery && (
                      <button onClick={() => { unassign(v.id); toast.success("Assignment removed"); }} className="ml-1 rounded-md border border-black/10 px-2 py-1 text-xs hover:border-critical/40 hover:text-critical">Unassign</button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={12} className="px-2 py-6 text-center text-sm text-muted-foreground">No vehicles match this filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Vehicle assignment matcher" desc="Eligible vehicles first; ineligible vehicles show the exact reason.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Select label="Movement Type" v={match.movementType} onChange={(v) => setMatch({ ...match, movementType: v as MovementType })} options={MOVEMENT_TYPES.map((m) => ({ value: m, label: m }))} />
          <Select label="Material Category" v={match.category} onChange={(v) => setMatch({ ...match, category: v })} options={MATERIAL_CATEGORIES.map((m) => ({ value: m, label: m }))} />
          <Field label="Estimated Weight (t)" type="number" v={String(match.weightTons)} onChange={(v) => setMatch({ ...match, weightTons: Number(v) })} />
          <Field label="Longest Length (m)" type="number" v={String(match.lengthM)} onChange={(v) => setMatch({ ...match, lengthM: Number(v) })} />
          <Select label="Route" v={match.routeId} onChange={(v) => setMatch({ ...match, routeId: v })} options={routes.map((r) => ({ value: r.id, label: `${r.id} — ${r.name}` }))} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-black/5 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-success">Eligible</div>
            {matchResults.filter((r) => r.eligible).map((r) => (
              <div key={r.vehicle.id} className="flex items-center justify-between border-b border-black/5 py-1.5 text-sm last:border-0">
                <span><span className="font-mono text-xs text-brand">{r.vehicle.id}</span> — {r.vehicle.type}</span>
                <span className="font-mono text-xs text-muted-foreground">{r.vehicle.maxWeightTons} t · {r.vehicle.maxLengthM} m</span>
              </div>
            ))}
            {matchResults.every((r) => !r.eligible) && <div className="py-2 text-sm text-muted-foreground">No eligible vehicle for this movement.</div>}
          </div>
          <div className="rounded-xl border border-black/5 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-critical">Ineligible</div>
            {matchResults.filter((r) => !r.eligible).map((r) => (
              <div key={r.vehicle.id} className="border-b border-black/5 py-1.5 text-sm last:border-0">
                <div><span className="font-mono text-xs text-brand">{r.vehicle.id}</span> — {r.vehicle.type}</div>
                <div className="text-[11px] text-muted-foreground">{r.reasons.join(" ")}</div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(88vh,60rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? `Edit ${editingId}` : "Add Vehicle"}</DialogTitle></DialogHeader>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">1 · Vehicle information</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Vehicle Name" v={form.name} onChange={(v) => set("name", v)} required />
            <Field label="Registration Number" v={form.registration} onChange={(v) => set("registration", v)} required />
            <Select label="Vehicle Type" v={form.type} onChange={(v) => set("type", v as FleetVehicleType)} options={VEHICLE_TYPES.map((t) => ({ value: t, label: `${t} (${VEHICLE_TYPE_GUIDE[t].capacity})` }))} />
            <Field label="Brand" v={form.brand} onChange={(v) => set("brand", v)} />
            <Field label="Model" v={form.model} onChange={(v) => set("model", v)} />
            <Field label="Model Year" v={form.modelYear} onChange={(v) => set("modelYear", v)} />
            <Field label="Color" v={form.color} onChange={(v) => set("color", v)} />
            <Select label="Ownership Type" v={form.ownership} onChange={(v) => set("ownership", v as OwnershipType)} options={OWNERSHIP_TYPES.map((t) => ({ value: t, label: t }))} />
            <Select label="Assigned Branch" v={form.branch ?? ""} onChange={(v) => set("branch", v)} options={(branches ?? []).map((b) => ({ value: b.nameEn, label: b.nameEn }))} />
            <Select label="Assigned Stock Location" v={form.stockLocation ?? ""} onChange={(v) => set("stockLocation", v)} options={STOCK_LOCATIONS.map((t) => ({ value: t, label: t }))} />
            <Select label="Status" v={form.status} onChange={(v) => set("status", v as FleetStatus)} options={FLEET_STATUSES.map((t) => ({ value: t, label: t }))} />
            {form.status === "On Hold" && <Field label="Hold Note" v={form.holdNote ?? ""} onChange={(v) => set("holdNote", v)} />}
          </div>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">2 · Capacity</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Max Weight (t)" type="number" v={String(form.maxWeightTons)} onChange={(v) => set("maxWeightTons", Number(v))} required />
            <Field label="Max Volume (m³)" type="number" v={String(form.maxVolumeM3)} onChange={(v) => set("maxVolumeM3", Number(v))} />
            <Field label="Max Pallets" type="number" v={String(form.maxPallets)} onChange={(v) => set("maxPallets", Number(v))} />
            <Field label="Max Length (m)" type="number" v={String(form.maxLengthM)} onChange={(v) => set("maxLengthM", Number(v))} />
            <Field label="Max Width (m)" type="number" v={String(form.maxWidthM)} onChange={(v) => set("maxWidthM", Number(v))} />
            <Field label="Max Height (m)" type="number" v={String(form.maxHeightM)} onChange={(v) => set("maxHeightM", Number(v))} />
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Check label="Heavy-material compatible" v={form.heavyCompatible} onChange={(v) => set("heavyCompatible", v)} />
            <Check label="Open body" v={form.openBody} onChange={(v) => set("openBody", v)} />
            <Check label="Covered" v={form.covered} onChange={(v) => set("covered", v)} />
            <Check label="Crane available" v={form.crane} onChange={(v) => set("crane", v)} />
            <Check label="Tail lift" v={form.tailLift} onChange={(v) => set("tailLift", v)} />
          </div>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">3 · Delivery eligibility</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {MOVEMENT_TYPES.map((m) => (
              <Check key={m} label={m} v={form.allowedMovements.includes(m)} onChange={(on) => set("allowedMovements", on ? [...form.allowedMovements, m] : form.allowedMovements.filter((x) => x !== m))} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {MATERIAL_CATEGORIES.map((c) => (
              <Check key={c} label={c} v={form.allowedCategories.includes(c)} onChange={(on) => set("allowedCategories", on ? [...form.allowedCategories, c] : form.allowedCategories.filter((x) => x !== c))} />
            ))}
          </div>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">4 · Driver assignment</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {driverOptions.length > 0 ? (
              <Select label="Primary Driver" v={form.primaryDriver ?? ""} onChange={(v) => set("primaryDriver", v)} options={driverOptions} />
            ) : (
              <Field label="Primary Driver" v={form.primaryDriver ?? ""} onChange={(v) => set("primaryDriver", v)} />
            )}
            <Field label="Secondary Driver" v={form.secondaryDriver ?? ""} onChange={(v) => set("secondaryDriver", v)} />
            <Field label="Assignment Start" type="date" v={form.assignmentStart ?? ""} onChange={(v) => set("assignmentStart", v)} />
            <Field label="Assignment End" type="date" v={form.assignmentEnd ?? ""} onChange={(v) => set("assignmentEnd", v)} />
          </div>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">5 · Vehicle documents</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Registration Expiry" type="date" v={form.registrationExpiry} onChange={(v) => set("registrationExpiry", v)} />
            <Field label="Insurance Expiry" type="date" v={form.insuranceExpiry} onChange={(v) => set("insuranceExpiry", v)} />
            <Field label="Operating Permit Expiry" type="date" v={form.permitExpiry ?? ""} onChange={(v) => set("permitExpiry", v)} />
            <Field label="Notes" v={form.notes ?? ""} onChange={(v) => set("notes", v)} />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-brand text-brand-foreground hover:bg-brand/90">Save Vehicle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
