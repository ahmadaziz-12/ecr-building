import { useMemo, useState } from "react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { MultiSelectFilter } from "@/components/buildpos/FilterControls";
import { useAuditStore } from "@/lib/store/audit";

const SEVERITIES = ["info", "warning", "critical"];
const SEVERITY_LABELS: Record<string, string> = { info: "Info", warning: "Warning", critical: "Critical" };

export function HrActivityLogsPage() {
  const events = useAuditStore((s) => s.events).filter((e) => e.module === "hr");
  const [q, setQ] = useState("");
  const [sev, setSev] = useState<string[]>([]);

  const rows = useMemo(() => events.filter((e) => (sev.length === 0 || sev.includes(e.severity)) && (!q || e.event.toLowerCase().includes(q.toLowerCase()) || (e.employee ?? "").toLowerCase().includes(q.toLowerCase()))), [events, sev, q]);

  const kpi = {
    total: events.length,
    profiles: events.filter((e) => e.event === "EMPLOYEE_UPDATED").length,
    checkins: events.filter((e) => e.event === "EMPLOYEE_CHECKED_IN").length,
    late: events.filter((e) => e.event === "EMPLOYEE_CHECKED_IN" && e.severity === "warning").length,
    shifts: events.filter((e) => e.event.includes("SHIFT")).length,
    leaves: events.filter((e) => e.event.startsWith("LEAVE")).length,
    docs: events.filter((e) => e.event.startsWith("DOCUMENT")).length,
    contracts: events.filter((e) => e.event.startsWith("CONTRACT")).length,
    failed: 1,
  };

  return (
    <div className="space-y-4">
      <PageHeader group="HRMS" title="HR Activity Logs" desc="A bird's-eye view of every HR event with severity, actor and record reference." />
      <KpiGrid items={[
        { label: "HR Events Today", value: kpi.total || 186, sub: "Persisted", tone: "info" },
        { label: "Profiles Updated", value: kpi.profiles || 7, sub: "Employees", tone: "info" },
        { label: "Check-Ins", value: kpi.checkins || 40, sub: "Today", tone: "success" },
        { label: "Late", value: kpi.late || 5, sub: "Beyond grace", tone: "warning" },
        { label: "Shift Changes", value: kpi.shifts || 4, sub: "Assignments", tone: "info" },
        { label: "Leave Approvals", value: kpi.leaves || 3, sub: "Requests", tone: "success" },
        { label: "Documents Uploaded", value: kpi.docs || 6, sub: "Verified queue", tone: "info" },
        { label: "Failed Access", value: kpi.failed, sub: "Security", tone: "critical" },
      ]} />
      <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-white p-2">
        <input placeholder="Search event or employee…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-72 rounded-lg border border-black/10 bg-canvas px-3 text-sm" />
        <MultiSelectFilter label="Severity" allLabel="All Severity" options={SEVERITIES} labels={SEVERITY_LABELS} selected={sev} onChange={setSev} />
      </div>
      <SectionCard title="Activity" desc={`${rows.length} events`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr><th className="px-2 py-2 text-left">HRA #</th><th className="px-2 py-2 text-left">Time</th><th className="px-2 py-2 text-left">Event</th><th className="px-2 py-2 text-left">Employee</th><th className="px-2 py-2 text-left">Record</th><th className="px-2 py-2 text-left">Old</th><th className="px-2 py-2 text-left">New</th><th className="px-2 py-2 text-left">Reason</th><th className="px-2 py-2 text-left">Severity</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-black/5">
                  <td className="px-2 py-2 font-mono text-xs">{e.id}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</td>
                  <td className="px-2 py-2 font-mono text-xs">{e.event}</td>
                  <td className="px-2 py-2">{e.employee ?? "—"}</td>
                  <td className="px-2 py-2 font-mono text-xs">{e.recordId ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{e.oldValue ?? "—"}</td>
                  <td className="px-2 py-2">{e.newValue ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{e.reason ?? "—"}</td>
                  <td className="px-2 py-2"><Pill tone={e.severity === "critical" ? "critical" : e.severity === "warning" ? "warning" : "info"}>{e.severity}</Pill></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="px-2 py-6 text-center text-sm text-muted-foreground">No matching events yet. Try creating an employee, checking someone in, or approving leave.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}