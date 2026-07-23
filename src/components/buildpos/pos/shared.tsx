import { Fragment, useEffect, useState } from "react";
import { Filter, MoreHorizontal, Search } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Severity } from "@/lib/buildpos/format";

export function statusTone(status: string): Severity {
  const k = status.toLowerCase();
  if (/critical|failed|overdue|rejected|expired|offline|breach|voided|needsreview|needs review/.test(k)) return "critical";
  if (/warn|pending|queued|idle|needs|quarantine|delayed|degraded|draft|low|expiring|monitor|partial|awaiting/.test(k)) return "warning";
  if (/active|healthy|cleared|completed|reconciled|received|resolved|delivered|submitted|valid|ok|compliant|paid|accepted|approved|closed/.test(k)) return "success";
  if (/dispatched|posted|open|in transit|in progress|assigned|sent|converted/.test(k)) return "info";
  return "muted";
}

export type RowAction = { label: string; onClick: () => void; destructive?: boolean; disabled?: boolean } | "separator";

// Shared three-dot row-actions menu — every POS list page renders the same "trigger + contextual
// item list" shape, so this is the one place that wires the previously-unused DropdownMenu primitive.
export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {actions.map((a, i) =>
          a === "separator" ? (
            <DropdownMenuSeparator key={`sep-${i}`} />
          ) : (
            <Fragment key={a.label}>
              <DropdownMenuItem
                disabled={a.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  a.onClick();
                }}
                className={a.destructive ? "text-critical focus:text-critical" : ""}
              >
                {a.label}
              </DropdownMenuItem>
            </Fragment>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Filter bar — a staged "edit filters, then Apply" toolbar (matches the original
// design's chip row) backed by real fields instead of decorative buttons.
// ---------------------------------------------------------------------------

export type FilterFieldDef =
  | { kind: "search"; key: string; placeholder: string }
  | { kind: "date"; key: string; placeholder: string }
  | { kind: "select"; key: string; placeholder: string; options: string[]; labels?: Record<string, string> };

const ALL_VALUE = "__all__";

export function emptyFilterDraft(fields: FilterFieldDef[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

export function FilterBar({
  fields, draft, onDraftChange, onApply, onReset, resultLabel,
}: {
  fields: FilterFieldDef[];
  draft: Record<string, string>;
  onDraftChange: (key: string, value: string) => void;
  onApply: () => void;
  onReset: () => void;
  resultLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
      <Filter className="ml-1 h-4 w-4 flex-none text-muted-foreground" />
      {fields.map((f) => {
        if (f.kind === "search") {
          return (
            <div key={f.key} className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-52 pl-8"
                placeholder={f.placeholder}
                value={draft[f.key] ?? ""}
                onChange={(e) => onDraftChange(f.key, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onApply()}
              />
            </div>
          );
        }
        if (f.kind === "date") {
          return (
            <Input
              key={f.key}
              type="date"
              title={f.placeholder}
              className="h-8 w-36"
              value={draft[f.key] ?? ""}
              onChange={(e) => onDraftChange(f.key, e.target.value)}
            />
          );
        }
        return (
          <Select key={f.key} value={draft[f.key] || ALL_VALUE} onValueChange={(v) => onDraftChange(f.key, v === ALL_VALUE ? "" : v)}>
            <SelectTrigger className="h-8 w-36"><SelectValue placeholder={f.placeholder} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>{f.placeholder}</SelectItem>
              {f.options.map((o) => <SelectItem key={o} value={o}>{f.labels?.[o] ?? o}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      })}
      <Button size="sm" variant="ghost" className="h-8" onClick={onReset}>Reset</Button>
      <Button size="sm" className="h-8 bg-brand text-brand-foreground hover:bg-brand/90" onClick={onApply}>Apply</Button>
      <span className="ml-auto text-xs text-muted-foreground">{resultLabel}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client-side pagination — the table itself decides page size; this just slices
// and renders the Prev/1 2 3/Next footer against whatever rows it's handed.
// ---------------------------------------------------------------------------

export function usePagination<T>(rows: T[], pageSize: number, resetKey: string) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = rows.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);
  return { page: clampedPage, setPage, totalPages, pageRows, totalCount: rows.length };
}

export function PaginationBar({
  page, totalPages, totalCount, pageSize, onChange,
}: {
  page: number; totalPages: number; totalCount: number; pageSize: number; onChange: (p: number) => void;
}) {
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  const windowStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => windowStart + i).filter((p) => p >= 1 && p <= totalPages);

  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <span>Showing {start}–{end} of {totalCount}</span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Prev
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`rounded-md border px-2 py-1 ${p === page ? "border-brand/40 bg-brand/5 text-brand" : "border-black/10 hover:border-brand/40"}`}
          >
            {p}
          </button>
        ))}
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded-md border border-black/10 px-2 py-1 hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV export — a real client-side download of whatever rows are currently
// visible (post-filter), not a decorative button.
// ---------------------------------------------------------------------------

export function exportToCsv(filename: string, columns: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [columns.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
