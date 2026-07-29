import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Pill } from "@/components/buildpos/sections";
import type { Severity } from "@/lib/buildpos/format";
import { CurrencyText } from "@/lib/buildpos/currency";

export type BulkActionRow = { id: number; primary: string; secondary?: string; status?: string; statusTone?: Severity };

export type BulkActionConfig = {
  title: string;
  description?: string;
  /** "multi" (checkboxes, apply to every selected row) or "single" (pick exactly one). Default "multi". */
  mode?: "multi" | "single";
  confirmLabel: string;
  destructive?: boolean;
  rows: BulkActionRow[];
  /** An extra choice applied to every selected row alongside its id, e.g. "reassign to which branch". */
  extraField?: { label: string; options: { value: string; label: string }[] };
  run: (id: number, extraValue?: string) => Promise<unknown>;
  emptyMessage?: string;
};

export function BulkActionSheet({ config, onOpenChange }: { config: BulkActionConfig | null; onOpenChange: (open: boolean) => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [extraValue, setExtraValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mode = config?.mode ?? "multi";

  // The same component instance is reused across actions and module routes — reset the selection
  // whenever the sheet closes or shows a different action, or rows the user never chose stay
  // pre-ticked (e.g. after Cancel, or a failed run followed by a different bulk action).
  const configKey = config ? `${config.title}|${config.confirmLabel}` : null;
  const [lastConfigKey, setLastConfigKey] = useState(configKey);
  if (configKey !== lastConfigKey) {
    setLastConfigKey(configKey);
    setSelected(new Set());
    setExtraValue("");
  }

  function toggle(id: number) {
    if (mode === "single") { setSelected(new Set([id])); return; }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!config) return;
    setSelected((prev) => (prev.size === config.rows.length ? new Set() : new Set(config.rows.map((r) => r.id))));
  }

  async function handleConfirm() {
    if (!config || selected.size === 0) return;
    if (config.extraField && !extraValue) { toast.error(`${config.extraField.label} is required.`); return; }
    setSubmitting(true);
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => config.run(id, extraValue || undefined)));
    setSubmitting(false);
    const failed = results.filter((r) => r.status === "rejected");
    const okCount = results.length - failed.length;
    if (okCount > 0) toast.success(`${config.confirmLabel}: ${okCount} of ${results.length} succeeded.`);
    if (failed.length > 0) {
      const firstErr = failed[0] as PromiseRejectedResult;
      toast.error(`${failed.length} failed — ${firstErr.reason instanceof Error ? firstErr.reason.message : "action failed"}.`);
    }
    if (failed.length === 0) {
      setSelected(new Set());
      setExtraValue("");
      onOpenChange(false);
    }
  }

  return (
    <Sheet open={!!config} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {config && (
          <>
            <SheetHeader>
              <SheetTitle>{config.title}</SheetTitle>
              {config.description && <SheetDescription>{config.description}</SheetDescription>}
            </SheetHeader>
            <div className="mt-4 space-y-3">
              {mode === "multi" && config.rows.length > 0 && (
                <button
                  onClick={toggleAll}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  {selected.size === config.rows.length ? "Clear all" : `Select all (${config.rows.length})`}
                </button>
              )}
              <div className="max-h-[50vh] space-y-1.5 overflow-y-auto rounded-lg border border-black/5">
                {config.rows.length === 0 && (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    {config.emptyMessage ?? "No eligible records right now."}
                  </p>
                )}
                {config.rows.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-black/5 px-3 py-2.5 last:border-0 hover:bg-canvas"
                  >
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground"><CurrencyText value={r.primary} /></p>
                      {r.secondary && <p className="truncate text-xs text-muted-foreground"><CurrencyText value={r.secondary} /></p>}
                    </div>
                    {r.status && <Pill tone={r.statusTone ?? "muted"}>{r.status}</Pill>}
                  </label>
                ))}
              </div>
              {config.extraField && (
                <select
                  value={extraValue}
                  onChange={(e) => setExtraValue(e.target.value)}
                  className="h-9 w-full rounded-md border border-black/10 bg-white px-2.5 text-sm outline-none focus:border-brand/40"
                >
                  <option value="">{config.extraField.label}…</option>
                  {config.extraField.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </div>
            <SheetFooter className="mt-6 gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                size="sm"
                variant={config.destructive ? "destructive" : "default"}
                disabled={selected.size === 0 || submitting}
                onClick={handleConfirm}
              >
                {submitting ? "Working…" : `${config.confirmLabel}${selected.size > 0 ? ` (${selected.size})` : ""}`}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
