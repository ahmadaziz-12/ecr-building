import { Download, Plus, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function PageHeader({
  group,
  title,
  desc,
  actions,
  primary,
  onPrimary,
  onRefresh,
  onExport,
}: {
  group: string;
  title: string;
  desc: string;
  actions?: ReactNode;
  primary?: string;
  onPrimary?: () => void;
  onRefresh?: () => void;
  onExport?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">{group}</p>
        <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{desc}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {onRefresh && (
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-9 gap-1.5 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        )}
        {onExport && (
          <Button variant="ghost" size="sm" onClick={onExport} className="h-9 gap-1.5 text-muted-foreground hover:text-foreground">
            <Download className="h-4 w-4" /> Export
          </Button>
        )}
        {primary && onPrimary && (
          <Button size="sm" onClick={onPrimary} className="h-9 gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
            <Plus className="h-4 w-4" /> {primary}
          </Button>
        )}
      </div>
    </div>
  );
}

export function KpiGrid({ items }: { items: { label: string; value: string | number; sub?: string; tone?: "critical" | "warning" | "success" | "info" | "muted" }[] }) {
  const t: Record<string, string> = {
    critical: "bg-critical/10 text-critical border-critical/20",
    warning: "bg-warning/15 text-[oklch(0.4_0.13_70)] border-warning/30",
    success: "bg-success/10 text-[oklch(0.35_0.1_155)] border-success/30",
    info: "bg-info/10 text-[oklch(0.35_0.12_235)] border-info/30",
    muted: "bg-black/5 text-foreground/70 border-black/10",
  };
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">{k.value}</p>
          {k.sub && (
            <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${t[k.tone ?? "info"]}`}>
              {k.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}