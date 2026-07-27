import { useMemo, useState } from "react";
import { ChevronDown, Search as SearchIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// Shared multi-select filter control: search box, checkbox list, per-filter Clear, and a closed
// trigger that reads "All {label}" when nothing is picked instead of the bare column/group name —
// used by the Dashboard global filter bar, the POS list pages' shared FilterBar, and ModulePage's
// generic column filters, so every filter in the app gets the same search/multi-select/clear UX.
export function MultiSelectFilter({
  label,
  allLabel,
  options,
  selected,
  onChange,
  labels,
  className,
  triggerClassName,
}: {
  label: string;
  allLabel: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Optional value -> display label map, for filters whose option values are ids/codes rather
   *  than human-readable text (e.g. a Branch filter keyed by branchId). */
  labels?: Record<string, string>;
  className?: string;
  triggerClassName?: string;
}) {
  const [query, setQuery] = useState("");
  const display = (o: string) => labels?.[o] ?? o;
  const filteredOptions = useMemo(
    () => (query.trim() ? options.filter((o) => display(o).toLowerCase().includes(query.trim().toLowerCase())) : options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, query, labels],
  );

  function toggle(o: string) {
    onChange(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]);
  }

  const allFilteredSelected = filteredOptions.length > 0 && filteredOptions.every((o) => selected.includes(o));
  const someFilteredSelected = filteredOptions.some((o) => selected.includes(o));

  function toggleAll() {
    onChange(
      allFilteredSelected
        ? selected.filter((s) => !filteredOptions.includes(s))
        : [...new Set([...selected, ...filteredOptions])],
    );
  }

  const triggerLabel =
    selected.length === 0 ? allLabel : selected.length === 1 ? display(selected[0]) : `${selected.length} selected`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 min-w-[120px] max-w-[220px] justify-between gap-1.5 border-black/10 bg-white text-xs font-medium hover:border-brand/40",
            selected.length > 0 && "border-brand/40 bg-brand/5 text-brand",
            triggerClassName,
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 flex-none opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-64 p-2", className)} align="start">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-medium text-brand hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        {options.length > 6 && (
          <div className="relative mb-2">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="h-8 w-full rounded-md border border-black/10 bg-canvas pl-8 pr-2 text-xs outline-none focus:border-brand/40"
            />
          </div>
        )}
        {filteredOptions.length > 0 && (
          <label className="mb-0.5 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-canvas">
            <Checkbox
              checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
              onCheckedChange={toggleAll}
            />
            <span>Select All{query.trim() ? " (matching)" : ""}</span>
          </label>
        )}
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {filteredOptions.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches.</p>
          )}
          {filteredOptions.map((o) => {
            const checked = selected.includes(o);
            return (
              <label
                key={o}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-canvas"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(o)} />
                <span className="truncate">{display(o)}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type DateRangeValue = { preset: string; from?: string; to?: string };

const DATE_PRESETS = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month"];

// Resolves a DateRangeValue into actual comparable bounds — shared by every page that wires this
// filter into real row/order filtering, so the preset math (what "Last 7 Days" actually means)
// lives in exactly one place.
export function resolveDateRangeBounds(value: DateRangeValue | undefined): { from: Date; to: Date } | null {
  if (!value?.preset) return null;
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  switch (value.preset) {
    case "Today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "Yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "Last 7 Days": {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case "Last 30 Days": {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case "This Month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case "Last Month":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case "Custom Range":
      if (!value.from || !value.to) return null;
      return { from: startOfDay(new Date(value.from)), to: endOfDay(new Date(value.to)) };
    default:
      return null;
  }
}

export function DateRangeFilter({
  label = "Date Range",
  value,
  onChange,
  triggerClassName,
}: {
  label?: string;
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  triggerClassName?: string;
}) {
  const triggerLabel = !value.preset
    ? "All Time"
    : value.preset === "Custom Range"
      ? value.from && value.to
        ? `${value.from} – ${value.to}`
        : "Custom Range"
      : value.preset;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 min-w-[130px] justify-between gap-1.5 border-black/10 bg-white text-xs font-medium hover:border-brand/40",
            value.preset && "border-brand/40 bg-brand/5 text-brand",
            triggerClassName,
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 flex-none opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          {value.preset && (
            <button
              type="button"
              onClick={() => onChange({ preset: "" })}
              className="text-xs font-medium text-brand hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        <div className="mb-3 grid grid-cols-2 gap-1">
          {DATE_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange({ preset: p })}
              className={`rounded-md border px-2 py-1.5 text-left text-xs font-medium transition ${
                value.preset === p
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-black/10 text-foreground hover:border-brand/40"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="border-t border-black/5 pt-2">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Custom range</p>
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={
              value.preset === "Custom Range" && value.from
                ? { from: new Date(value.from), to: value.to ? new Date(value.to) : undefined }
                : undefined
            }
            onSelect={(range) => {
              if (!range?.from) return;
              onChange({
                preset: "Custom Range",
                from: range.from.toISOString().slice(0, 10),
                to: (range.to ?? range.from).toISOString().slice(0, 10),
              });
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
