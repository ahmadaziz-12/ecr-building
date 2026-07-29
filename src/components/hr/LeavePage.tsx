import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Plus } from "lucide-react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHrStore, employeeName, type Leave } from "@/lib/hr/store";

const TABS = ["Dashboard", "Requests", "Calendar", "Types", "Balances", "History"];

export function LeavePage() {
  const leaves = useHrStore((s) => s.leaves);
  const employees = useHrStore((s) => s.employees);
  const addLeave = useHrStore((s) => s.addLeave);
  const updateStatus = useHrStore((s) => s.updateLeaveStatus);
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ empId: "", type: "Annual Leave" as Leave["type"], start: "", end: "", reason: "", handoverTo: "" });

  const kpi = {
    pending: leaves.filter((l) => l.status === "Submitted" || l.status === "Pending Manager" || l.status === "Pending HR").length,
    approved: leaves.filter((l) => l.status === "Approved").length,
    todayOnLeave: leaves.filter((l) => l.status === "Approved" && l.start <= new Date().toISOString().slice(0, 10) && l.end >= new Date().toISOString().slice(0, 10)).length,
    upcoming: leaves.filter((l) => l.status === "Approved" && l.start > new Date().toISOString().slice(0, 10)).length,
    rejected: leaves.filter((l) => l.status === "Rejected").length,
    conflicts: 1,
  };

  function submitNew() {
    if (!f.empId || !f.start || !f.end) { toast.error("Employee, start and end dates are required."); return; }
    if (f.end < f.start) { toast.error("End date cannot be before start date."); return; }
    const days = Math.max(1, Math.round((new Date(f.end).getTime() - new Date(f.start).getTime()) / 86400000) + 1);
    if (leaves.some((l) => l.empId === f.empId && l.status === "Approved" && !(f.end < l.start || f.start > l.end))) {
      toast.error("Overlaps with existing approved leave."); return;
    }
    addLeave({ ...f, days, status: "Submitted" });
    toast.success("Leave submitted");
    setF({ empId: "", type: "Annual Leave", start: "", end: "", reason: "", handoverTo: "" });
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <PageHeader group="HRMS" title="Leave Management" desc="Create, review, approve or reject leave. Approved leave marks attendance and blocks driver assignment automatically." primary="New Leave" onPrimary={() => setOpen(true)} />
      <div className="flex flex-wrap gap-1 border-b border-black/5">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className={`relative px-3 py-2 text-sm font-medium ${i === tab ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
            {i === tab && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <KpiGrid items={[
          { label: "Pending Requests", value: kpi.pending, sub: "Awaiting approval", tone: "warning" },
          { label: "Approved This Month", value: kpi.approved, sub: "Confirmed", tone: "success" },
          { label: "On Leave Today", value: kpi.todayOnLeave, sub: "Active", tone: "warning" },
          { label: "Upcoming Leave", value: kpi.upcoming, sub: "Future", tone: "info" },
          { label: "Rejected", value: kpi.rejected, sub: "This month", tone: "muted" },
          { label: "Conflicts", value: kpi.conflicts, sub: "Coverage risk", tone: "critical" },
          { label: "Leave Types", value: 5, sub: "Configured", tone: "info" },
          { label: "Team Calendar", value: "Live", sub: "Synced", tone: "success" },
        ]} scope="hr-leave" />
      )}

      {(tab === 0 || tab === 1 || tab === 5) && (
        <SectionCard title={tab === 1 ? "Requests" : tab === 5 ? "Approval History" : "Recent Requests"}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-2 py-2 text-left">Leave #</th><th className="px-2 py-2 text-left">Employee</th><th className="px-2 py-2 text-left">Type</th><th className="px-2 py-2 text-left">From</th><th className="px-2 py-2 text-left">To</th><th className="px-2 py-2 text-right">Days</th><th className="px-2 py-2 text-left">Handover</th><th className="px-2 py-2 text-left">Status</th><th /></tr>
              </thead>
              <tbody>
                {leaves.map((l) => (
                  <tr key={l.id} className="border-t border-black/5">
                    <td className="px-2 py-2 font-mono text-xs">{l.id}</td>
                    <td className="px-2 py-2">{employeeName(employees.find((e) => e.id === l.empId))}</td>
                    <td className="px-2 py-2">{l.type}</td>
                    <td className="px-2 py-2">{l.start}</td>
                    <td className="px-2 py-2">{l.end}</td>
                    <td className="px-2 py-2 text-right">{l.days}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{l.handoverTo ? employeeName(employees.find((e) => e.id === l.handoverTo)) : "—"}</td>
                    <td className="px-2 py-2">
                      <Pill tone={l.status === "Approved" ? "success" : l.status === "Rejected" ? "critical" : l.status === "Cancelled" ? "muted" : "warning"}>{l.status}</Pill>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {(l.status === "Submitted" || l.status === "Pending Manager" || l.status === "Pending HR") && (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => { updateStatus(l.id, "Approved", "Manager"); toast.success("Leave approved — attendance updated, driver availability refreshed."); }} className="grid h-7 w-7 place-items-center rounded-md border border-black/10 bg-white hover:border-success/40 hover:text-success"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => { updateStatus(l.id, "Rejected"); toast.warning("Leave rejected"); }} className="grid h-7 w-7 place-items-center rounded-md border border-black/10 bg-white hover:border-critical/40 hover:text-critical"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                      {l.status === "Approved" && (
                        <button onClick={() => { updateStatus(l.id, "Cancelled"); toast("Leave cancelled — balance restored"); }} className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] hover:border-brand/40 hover:text-brand">
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === 2 && (
        <SectionCard title="Team Calendar" desc="Approved & pending leave for the next 30 days.">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
            {Array.from({ length: 30 }).map((_, i) => {
              const d = new Date(); d.setDate(d.getDate() + i);
              const iso = d.toISOString().slice(0, 10);
              const items = leaves.filter((l) => l.status === "Approved" && iso >= l.start && iso <= l.end);
              return (
                <div key={iso} className="rounded-lg border border-black/5 bg-canvas p-2">
                  <p className="text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: "short" })}</p>
                  <p className="font-display text-sm font-bold text-foreground">{d.getDate()}</p>
                  {items.map((l) => (
                    <p key={l.id} className="mt-1 truncate rounded bg-warning/20 px-1 text-[9px] text-[oklch(0.4_0.13_70)]">
                      {employees.find((e) => e.id === l.empId)?.lastName}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {tab === 3 && (
        <SectionCard title="Leave Types">
          <ul className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            {["Annual Leave", "Sick Leave", "Emergency Leave", "Unpaid Leave", "Other Approved Leave"].map((t) => (
              <li key={t} className="rounded-lg border border-black/5 bg-canvas p-3">
                <p className="font-medium text-foreground">{t}</p>
                <p className="text-[11px] text-muted-foreground">Balance tracking mock — configurable in full build.</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {tab === 4 && (
        <SectionCard title="Leave Balances" desc="Illustrative — no live payroll calculation.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-2 py-2 text-left">Employee</th><th className="px-2 py-2 text-right">Annual</th><th className="px-2 py-2 text-right">Sick</th><th className="px-2 py-2 text-right">Emergency</th></tr>
              </thead>
              <tbody>
                {employees.slice(0, 8).map((e) => (
                  <tr key={e.id} className="border-t border-black/5">
                    <td className="px-2 py-2">{employeeName(e)}</td>
                    <td className="px-2 py-2 text-right">21d</td>
                    <td className="px-2 py-2 text-right">10d</td>
                    <td className="px-2 py-2 text-right">5d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <select value={f.empId} onChange={(e) => setF({ ...f, empId: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm">
              <option value="">Select employee…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.id} · {employeeName(e)}</option>)}
            </select>
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Leave["type"] })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm">
              {["Annual Leave", "Sick Leave", "Emergency Leave", "Unpaid Leave", "Other Approved Leave"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm" />
              <input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm" />
            </div>
            <select value={f.handoverTo} onChange={(e) => setF({ ...f, handoverTo: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm">
              <option value="">Handover to (optional)</option>
              {employees.filter((e) => e.id !== f.empId).map((e) => <option key={e.id} value={e.id}>{employeeName(e)}</option>)}
            </select>
            <textarea placeholder="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submitNew} className="bg-brand text-brand-foreground hover:bg-brand/90"><Plus className="h-4 w-4" /> Submit</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}