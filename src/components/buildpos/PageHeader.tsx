import { Download, Plus, RefreshCw } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CardCustomizer } from "@/components/buildpos/CardCustomizer";
import { applyCardPreference, useCardPreferences } from "@/lib/buildpos/card-preferences";
import { CurrencyText } from "@/lib/buildpos/currency";

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

export type KpiItem = {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "critical" | "warning" | "success" | "info" | "muted";
  /** Supply this to make the card a real control — clicking it filters the list below. Cards
   *  without one stay plain readouts rather than pretending to be actionable. */
  onSelect?: () => void;
  /** True while this card's filter is the one being applied. */
  active?: boolean;
};

/**
 * The shared summary-card row.
 *
 * Pass `scope` (a stable id for this page's row, e.g. "orders") to give the user a "Customise
 * cards" control: which cards appear, and in what order, remembered per person. Amounts render the
 * SAR symbol via CurrencyText, so callers keep formatting money as plain strings.
 */
export function KpiGrid({ items, scope }: { items: KpiItem[]; scope?: string }) {
  const t: Record<string, string> = {
    critical: "bg-critical/10 text-critical border-critical/20",
    warning: "bg-warning/15 text-[oklch(0.4_0.13_70)] border-warning/30",
    success: "bg-success/10 text-[oklch(0.35_0.1_155)] border-success/30",
    info: "bg-info/10 text-[oklch(0.35_0.12_235)] border-info/30",
    muted: "bg-black/5 text-foreground/70 border-black/10",
  };
  const labels = useMemo(() => items.map((k) => k.label), [items]);
  const prefs = useCardPreferences(scope ? `kpis.${scope}` : null, labels);
  const visible = scope
    ? applyCardPreference(items, (k) => k.label, prefs.order, prefs.hidden)
    : items;

  return (
    <div className="space-y-2">
      {scope && (
        <div className="flex justify-end">
          <CardCustomizer
            labels={Object.fromEntries(items.map((k) => [k.label, k.label]))}
            prefs={prefs}
          />
        </div>
      )}
      <div className="grid grid-cols-2 items-stretch gap-3 md:grid-cols-4">
        {visible.map((k) => {
          const body = (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</p>
              <p className="mt-1 break-words font-display text-xl font-bold text-foreground">
                <CurrencyText value={String(k.value)} />
              </p>
              {k.sub && (
                <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${t[k.tone ?? "info"]}`}>
                  <CurrencyText value={k.sub} />
                </span>
              )}
              {k.onSelect && (
                <span className="mt-2 block text-[10px] font-medium text-brand">
                  {k.active ? "Filtering · click to clear" : "Click to filter"}
                </span>
              )}
            </>
          );
          if (!k.onSelect) {
            return (
              <div key={k.label} className="h-full rounded-2xl border border-black/5 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
                {body}
              </div>
            );
          }
          return (
            <button
              key={k.label}
              type="button"
              aria-pressed={k.active ?? false}
              onClick={k.onSelect}
              className={`h-full rounded-2xl border p-3.5 text-left shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md ${
                k.active ? "border-brand bg-brand/5 ring-1 ring-brand/30" : "border-black/5 bg-white"
              }`}
            >
              {body}
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed border-black/10 bg-white py-6 text-center text-sm text-muted-foreground">
            Every card is hidden. Use "Customise cards" to bring some back.
          </p>
        )}
      </div>
    </div>
  );
}