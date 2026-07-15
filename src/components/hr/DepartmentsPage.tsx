import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHrStore, employeeName } from "@/lib/hr/store";

export function DepartmentsPage() {
  const departments = useHrStore((s) => s.departments);
  const employees = useHrStore((s) => s.employees);
  const addDept = useHrStore((s) => s.addDepartment);
  const updateDept = useHrStore((s) => s.updateDepartment);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", arabicName: "", code: "", managerEmpId: "", branchScope: "All Branches" as const });

  return (
    <div className="space-y-4">
      <PageHeader group="HRMS" title="Departments" desc="Create and manage departments, assign a manager and choose branch scope." primary="Create Department" onPrimary={() => setOpen(true)} />
      <SectionCard title="Departments" desc={`${departments.length} total`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-2 py-2 text-left">ID</th><th className="px-2 py-2 text-left">Department</th><th className="px-2 py-2 text-left">Arabic</th><th className="px-2 py-2 text-left">Manager</th><th className="px-2 py-2 text-left">Branch Scope</th><th className="px-2 py-2 text-right">Employees</th><th className="px-2 py-2 text-left">Status</th><th /></tr>
            </thead>
            <tbody>
              {departments.map((d) => {
                const manager = employees.find((e) => e.id === d.managerEmpId);
                const count = employees.filter((e) => e.department === d.name).length;
                return (
                  <tr key={d.id} className="border-t border-black/5">
                    <td className="px-2 py-2 font-mono text-xs">{d.id}</td>
                    <td className="px-2 py-2 font-medium">{d.name}</td>
                    <td className="px-2 py-2 text-muted-foreground">{d.arabicName}</td>
                    <td className="px-2 py-2">{manager ? employeeName(manager) : "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{d.branchScope}</td>
                    <td className="px-2 py-2 text-right">{count}</td>
                    <td className="px-2 py-2"><Pill tone={d.status === "Active" ? "success" : "muted"}>{d.status}</Pill></td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => {
                          if (d.status === "Active" && employees.some((e) => e.department === d.name && e.status === "Active")) {
                            if (!confirm("Active employees remain — deactivate anyway?")) return;
                          }
                          updateDept(d.id, { status: d.status === "Active" ? "Inactive" : "Active" });
                          toast.success(`${d.name} ${d.status === "Active" ? "deactivated" : "activated"}`);
                        }}
                        className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] hover:border-brand/40 hover:text-brand"
                      >
                        {d.status === "Active" ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Department</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <input placeholder="Department Name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm" />
            <input placeholder="Arabic Name" value={f.arabicName} onChange={(e) => setF({ ...f, arabicName: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm" dir="rtl" />
            <input placeholder="Code *" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm font-mono" />
            <select value={f.managerEmpId} onChange={(e) => setF({ ...f, managerEmpId: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm">
              <option value="">Assign later</option>
              {employees.filter((e) => e.status === "Active").map((e) => <option key={e.id} value={e.id}>{employeeName(e)}</option>)}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!f.name || !f.code) { toast.error("Name and code required."); return; }
                  if (useHrStore.getState().departments.some((d) => d.code.toUpperCase() === f.code.toUpperCase())) { toast.error("Code must be unique."); return; }
                  addDept({ name: f.name, arabicName: f.arabicName, code: f.code, managerEmpId: f.managerEmpId || undefined, branchScope: f.branchScope, status: "Active" });
                  toast.success(`${f.name} created`);
                  setF({ name: "", arabicName: "", code: "", managerEmpId: "", branchScope: "All Branches" });
                  setOpen(false);
                }}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Plus className="h-4 w-4" /> Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}