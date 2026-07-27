import { CalendarRange, Filter, X } from "lucide-react";
import { MultiSelectFilter, DateRangeFilter, resolveDateRangeBounds, type DateRangeValue } from "@/components/buildpos/FilterControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FilterOption, ReportFilterOptionsDto, ReportQuery } from "@/lib/api/reports";

// The one filter bar every report in the console uses. It renders the shared MultiSelectFilter
// (searchable, multi-select, per-filter Clear) and DateRangeFilter (presets + custom range) from
// FilterControls.tsx — the same controls the rest of the app already uses — instead of the
// bespoke date inputs the reports console used to hand-roll, so filters behave identically
// everywhere and every report gains search/multi-select/clear for free.

/** A filter chip: which query param it drives, its label, and where its options come from. */
export type ReportFilterSpec = {
  key: string;
  label: string;
  /** Plural noun for the "All …" placeholder; defaults to the label. */
  allLabel?: string;
  options: (o: ReportFilterOptionsDto) => FilterOption[];
};

/** A non-list knob (Top N, "no sales in N days", group-by) a specific report needs. */
export type ReportKnobSpec = {
  key: string;
  label: string;
  kind: "number" | "choice" | "toggle";
  choices?: { value: string; label: string }[];
  min?: number;
  max?: number;
};

export type ReportFilterState = {
  range: DateRangeValue;
  /** filter key -> selected option ids */
  selections: Record<string, string[]>;
  knobs: Record<string, string | number | boolean>;
  search: string;
};

export const EMPTY_FILTER_STATE: ReportFilterState = { range: { preset: "This Month" }, selections: {}, knobs: {}, search: "" };

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Turns filter-bar state into the query the API client serialises. Dates go out as plain calendar
 * days — the backend owns the inclusive/exclusive boundary (ReportFilters.Range), which is what
 * makes "to = today" actually include today.
 */
export function toReportQuery(state: ReportFilterState, dated: boolean): ReportQuery {
  const query: ReportQuery = {};
  if (dated) {
    const bounds = resolveDateRangeBounds(state.range);
    if (bounds) {
      query.from = iso(bounds.from);
      query.to = iso(bounds.to);
    }
  }
  for (const [key, values] of Object.entries(state.selections)) {
    if (values.length > 0) query[key] = values;
  }
  for (const [key, value] of Object.entries(state.knobs)) {
    if (value !== undefined && value !== "") query[key] = value;
  }
  return query;
}

export function activeFilterCount(state: ReportFilterState, dated: boolean): number {
  return (dated && state.range.preset ? 1 : 0)
    + Object.values(state.selections).filter((v) => v.length > 0).length
    + (state.search.trim() ? 1 : 0);
}

export function ReportFilterBar({
  dated,
  filters,
  knobs,
  options,
  state,
  onChange,
  onClear,
}: {
  dated: boolean;
  filters: ReportFilterSpec[];
  knobs?: ReportKnobSpec[];
  options: ReportFilterOptionsDto | undefined;
  state: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
  onClear: () => void;
}) {
  const active = activeFilterCount(state, dated);

  function setSelection(key: string, values: string[]) {
    onChange({ ...state, selections: { ...state.selections, [key]: values } });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
      <Filter className="ms-1 h-4 w-4 flex-none text-muted-foreground" />

      <input
        value={state.search}
        onChange={(e) => onChange({ ...state, search: e.target.value })}
        placeholder="Search rows…"
        className="h-8 w-44 rounded-md border border-black/10 bg-canvas px-2.5 text-xs outline-none focus:border-brand/40"
      />

      {dated && (
        <div className="flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5 flex-none text-muted-foreground" />
          <DateRangeFilter
            label="Report Period"
            value={state.range}
            onChange={(range) => onChange({ ...state, range })}
          />
        </div>
      )}

      {filters.map((f) => {
        // Until the option lists have loaded there is nothing honest to show in a picker, so the
        // chip renders disabled rather than as an empty dropdown that looks like "no matches".
        const opts = options ? f.options(options) : [];
        const labels = Object.fromEntries(opts.map((o) => [o.id, o.sub ? `${o.label} · ${o.sub}` : o.label]));
        return (
          <MultiSelectFilter
            key={f.key}
            label={f.label}
            allLabel={`All ${f.allLabel ?? f.label}`}
            options={opts.map((o) => o.id)}
            labels={labels}
            selected={state.selections[f.key] ?? []}
            onChange={(next) => setSelection(f.key, next)}
            triggerClassName="w-auto"
          />
        );
      })}

      {knobs?.map((k) => {
        const value = state.knobs[k.key];
        if (k.kind === "number") {
          return (
            <div key={k.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{k.label}</span>
              <Input
                type="number"
                min={k.min}
                max={k.max}
                value={String(value ?? "")}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange({
                    ...state,
                    knobs: { ...state.knobs, [k.key]: Number.isFinite(n) ? Math.min(k.max ?? n, Math.max(k.min ?? n, n)) : "" },
                  });
                }}
                className="h-8 w-20 text-xs"
              />
            </div>
          );
        }
        if (k.kind === "toggle") {
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => onChange({ ...state, knobs: { ...state.knobs, [k.key]: !value } })}
              className={`h-8 rounded-md border px-2.5 text-xs font-medium transition ${
                value ? "border-brand/40 bg-brand/5 text-brand" : "border-black/10 bg-white text-foreground/80 hover:border-brand/40"
              }`}
            >
              {k.label}
            </button>
          );
        }
        return (
          <div key={k.key} className="flex items-center gap-1.5">
            {k.choices?.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => onChange({ ...state, knobs: { ...state.knobs, [k.key]: c.value } })}
                className={`h-8 rounded-md border px-2.5 text-xs font-medium transition ${
                  String(value ?? k.choices?.[0]?.value) === c.value
                    ? "border-brand/40 bg-brand/5 text-brand"
                    : "border-black/10 bg-white text-foreground/80 hover:border-brand/40"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        );
      })}

      <Button
        size="sm"
        variant="ghost"
        onClick={onClear}
        disabled={active === 0}
        className="ms-auto h-8 gap-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <X className="h-3.5 w-3.5" /> Clear{active > 0 ? ` (${active})` : ""}
      </Button>
    </div>
  );
}
