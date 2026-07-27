import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Field, Select } from "@/components/delivery/FormFields";
import { useDeliveryStore, type Driver } from "@/lib/delivery/store";
import { useHrStore, driverAvailable } from "@/lib/hr/store";
import { useBranches } from "@/lib/api/admin";

const DRIVER_STATUSES: Driver["status"][] = [
  "Available", "Assigned", "Loading", "On Delivery", "On Break", "Off Shift", "On Leave", "Licence Expired", "Inactive",
];

type FormState = { name: string; branch: string; mobile: string; license: string; licenseExpiry: string; vehicleId: string; status: Driver["status"] };
const EMPTY_FORM: FormState = { name: "", branch: "", mobile: "", license: "", licenseExpiry: "", vehicleId: "", status: "Available" };

export function DriversPage() {
  const drivers = useDeliveryStore((s) => s.drivers);
  const vehicles = useDeliveryStore((s) => s.vehicles);
  const addDriver = useDeliveryStore((s) => s.addDriver);
  const editDriver = useDeliveryStore((s) => s.editDriver);
  const employees = useHrStore((s) => s.employees);
  const { data: branches } = useBranches();

  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const rows = drivers.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.empId.includes(q));

  function openAdd() {
    setEditingEmpId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }
  function openEdit(d: Driver) {
    setEditingEmpId(d.empId);
    setForm({ name: d.name, branch: d.branch, mobile: d.mobile, license: d.license, licenseExpiry: d.licenseExpiry, vehicleId: d.vehicleId ?? "", status: d.status });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name || !form.branch || !form.mobile || !form.license || !form.licenseExpiry) {
      toast.error("Name, branch, mobile, licence number and expiry are all required.");
      return;
    }
    setSaving(true);
    const res = editingEmpId
      ? await editDriver(editingEmpId, { ...form, vehicleId: form.vehicleId || undefined })
      : await addDriver(form);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not save driver.");
      return;
    }
    toast.success(editingEmpId ? "Driver updated" : "Driver added");
    setDialogOpen(false);
  }

  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Driver Assignments" desc="Delivery & Dispatch employees. Availability is derived live from HR attendance, licence expiry and leave status." />
      <div className="flex items-center justify-between gap-2 rounded-xl border border-black/5 bg-white p-2">
        <input placeholder="Search driver…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-64 rounded-lg border border-black/10 bg-canvas px-3 text-sm outline-none focus:border-brand" />
        <Button size="sm" onClick={openAdd} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
          <Plus className="h-4 w-4" /> Add Driver
        </Button>
      </div>
      <SectionCard title="Drivers" desc={`${rows.length} of ${drivers.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">EMP</th>
                <th className="px-2 py-2 text-left">Driver</th>
                <th className="px-2 py-2 text-left">Branch</th>
                <th className="px-2 py-2 text-left">Mobile</th>
                <th className="px-2 py-2 text-left">Licence</th>
                <th className="px-2 py-2 text-left">Licence Expiry</th>
                <th className="px-2 py-2 text-left">Vehicle</th>
                <th className="px-2 py-2 text-left">Current DO</th>
                <th className="px-2 py-2 text-right">Today</th>
                <th className="px-2 py-2 text-left">Availability</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const chk = driverAvailable(d.empId);
                const emp = employees.find((e) => e.id === d.empId);
                return (
                  <tr key={d.empId} className="border-t border-black/5">
                    <td className="px-2 py-2 font-mono text-xs">{d.empId}</td>
                    <td className="px-2 py-2">{d.name}</td>
                    <td className="px-2 py-2 text-muted-foreground">{d.branch}</td>
                    <td className="px-2 py-2 font-mono text-xs">{d.mobile}</td>
                    <td className="px-2 py-2 font-mono text-xs">{d.license}</td>
                    <td className="px-2 py-2 text-muted-foreground">{d.licenseExpiry}</td>
                    <td className="px-2 py-2 font-mono text-xs">{d.vehicleId ?? "—"}</td>
                    <td className="px-2 py-2 font-mono text-xs">{d.currentDelivery ?? "—"}</td>
                    <td className="px-2 py-2 text-right">{d.deliveriesToday}</td>
                    <td className="px-2 py-2">
                      <Pill tone={chk.ok ? (d.status === "Available" ? "success" : "info") : "critical"}>
                        {chk.ok ? d.status : chk.reason ?? "Blocked"}
                      </Pill>
                      {emp?.status === "On Leave" && <span className="ml-1 text-[10px] text-warning">HR: On Leave</span>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => openEdit(d)} className="rounded-md border border-black/10 px-2 py-1 text-xs font-medium hover:border-brand/40 hover:text-brand">
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="px-2 py-6 text-center text-sm text-muted-foreground">No drivers match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEmpId ? "Edit Driver" : "Add Driver"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Full Name" v={form.name} onChange={(v) => setForm({ ...form, name: v })} required /></div>
            <Select label="Branch" v={form.branch} onChange={(v) => setForm({ ...form, branch: v })} options={(branches ?? []).map((b) => ({ value: b.nameEn, label: b.nameEn }))} />
            <Field label="Mobile" v={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} required />
            <Field label="Licence Number" v={form.license} onChange={(v) => setForm({ ...form, license: v })} required />
            <Field label="Licence Expiry" type="date" v={form.licenseExpiry} onChange={(v) => setForm({ ...form, licenseExpiry: v })} required />
            {editingEmpId && (
              <>
                <Select
                  label="Assigned Vehicle"
                  v={form.vehicleId}
                  onChange={(v) => setForm({ ...form, vehicleId: v })}
                  options={vehicles.map((v) => ({ value: v.id, label: `${v.registration} (${v.type})` }))}
                />
                <Select
                  label="Status"
                  v={form.status}
                  onChange={(v) => setForm({ ...form, status: v as Driver["status"] })}
                  options={DRIVER_STATUSES.map((s) => ({ value: s, label: s }))}
                />
              </>
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
