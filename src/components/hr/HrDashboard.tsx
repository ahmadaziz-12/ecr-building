import { useMemo, useState } from "react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { useHrStore, employeeName } from "@/lib/hr/store";
import { useAuditStore } from "@/lib/store/audit";
import { AddEmployeeDialog } from "./AddEmployeeDialog";
import { CheckInDialog } from "./CheckInDialog";
import { AlertTriangle, FileText } from "lucide-react";

export function HrDashboard() {
  const employees = useHrStore((s) => s.employees);
  const attendance = useHrStore((s) => s.attendance);
  const departments = useHrStore((s) => s.departments);
  const leaves = useHrStore((s) => s.leaves);
  const docs = useHrStore((s) => s.docs);
  const contracts = useHrStore((s) => s.contracts);
  const events = useAuditStore((s) => s.events).filter((e) => e.module === "hr").slice(0, 8);
  const [addOpen, setAddOpen] = useState(false);
  const [chkOpen, setChkOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const todaysAtt = attendance.filter((a) => a.date === today);

  const k = useMemo(() => ({
    total: employees.length,
    present: todaysAtt.filter((a) => a.status === "Present" || a.status === "Late").length,
    absent: employees.length - todaysAtt.length - leaves.filter((l) => l.status === "Approved").length,
    onLeave: employees.filter((e) => e.status === "On Leave").length + leaves.filter((l) => l.status === "Approved" && l.start <= today && l.end >= today).length,
    late: todaysAtt.filter((a) => a.status === "Late").length,
    missing: todaysAtt.filter((a) => a.checkIn && !a.checkOut).length,
    open: 6,
    expiring: docs.filter((d) => d.status === "Expiring Soon").length + contracts.filter((c) => c.status === "Expiring Soon").length,
  }), [employees, todaysAtt, leaves, docs, contracts, today]);

  return (
    <div className="space-y-4">
      <PageHeader
        group="HRMS"
        title="Workforce Operations"
        desc="Monitor employee attendance, shifts, leave, department distribution, expiring contracts and workforce activity across branches."
        primary="Add Employee"
        onPrimary={() => setAddOpen(true)}
        actions={
          <button onClick={() => setChkOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-xs font-medium text-foreground hover:border-brand/40 hover:text-brand">
            Check-in / Check-out
          </button>
        }
      />

      <KpiGrid items={[
        { label: "Total Employees", value: k.total, sub: `${departments.length} departments`, tone: "info" },
        { label: "Present Today", value: k.present, sub: `${todaysAtt.length} clocked in`, tone: "success" },
        { label: "Absent", value: Math.max(0, k.absent), sub: "No check-in", tone: "warning" },
        { label: "On Leave", value: k.onLeave, sub: "Approved leave", tone: "warning" },
        { label: "Late Check-Ins", value: k.late, sub: "Beyond grace", tone: "warning" },
        { label: "Missing Check-Outs", value: k.missing, sub: "Still active", tone: "warning" },
        { label: "Open Employee Shifts", value: k.open, sub: "Active sessions", tone: "info" },
        { label: "Expiring Contracts", value: k.expiring, sub: "Docs + contracts", tone: k.expiring > 0 ? "critical" : "success" },
      ]} />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Attendance Overview" desc={`As of ${today}`}>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Present", k.present, "success"],
              ["Late", k.late, "warning"],
              ["Absent", Math.max(0, k.absent), "critical"],
              ["On Leave", k.onLeave, "warning"],
              ["Missing Out", k.missing, "warning"],
              ["Off Day", 4, "muted"],
            ].map(([label, val, tone]) => (
              <div key={label as string} className="rounded-lg border border-black/5 bg-canvas p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                <p className="mt-0.5 font-display text-lg font-bold text-foreground">{val as number}</p>
                <span className={`inline-block h-1 w-6 rounded ${tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : tone === "critical" ? "bg-critical" : "bg-black/20"}`} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Department Distribution" desc={`${departments.length} departments`} className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {departments.map((d) => {
              const count = employees.filter((e) => e.department === d.name).length;
              return (
                <div key={d.id} className="rounded-lg border border-black/5 bg-canvas p-2">
                  <p className="truncate text-[11px] font-medium text-foreground">{d.name}</p>
                  <p className="text-[10px] text-muted-foreground">{d.arabicName}</p>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-display text-base font-bold text-foreground">{count}</span>
                    <span className="text-[10px] text-muted-foreground">emp</span>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Employee Check-In Status" desc="Today">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-2 py-2 text-left">Employee</th><th className="px-2 py-2 text-left">Shift</th><th className="px-2 py-2 text-left">Check-In</th><th className="px-2 py-2 text-left">Status</th></tr>
              </thead>
              <tbody>
                {todaysAtt.slice(0, 6).map((a) => {
                  const emp = employees.find((e) => e.id === a.empId);
                  return (
                    <tr key={a.id} className="border-t border-black/5">
                      <td className="px-2 py-2">{employeeName(emp)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{a.scheduledIn ? `${a.scheduledIn}–${a.scheduledOut}` : "—"}</td>
                      <td className="px-2 py-2 font-mono text-xs">{a.checkIn ?? "—"}</td>
                      <td className="px-2 py-2"><Pill tone={a.status === "Present" ? "success" : a.status === "Late" ? "warning" : a.status === "On Leave" ? "info" : "critical"}>{a.status}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Expiring Documents & Contracts" desc={`${k.expiring} items`}>
          <div className="space-y-2 text-xs">
            {[...docs, ...contracts].filter((r) => (r as { status: string }).status === "Expiring Soon").map((r) => {
              const emp = employees.find((e) => e.id === (r as { empId: string }).empId);
              const isDoc = "type" in r && "number" in r;
              return (
                <div key={r.id} className="flex items-center gap-2 rounded-lg border border-black/5 bg-canvas p-2">
                  <FileText className="h-3.5 w-3.5 text-warning" />
                  <span className="font-mono text-[11px]">{r.id}</span>
                  <span className="font-medium">{employeeName(emp)}</span>
                  <span className="text-muted-foreground">{isDoc ? (r as { type: string }).type : (r as { jobTitle: string }).jobTitle + " contract"}</span>
                  <span className="ml-auto text-[11px] text-warning">
                    Expiring {isDoc ? (r as { expiryDate?: string }).expiryDate : (r as { end: string }).end}
                  </span>
                </div>
              );
            })}
            {[...docs, ...contracts].filter((r) => (r as { status: string }).status !== "Expiring Soon").length === docs.length + contracts.length && (
              <p className="text-muted-foreground">Nothing expiring soon.</p>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Recent HR Activity" desc={`${events.length} events`}>
        <div className="space-y-2 text-xs">
          {events.length === 0 && <p className="text-muted-foreground">No HR activity yet.</p>}
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-lg border border-black/5 bg-canvas p-2">
              <AlertTriangle className={`h-3.5 w-3.5 ${e.severity === "critical" ? "text-critical" : e.severity === "warning" ? "text-warning" : "text-info"}`} />
              <span className="font-mono text-[11px]">{e.id}</span>
              <span className="font-medium">{e.event}</span>
              <span className="text-muted-foreground">{e.employee ?? e.recordId}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
      <CheckInDialog open={chkOpen} onOpenChange={setChkOpen} />
    </div>
  );
}