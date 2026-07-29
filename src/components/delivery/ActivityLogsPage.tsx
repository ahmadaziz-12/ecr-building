import { useMemo, useState } from "react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { MultiSelectFilter } from "@/components/buildpos/FilterControls";
import { useAuditLogs, useBranches } from "@/lib/api/admin";

const SEVERITIES = ["info", "warning", "critical"];
const SEVERITY_LABELS: Record<string, string> = { info: "Info", warning: "Warning", critical: "Critical" };

export function DeliveryLogsPage() {
  const { data: events } = useAuditLogs("delivery");
  const { data: branches } = useBranches();
  const [severity, setSeverity] = useState<string[]>([]);
  const [q, setQ] = useState("");

  const branchName = (id: number | null) => (id ? (branches?.find((b) => b.id === id)?.nameEn ?? `#${id}`) : "—");

  const rows = useMemo(
    () =>
      (events ?? []).filter(
        (e) =>
          (severity.length === 0 || severity.includes(e.severity.toLowerCase())) &&
          (!q || e.event.toLowerCase().includes(q.toLowerCase()) || e.recordId?.includes(q)),
      ),
    [events, severity, q],
  );

  const kpi = useMemo(() => {
    const all = events ?? [];
    return {
      total: all.length,
      critical: all.filter((e) => e.severity.toLowerCase() === "critical").length,
      warning: all.filter((e) => e.severity.toLowerCase() === "warning").length,
      info: all.filter((e) => e.severity.toLowerCase() === "info").length,
    };
  }, [events]);

  return (
    <div className="space-y-4">
      <PageHeader group="Delivery" title="Delivery Activity Logs" desc="Every stage transition, driver assignment and delivery outcome — the audit trail." />
      <KpiGrid items={[
        { label: "Total Events", value: kpi.total, sub: "Live from server", tone: "info" },
        { label: "Critical", value: kpi.critical, sub: "Failures, blocks", tone: "critical" },
        { label: "Warning", value: kpi.warning, sub: "Reschedules, returns", tone: "warning" },
        { label: "Info", value: kpi.info, sub: "Normal state changes", tone: "success" },
      ]} scope="delivery-logs" />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2">
        <input placeholder="Search event or record…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-72 rounded-lg border border-black/10 bg-canvas px-3 text-sm" />
        <MultiSelectFilter label="Severity" allLabel="All Severity" options={SEVERITIES} labels={SEVERITY_LABELS} selected={severity} onChange={setSeverity} />
      </div>
      <SectionCard title="Events" desc={`${rows.length} matching`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr><th className="px-2 py-2 text-left">Time</th><th className="px-2 py-2 text-left">Event</th><th className="px-2 py-2 text-left">Record</th><th className="px-2 py-2 text-left">Branch</th><th className="px-2 py-2 text-left">User</th><th className="px-2 py-2 text-left">Severity</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-black/5">
                  <td className="px-2 py-2 text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-2 font-mono text-xs">{e.event}</td>
                  <td className="px-2 py-2 font-mono text-xs">{e.recordId ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{branchName(e.branchId)}</td>
                  <td className="px-2 py-2">{e.userName ?? "system"}</td>
                  <td className="px-2 py-2"><Pill tone={e.severity.toLowerCase() === "critical" ? "critical" : e.severity.toLowerCase() === "warning" ? "warning" : "info"}>{e.severity}</Pill></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-sm text-muted-foreground">No matching events. Try creating a delivery or moving a stage.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
