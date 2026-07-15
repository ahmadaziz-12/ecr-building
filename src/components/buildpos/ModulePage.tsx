import { useRouterState } from "@tanstack/react-router";
import { Download, Filter, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { getModule } from "@/lib/buildpos/modules";
import type { Severity } from "@/lib/buildpos/format";
import { getFlow } from "@/lib/buildpos/flows";
import { FlowDialog } from "@/components/buildpos/FlowDialog";

function tone(status: string): Severity {
  const k = status.toLowerCase();
  if (/critical|failed|overdue|rejected|expired|offline|breach/.test(k)) return "critical";
  if (/warn|pending|queued|idle|needs|quarantine|delayed|degraded|draft|low|expiring|monitor|partial|awaiting/.test(k)) return "warning";
  if (/active|healthy|cleared|completed|reconciled|received|resolved|delivered|submitted|valid|ok|compliant|paid/.test(k)) return "success";
  if (/dispatched|posted|open|in transit|in progress|assigned/.test(k)) return "info";
  return "muted";
}

const toneKpi: Record<Severity, string> = {
  critical: "bg-critical/10 text-critical border-critical/20",
  warning: "bg-warning/15 text-[oklch(0.4_0.13_70)] border-warning/30",
  success: "bg-success/10 text-[oklch(0.35_0.1_155)] border-success/30",
  info: "bg-info/10 text-[oklch(0.35_0.12_235)] border-info/30",
  muted: "bg-black/5 text-foreground/70 border-black/10",
};

export function ModulePage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const m = getModule(pathname);
  const [flowOpen, setFlowOpen] = useState(false);
  const flow = getFlow(m?.primaryAction);

  if (!m) {
    return (
      <SectionCard title="Module not configured" desc={`No catalog entry for ${pathname}.`}>
        <p className="text-sm text-muted-foreground">Add an entry in <code className="font-mono">src/lib/buildpos/modules.ts</code>.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">{m.group}</p>
          <h1 className="font-display text-2xl font-bold text-foreground">{m.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{m.desc}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground hover:text-foreground">
            <Download className="h-4 w-4" /> Export
          </Button>
          {m.primaryAction && (
            <Button
              size="sm"
              onClick={() => flow && setFlowOpen(true)}
              className="h-9 gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Plus className="h-4 w-4" /> {m.primaryAction}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {m.tabs && (
        <div className="flex flex-wrap gap-1 border-b border-black/5">
          {m.tabs.map((t, i) => (
            <button
              key={t}
              className={`relative px-3 py-2 text-sm font-medium transition ${
                i === 0 ? "text-brand" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
              {i === 0 && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
        <Filter className="ml-1 h-4 w-4 text-muted-foreground" />
        {m.filters.map((f) => (
          <button
            key={f}
            className="rounded-md border border-black/10 bg-canvas px-2.5 py-1 text-xs font-medium text-foreground hover:border-brand/40 hover:text-brand"
          >
            {f}
          </button>
        ))}
        <Button size="sm" className="ml-auto h-8 bg-brand text-brand-foreground hover:bg-brand/90">
          Apply
        </Button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {m.kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,10,50,0.04)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {k.label}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-foreground">{k.value}</p>
            <span
              className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneKpi[k.tone]}`}
            >
              {k.sub}
            </span>
          </div>
        ))}
      </div>

      {/* Main table */}
      <SectionCard
        title={m.tableTitle}
        desc={`${m.rows.length} of ${m.rows.length * 12} records · showing filtered results`}
        action={
          m.actions && (
            <div className="flex flex-wrap gap-1.5">
              {m.actions.slice(0, 4).map((a) => (
                <button
                  key={a}
                  className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs font-medium text-foreground hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                >
                  {a}
                </button>
              ))}
            </div>
          )
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {m.columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {c}
                  </TableHead>
                ))}
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.rows.map((row, i) => (
                <TableRow key={i} className="hover:bg-canvas">
                  {row.map((cell, j) => {
                    const isStatus = m.statusCol === j;
                    const isFirst = j === 0;
                    return (
                      <TableCell
                        key={j}
                        className={`whitespace-nowrap ${
                          isFirst ? "font-mono text-xs text-foreground" : "text-sm"
                        }`}
                      >
                        {isStatus ? (
                          <Pill tone={tone(String(cell))}>{String(cell)}</Pill>
                        ) : (
                          <span className={isFirst ? "" : "text-foreground/85"}>{cell}</span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <button className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing 1–{m.rows.length} of ~{m.rows.length * 12}</span>
          <div className="flex items-center gap-1">
            <button className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40">Prev</button>
            <button className="rounded-md border border-brand/40 bg-brand/5 px-2 py-1 text-brand">1</button>
            <button className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40">2</button>
            <button className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40">3</button>
            <button className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40">Next</button>
          </div>
        </div>
      </SectionCard>
      <FlowDialog flow={flow} open={flowOpen} onOpenChange={setFlowOpen} />
    </div>
  );
}