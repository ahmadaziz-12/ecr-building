import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Field, Select } from "@/components/delivery/FormFields";
import { useDeliveryStore, type Vehicle } from "@/lib/delivery/store";
import { useBranches } from "@/lib/api/admin";

const VEHICLE_TYPES: Vehicle["type"][] = ["Flatbed Truck", "Box Truck", "Pickup", "Delivery Van", "Heavy Truck"];
const VEHICLE_STATUSES: Vehicle["status"][] = ["Available", "Assigned", "Loading", "On Delivery", "Maintenance", "Inactive"];

type FormState = { registration: string; type: Vehicle["type"]; branch: string; capacityTons: string; status: Vehicle["status"] };
const EMPTY_FORM: FormState = { registration: "", type: "Flatbed Truck", branch: "", capacityTons: "", status: "Available" };

export function VehiclesPage() {
  const vehicles = useDeliveryStore((s) => s.vehicles);
  const addVehicle = useDeliveryStore((s) => s.addVehicle);
  const editVehicle = useDeliveryStore((s) => s.editVehicle);
  const { data: branches } = useBranches();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }
  function openEdit(v: Vehicle) {
    setEditingId(v.id);
    setForm({ registration: v.registration, type: v.type, branch: v.branch, capacityTons: String(v.capacityTons), status: v.status });
    setDialogOpen(true);
  }

  async function save() {
    const capacityTons = Number(form.capacityTons);
    if (!form.registration || !form.branch || !capacityTons) {
      toast.error("Registration, branch and capacity are all required.");
      return;
    }
    setSaving(true);
    const res = editingId
      ? await editVehicle(editingId, { ...form, capacityTons })
      : await addVehicle({ ...form, capacityTons });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not save vehicle.");
      return;
    }
    toast.success(editingId ? "Vehicle updated" : "Vehicle added");
    setDialogOpen(false);
  }

  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Vehicle Assignments" desc="Fleet vehicles used for delivery — capacity, driver, and current dispatch." />
      <div className="flex items-center justify-end rounded-xl border border-black/5 bg-white p-2">
        <Button size="sm" onClick={openAdd} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
          <Plus className="h-4 w-4" /> Add Vehicle
        </Button>
      </div>
      <SectionCard title="Vehicles" desc={`${vehicles.length} in fleet`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">Vehicle</th>
                <th className="px-2 py-2 text-left">Registration</th>
                <th className="px-2 py-2 text-left">Type</th>
                <th className="px-2 py-2 text-left">Branch</th>
                <th className="px-2 py-2 text-right">Capacity</th>
                <th className="px-2 py-2 text-right">Load</th>
                <th className="px-2 py-2 text-left">Driver</th>
                <th className="px-2 py-2 text-left">Delivery</th>
                <th className="px-2 py-2 text-left">Device</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const util = v.currentLoad ? Math.min(100, Math.round((v.currentLoad / v.capacityTons) * 100)) : 0;
                return (
                  <tr key={v.id} className="border-t border-black/5">
                    <td className="px-2 py-2 font-mono text-xs text-brand">{v.id}</td>
                    <td className="px-2 py-2 font-mono text-xs">{v.registration}</td>
                    <td className="px-2 py-2">{v.type}</td>
                    <td className="px-2 py-2 text-muted-foreground">{v.branch}</td>
                    <td className="px-2 py-2 text-right">{v.capacityTons} t</td>
                    <td className="px-2 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-black/5">
                          <div className={`h-1.5 rounded-full ${util > 90 ? "bg-critical" : util > 70 ? "bg-warning" : "bg-brand"}`} style={{ width: `${util}%` }} />
                        </div>
                        <span className="font-mono text-[11px]">{v.currentLoad ?? 0} t</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{v.driverEmpId ?? "—"}</td>
                    <td className="px-2 py-2 font-mono text-xs">{v.currentDelivery ?? "—"}</td>
                    <td className="px-2 py-2"><Pill tone={v.deviceStatus === "Online" ? "success" : v.deviceStatus === "Idle" ? "warning" : "critical"}>{v.deviceStatus}</Pill></td>
                    <td className="px-2 py-2"><Pill tone={v.status === "Available" ? "success" : v.status === "Inactive" ? "muted" : "info"}>{v.status}</Pill></td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => openEdit(v)} className="rounded-md border border-black/10 px-2 py-1 text-xs font-medium hover:border-brand/40 hover:text-brand">
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {vehicles.length === 0 && (
                <tr><td colSpan={11} className="px-2 py-6 text-center text-sm text-muted-foreground">No vehicles in fleet yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Registration" v={form.registration} onChange={(v) => setForm({ ...form, registration: v })} required />
            <Select
              label="Type"
              v={form.type}
              onChange={(v) => setForm({ ...form, type: v as Vehicle["type"] })}
              options={VEHICLE_TYPES.map((t) => ({ value: t, label: t }))}
            />
            <Select label="Branch" v={form.branch} onChange={(v) => setForm({ ...form, branch: v })} options={(branches ?? []).map((b) => ({ value: b.nameEn, label: b.nameEn }))} />
            <Field label="Capacity (tons)" type="number" v={form.capacityTons} onChange={(v) => setForm({ ...form, capacityTons: v })} required />
            {editingId && (
              <Select
                label="Status"
                v={form.status}
                onChange={(v) => setForm({ ...form, status: v as Vehicle["status"] })}
                options={VEHICLE_STATUSES.map((s) => ({ value: s, label: s }))}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand/90">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
