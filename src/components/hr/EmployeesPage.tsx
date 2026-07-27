import { useMemo, useState } from "react";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { MultiSelectFilter } from "@/components/buildpos/FilterControls";
import { useHrStore, employeeName } from "@/lib/hr/store";
import { AddEmployeeDialog } from "./AddEmployeeDialog";

const STATUSES = ["Active", "Probation", "On Leave", "Suspended", "Resigned", "Terminated", "Inactive"];

export function EmployeesPage() {
  const employees = useHrStore((s) => s.employees);
  const attendance = useHrStore((s) => s.attendance);
  const contracts = useHrStore((s) => s.contracts);
  const deactivate = useHrStore((s) => s.deactivateEmployee);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => employees.filter((e) => {
    if (dept.length && !dept.includes(e.department)) return false;
    if (status.length && !status.includes(e.status)) return false;
    if (q) {
      const t = q.toLowerCase();
      return e.id.toLowerCase().includes(t) || employeeName(e).toLowerCase().includes(t) || e.mobile.includes(q);
    }
    return true;
  }), [employees, dept, status, q]);

  const depts = Array.from(new Set(employees.map((e) => e.department)));

  return (
    <div className="space-y-4">
      <PageHeader group="HRMS" title="Employees" desc="Add, view and edit employees. Attendance today is shown per row. Deactivation is soft — the record stays in history." primary="Add Employee" onPrimary={() => setOpen(true)} onExport={() => alert("Exported CSV (mock)")} />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2">
        <input placeholder="Search name / ID / mobile…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-64 rounded-lg border border-black/10 bg-canvas px-3 text-sm" />
        <MultiSelectFilter label="Department" allLabel="All Departments" options={depts} selected={dept} onChange={setDept} />
        <MultiSelectFilter label="Status" allLabel="All Statuses" options={STATUSES} selected={status} onChange={setStatus} />
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} of {employees.length}</span>
      </div>
      <SectionCard title="Employee Directory" desc={`${rows.length} records`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left">EMP</th>
                <th className="px-2 py-2 text-left">Name</th>
                <th className="px-2 py-2 text-left">Department</th>
                <th className="px-2 py-2 text-left">Designation</th>
                <th className="px-2 py-2 text-left">Branch</th>
                <th className="px-2 py-2 text-left">Shift</th>
                <th className="px-2 py-2 text-left">Mobile</th>
                <th className="px-2 py-2 text-left">Today</th>
                <th className="px-2 py-2 text-left">Contract</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const att = attendance.find((a) => a.empId === e.id && a.date === today);
                const con = contracts.find((c) => c.empId === e.id && c.status !== "Renewed" && c.status !== "Closed");
                return (
                  <tr key={e.id} className="border-t border-black/5 hover:bg-canvas">
                    <td className="px-2 py-2 font-mono text-xs text-brand">{e.id}</td>
                    <td className="px-2 py-2 font-medium">
                      {employeeName(e)}
                      {e.arabicName && <span className="ml-1 text-[11px] text-muted-foreground">{e.arabicName}</span>}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{e.department}</td>
                    <td className="px-2 py-2">{e.designation}</td>
                    <td className="px-2 py-2 text-muted-foreground">{e.branch}</td>
                    <td className="px-2 py-2 font-mono text-xs">{e.shiftId ?? "—"}</td>
                    <td className="px-2 py-2 font-mono text-xs">{e.mobile}</td>
                    <td className="px-2 py-2">
                      {att ? <Pill tone={att.status === "Present" ? "success" : att.status === "Late" ? "warning" : att.status === "On Leave" ? "info" : "critical"}>{att.status}</Pill> : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-2 text-xs">{con ? con.end : "—"}</td>
                    <td className="px-2 py-2"><Pill tone={e.status === "Active" ? "success" : e.status === "Inactive" || e.status === "Terminated" ? "muted" : "warning"}>{e.status}</Pill></td>
                    <td className="px-2 py-2 text-right">
                      {e.status !== "Inactive" && (
                        <button onClick={() => deactivate(e.id)} className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] hover:border-critical/40 hover:text-critical">Deactivate</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <AddEmployeeDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}