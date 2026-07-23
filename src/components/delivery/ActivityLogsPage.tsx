import { useMemo, useState } from "react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { useAuditStore } from "@/lib/store/audit";

export function DeliveryLogsPage() {
  const events = useAuditStore((s) => s.events).filter((e) => e.module === "delivery");
  const [severity, setSeverity] = useState<"all" | "info" | "warning" | "critical">("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => events.filter((e) => (severity === "all" || e.severity === severity) && (!q || e.event.toLowerCase().includes(q.toLowerCase()) || e.recordId?.includes(q))), [events, severity, q]);

  const kpi = useMemo(() => ({
    total: events.length,
    critical: events.filter((e) => e.severity === "critical").length,
    warning: events.filter((e) => e.severity === "warning").length,
    info: events.filter((e) => e.severity === "info").length,
  }), [events]);

  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Delivery Activity Logs" desc="Every stage transition, driver assignment and delivery outcome — the audit trail." />
      <KpiGrid items={[
        { label: "Total Events", value: kpi.total, sub: "Persisted locally", tone: "info" },
        { label: "Critical", value: kpi.critical, sub: "Failures, blocks", tone: "critical" },
        { label: "Warning", value: kpi.warning, sub: "Reschedules, returns", tone: "warning" },
        { label: "Info", value: kpi.info, sub: "Normal state changes", tone: "success" },
      ]} />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2">
        <input placeholder="Search event or record…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-72 rounded-lg border border-black/10 bg-canvas px-3 text-sm" />
        <select value={severity} onChange={(e) => setSeverity(e.target.value as never)} className="h-9 rounded-lg border border-black/10 bg-canvas px-2 text-sm">
          <option value="all">All severity</option><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option>
        </select>
      </div>
      <SectionCard title="Events" desc={`${rows.length} matching`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr><th className="px-2 py-2 text-left">Time</th><th className="px-2 py-2 text-left">Event</th><th className="px-2 py-2 text-left">Record</th><th className="px-2 py-2 text-left">Branch</th><th className="px-2 py-2 text-left">Old</th><th className="px-2 py-2 text-left">New</th><th className="px-2 py-2 text-left">Reason</th><th className="px-2 py-2 text-left">Severity</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-black/5">
                  <td className="px-2 py-2 text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</td>
                  <td className="px-2 py-2 font-mono text-xs">{e.event}</td>
                  <td className="px-2 py-2 font-mono text-xs">{e.recordId ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{e.branch ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{e.oldValue ?? "—"}</td>
                  <td className="px-2 py-2">{e.newValue ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{e.reason ?? "—"}</td>
                  <td className="px-2 py-2"><Pill tone={e.severity === "critical" ? "critical" : e.severity === "warning" ? "warning" : "info"}>{e.severity}</Pill></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-2 py-6 text-center text-sm text-muted-foreground">No matching events. Try creating a delivery or moving a stage.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}