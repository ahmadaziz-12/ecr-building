import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Ban, CheckCheck, ClipboardCheck, Download, EyeOff, Loader2, Plus, ScanLine, Send, Wand2,
} from "lucide-react";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MultiSelectFilter, DateRangeFilter, resolveDateRangeBounds, type DateRangeValue } from "@/components/buildpos/FilterControls";
import { exportToCsv } from "@/components/buildpos/pos/shared";
import type { Severity } from "@/lib/buildpos/format";
import { useWarehouses } from "@/lib/api/inventory";
import { useCategories } from "@/lib/api/catalog";
import {
  useAutoFillStockCount, useCancelStockCount, useGenerateStockCount, usePostStockCount,
  useSaveStockCountLines, useScanStockCount, useStockCount, useStockCounts, useSubmitStockCount,
  type StockCountDto, type StockCountLineDto, type StockCountScope,
} from "@/lib/api/stock-counts";

// Automatic Stock Count. A session is generated from live stock for a chosen scope — nobody types
// a count sheet — then counted by keyboard or barcode, submitted for review, and posted. Posting
// writes one StockAdjustment plus the matching StockMovements, so a stocktake reconciles through
// exactly the same ledger as any other stock correction.

const money = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const int = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const SCOPES: { value: StockCountScope; label: string; desc: string }[] = [
  { value: "FullWarehouse", label: "Full Warehouse", desc: "Every stocked SKU in the warehouse." },
  { value: "Category", label: "By Category", desc: "One category — the usual rolling cycle count." },
  { value: "LowStock", label: "Low Stock Only", desc: "Just what's already at or under reorder level." },
  { value: "HighValue", label: "High Value", desc: "The highest-value stock lines first." },
  { value: "FastMoving", label: "Fast Moving", desc: "Best sellers of the last 30 days." },
];

function statusTone(status: string): Severity {
  switch (status) {
    case "Completed": return "success";
    case "Cancelled": return "muted";
    case "PendingApproval": return "warning";
    case "InProgress": return "info";
    default: return "warning";
  }
}

function lineTone(status: StockCountLineDto["status"]): Severity {
  switch (status) {
    case "Matched": return "success";
    case "Shortage": return "critical";
    case "Overage": return "info";
    default: return "muted";
  }
}

export function StockCountConsole() {
  const [openId, setOpenId] = useState<number | null>(null);
  return openId === null
    ? <StockCountList onOpen={setOpenId} />
    : <StockCountSheet id={openId} onBack={() => setOpenId(null)} />;
}

// ————————————————————————— Session list —————————————————————————

function StockCountList({ onOpen }: { onOpen: (id: number) => void }) {
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [range, setRange] = useState<DateRangeValue>({ preset: "" });
  const [search, setSearch] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);

  const { data: warehouses } = useWarehouses();
  const { data: counts, isLoading } = useStockCounts();

  const filtered = useMemo(() => {
    const bounds = resolveDateRangeBounds(range);
    const needle = search.trim().toLowerCase();
    return (counts ?? []).filter((c) => {
      if (warehouseIds.length > 0 && !warehouseIds.includes(String(c.warehouseId))) return false;
      if (statuses.length > 0 && !statuses.includes(c.status)) return false;
      if (bounds) {
        const ms = Date.parse(c.scheduledFor);
        if (!Number.isNaN(ms) && (ms < bounds.from.getTime() || ms > bounds.to.getTime())) return false;
      }
      if (needle && ![c.countNo, c.warehouseName, c.branchName, c.scope, c.countedByName ?? ""].some((v) => v.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [counts, warehouseIds, statuses, range, search]);

  const open = filtered.filter((c) => c.status === "InProgress" || c.status === "Draft");
  const pending = filtered.filter((c) => c.status === "PendingApproval");
  const completed = filtered.filter((c) => c.status === "Completed");
  const anyFilter = warehouseIds.length > 0 || statuses.length > 0 || !!range.preset || !!search.trim();

  return (
    <div className="space-y-4">
      <PageHeader
        group="Stock"
        title="Stock Count"
        desc="Automatic stocktakes: generate a count sheet from live stock, count it by keyboard or scanner, and post the variance straight into the stock ledger."
        primary="New Stock Count"
        onPrimary={() => setGenerateOpen(true)}
      />

      <KpiGrid
        items={[
          { label: "Open Counts", value: int(open.length), sub: "Being counted now", tone: "info" },
          { label: "Awaiting Approval", value: int(pending.length), sub: "Counted, not yet posted", tone: "warning" },
          { label: "Posted", value: int(completed.length), sub: "Variance applied to stock", tone: "success" },
          {
            label: "Shrinkage Exposure",
            value: money(completed.reduce((s, c) => s + c.absVarianceValue, 0)),
            sub: "Absolute variance, posted counts",
            tone: "critical",
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
        <ClipboardCheck className="ms-1 h-4 w-4 flex-none text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search counts…"
          className="h-8 w-44 rounded-md border border-black/10 bg-canvas px-2.5 text-xs outline-none focus:border-brand/40"
        />
        <MultiSelectFilter
          label="Warehouse"
          allLabel="All Warehouses"
          options={(warehouses ?? []).map((w) => String(w.id))}
          labels={Object.fromEntries((warehouses ?? []).map((w) => [String(w.id), `${w.name} · ${w.branchName}`]))}
          selected={warehouseIds}
          onChange={setWarehouseIds}
          triggerClassName="w-auto"
        />
        <MultiSelectFilter
          label="Status"
          allLabel="All Statuses"
          options={["Draft", "InProgress", "PendingApproval", "Completed", "Cancelled"]}
          selected={statuses}
          onChange={setStatuses}
          triggerClassName="w-auto"
        />
        <DateRangeFilter label="Scheduled" value={range} onChange={setRange} />
        <Button
          size="sm"
          variant="ghost"
          disabled={!anyFilter}
          onClick={() => { setWarehouseIds([]); setStatuses([]); setRange({ preset: "" }); setSearch(""); }}
          className="ms-auto h-8 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Clear
        </Button>
      </div>

      <SectionCard
        title="Stocktake Sessions"
        desc={`${filtered.length} of ${counts?.length ?? 0} counts`}
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            disabled={filtered.length === 0}
            onClick={() => {
              exportToCsv(
                "stock-counts.csv",
                ["Count #", "Scheduled", "Warehouse", "Branch", "Scope", "Lines", "Counted", "Variances", "Accuracy %", "Net Variance", "Status"],
                filtered.map((c) => [
                  c.countNo, new Date(c.scheduledFor).toLocaleDateString("en-GB"), c.warehouseName, c.branchName,
                  c.scope, c.lineCount, c.countedLines, c.varianceLines, c.accuracyPct, c.netVarianceValue, c.status,
                ]),
              );
              toast.success("Exported CSV");
            }}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Count #", "Scheduled", "Warehouse", "Branch", "Scope", "Progress", "Variances", "Accuracy", "Net Variance", "Counted By", "Status"].map((h) => (
                  <TableHead key={h} className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && [0, 1, 2].map((i) => (
                <TableRow key={i}><TableCell colSpan={11}><div className="h-4 w-full animate-pulse rounded bg-black/5" /></TableCell></TableRow>
              ))}
              {!isLoading && filtered.map((c) => (
                <TableRow key={c.id} onClick={() => onOpen(c.id)} className="cursor-pointer hover:bg-canvas">
                  <TableCell className="font-mono text-xs">{c.countNo}</TableCell>
                  <TableCell className="text-sm">{new Date(c.scheduledFor).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                  <TableCell className="text-sm">{c.warehouseName}</TableCell>
                  <TableCell className="text-sm">{c.branchName}</TableCell>
                  <TableCell className="text-sm">{c.scope === "Category" && c.categoryName ? `Category · ${c.categoryName}` : c.scope}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-black/5">
                        <div
                          className="h-1.5 rounded-full bg-brand/70"
                          style={{ width: `${c.lineCount > 0 ? Math.max(3, (c.countedLines / c.lineCount) * 100) : 3}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{c.countedLines}/{c.lineCount}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{int(c.varianceLines)}</TableCell>
                  <TableCell className="text-sm">{c.accuracyPct.toFixed(1)}%</TableCell>
                  <TableCell className={`text-sm ${c.netVarianceValue < 0 ? "text-critical" : ""}`}>{money(c.netVarianceValue)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.countedByName ?? "—"}</TableCell>
                  <TableCell><Pill tone={statusTone(c.status)}>{c.status}</Pill></TableCell>
                </TableRow>
              ))}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                    {counts?.length ? "No counts match the current filters." : "No stock counts yet — generate one to get started."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <GenerateDialog open={generateOpen} onOpenChange={setGenerateOpen} onGenerated={onOpen} />
    </div>
  );
}

// ————————————————————————— Generate dialog —————————————————————————

function GenerateDialog({
  open, onOpenChange, onGenerated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onGenerated: (id: number) => void;
}) {
  const { data: warehouses } = useWarehouses(open);
  const { data: categories } = useCategories(open);
  const generate = useGenerateStockCount();

  const [warehouseId, setWarehouseId] = useState<string>("");
  const [scope, setScope] = useState<StockCountScope>("FullWarehouse");
  const [categoryId, setCategoryId] = useState<string>("");
  const [topN, setTopN] = useState(50);
  const [notes, setNotes] = useState("");
  const [blindCount, setBlindCount] = useState(false);
  const [autoFill, setAutoFill] = useState(true);
  const [includeZeroStock, setIncludeZeroStock] = useState(false);

  useEffect(() => {
    if (open && !warehouseId && warehouses?.length) setWarehouseId(String(warehouses[0].id));
  }, [open, warehouses, warehouseId]);

  const needsCategory = scope === "Category";
  const needsTopN = scope === "HighValue" || scope === "FastMoving";
  const canSubmit = !!warehouseId && (!needsCategory || !!categoryId) && !generate.isPending;

  async function submit() {
    if (!canSubmit) return;
    try {
      const created = await generate.mutateAsync({
        warehouseId: Number(warehouseId),
        scope,
        categoryId: needsCategory ? Number(categoryId) : null,
        notes: notes || null,
        autoFillUncounted: autoFill,
        blindCount,
        includeZeroStock,
        topN: needsTopN ? topN : null,
      });
      toast.success(`${created.countNo} generated — ${created.lineCount} lines to count.`);
      onOpenChange(false);
      onGenerated(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate the count sheet.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Stock Count</DialogTitle>
          <DialogDescription>
            The count sheet is generated from live stock — pick a warehouse and a scope, and every matching SKU
            comes onto the sheet with its system quantity and cost already snapshotted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Warehouse">
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-9 w-full rounded-md border border-black/10 bg-canvas px-2.5 text-sm outline-none focus:border-brand/40"
            >
              {(warehouses ?? []).map((w) => (
                <option key={w.id} value={w.id}>{w.name} — {w.branchName}</option>
              ))}
            </select>
          </Field>

          <Field label="Scope">
            <div className="grid grid-cols-1 gap-1.5">
              {SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setScope(s.value)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    scope === s.value ? "border-brand/40 bg-brand/5" : "border-black/10 hover:border-brand/30"
                  }`}
                >
                  <span className={`block text-xs font-semibold ${scope === s.value ? "text-brand" : "text-foreground"}`}>{s.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{s.desc}</span>
                </button>
              ))}
            </div>
          </Field>

          {needsCategory && (
            <Field label="Category">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-9 w-full rounded-md border border-black/10 bg-canvas px-2.5 text-sm outline-none focus:border-brand/40"
              >
                <option value="">Select a category…</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nameEn}</option>
                ))}
              </select>
            </Field>
          )}

          {needsTopN && (
            <Field label="How many lines">
              <Input type="number" min={1} max={500} value={topN} onChange={(e) => setTopN(Math.max(1, Math.min(500, Number(e.target.value) || 50)))} className="h-9" />
            </Field>
          )}

          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — why this count is being run" className="h-9" />
          </Field>

          <div className="space-y-2 rounded-lg bg-canvas p-3">
            <Toggle
              checked={blindCount}
              onChange={setBlindCount}
              label="Blind count"
              desc="Hide the system quantity from the counter until the sheet is posted."
            />
            <Toggle
              checked={autoFill}
              onChange={setAutoFill}
              label="Auto-fill uncounted lines"
              desc="Treat anything not counted as matching the system, instead of blocking the post."
            />
            <Toggle
              checked={includeZeroStock}
              onChange={setIncludeZeroStock}
              label="Include zero-stock SKUs"
              desc="Catches stock that's physically there but shows as zero."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate Count Sheet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand,#4f46e5)]" />
      <span>
        <span className="block text-xs font-medium text-foreground">{label}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{desc}</span>
      </span>
    </label>
  );
}

// ————————————————————————— Count sheet —————————————————————————

function StockCountSheet({ id, onBack }: { id: number; onBack: () => void }) {
  const { data: count, isLoading } = useStockCount(id);
  const saveLines = useSaveStockCountLines();
  const scan = useScanStockCount();
  const autoFill = useAutoFillStockCount();
  const submit = useSubmitStockCount();
  const post = usePostStockCount();
  const cancel = useCancelStockCount();

  const [scanCode, setScanCode] = useState("");
  const [search, setSearch] = useState("");
  const [lineStatuses, setLineStatuses] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  // Local edits are kept out of the server state until blur, so typing doesn't fire a request per
  // keystroke and a slow save can't clobber what's being typed next.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const scanRef = useRef<HTMLInputElement>(null);

  const editable = count?.status === "Draft" || count?.status === "InProgress";
  const postable = count?.status === "InProgress" || count?.status === "PendingApproval";

  const categories = useMemo(
    () => Array.from(new Set((count?.lines ?? []).map((l) => l.categoryName).filter(Boolean))).sort(),
    [count?.lines],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (count?.lines ?? []).filter((l) => {
      if (lineStatuses.length > 0 && !lineStatuses.includes(l.status)) return false;
      if (categoryFilter.length > 0 && !categoryFilter.includes(l.categoryName)) return false;
      if (needle && ![l.sku, l.productName, l.barcode ?? "", l.binLocation ?? ""].some((v) => v.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [count?.lines, search, lineStatuses, categoryFilter]);

  async function commitLine(line: StockCountLineDto) {
    const raw = drafts[line.id];
    if (raw === undefined) return;
    const parsed = raw.trim() === "" ? null : Number(raw);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error("Counted quantity must be zero or more.");
      return;
    }
    if (parsed === line.countedQty) {
      setDrafts((d) => { const next = { ...d }; delete next[line.id]; return next; });
      return;
    }
    try {
      await saveLines.mutateAsync({ id, lines: [{ lineId: line.id, countedQty: parsed, note: line.note }] });
      setDrafts((d) => { const next = { ...d }; delete next[line.id]; return next; });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that count.");
    }
  }

  async function handleScan() {
    const code = scanCode.trim();
    if (!code) return;
    try {
      const updated = await scan.mutateAsync({ id, code });
      const line = updated.lines.find((l) => l.barcode === code || l.sku.toLowerCase() === code.toLowerCase());
      toast.success(line ? `${line.productName} → ${qty(line.countedQty ?? 0)}` : "Counted");
      setScanCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      scanRef.current?.focus();
    }
  }

  async function run(action: () => Promise<StockCountDto>, message: string) {
    try {
      await action();
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    }
  }

  if (isLoading || !count) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> All counts</Button>
        <SectionCard title="Loading count sheet…"><div className="h-40 animate-pulse rounded-lg bg-black/5" /></SectionCard>
      </div>
    );
  }

  const progress = count.lineCount > 0 ? (count.countedLines / count.lineCount) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={onBack} className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> All counts
          </button>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
            {count.countNo}
            <Pill tone={statusTone(count.status)}>{count.status}</Pill>
            {count.blindCount && count.status !== "Completed" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <EyeOff className="h-3 w-3" /> Blind
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {count.warehouseName} · {count.branchName} · {count.scope === "Category" && count.categoryName ? `Category: ${count.categoryName}` : count.scope}
            {count.notes ? ` · ${count.notes}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={autoFill.isPending}
              onClick={() => run(() => autoFill.mutateAsync({ id }), "Uncounted lines filled from system quantities.")}>
              <Wand2 className="h-4 w-4" /> Auto-fill Uncounted
            </Button>
          )}
          {editable && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={submit.isPending}
              onClick={() => run(() => submit.mutateAsync({ id }), "Submitted for approval.")}>
              <Send className="h-4 w-4" /> Submit for Approval
            </Button>
          )}
          {postable && (
            <Button size="sm" className="h-9 gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90" disabled={post.isPending}
              onClick={() => {
                if (!window.confirm(`Post ${count.countNo}? This sets stock to the counted quantities and can't be undone.`)) return;
                void run(() => post.mutateAsync({ id }), "Variance posted — stock updated.");
              }}>
              {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />} Post Variance
            </Button>
          )}
          {count.status !== "Completed" && count.status !== "Cancelled" && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5 border-critical/30 text-critical hover:bg-critical/5"
              onClick={() => {
                if (!window.confirm(`Cancel ${count.countNo}? The counts entered so far are kept but nothing is posted.`)) return;
                void run(() => cancel.mutateAsync({ id }), "Count cancelled.");
              }}>
              <Ban className="h-4 w-4" /> Cancel
            </Button>
          )}
        </div>
      </div>

      <KpiGrid
        items={[
          { label: "Progress", value: `${count.countedLines} / ${count.lineCount}`, sub: `${progress.toFixed(0)}% counted`, tone: progress >= 100 ? "success" : "info" },
          { label: "Variance Lines", value: int(count.varianceLines), sub: "SKUs that don't match", tone: count.varianceLines > 0 ? "warning" : "success" },
          { label: "Accuracy", value: `${count.accuracyPct.toFixed(1)}%`, sub: "Counted lines matching", tone: count.accuracyPct >= 98 ? "success" : count.accuracyPct >= 90 ? "warning" : "critical" },
          { label: "Net Variance", value: money(count.netVarianceValue), sub: `Absolute ${money(count.absVarianceValue)}`, tone: count.netVarianceValue < 0 ? "critical" : "info" },
        ]}
      />

      {editable && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/20 bg-brand/[0.03] p-2.5">
          <ScanLine className="ms-1 h-4 w-4 flex-none text-brand" />
          <Input
            ref={scanRef}
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleScan(); } }}
            placeholder="Scan a barcode or type a SKU, then press Enter…"
            className="h-9 max-w-md flex-1 text-sm"
            autoFocus
          />
          <Button size="sm" className="h-9 gap-1.5" onClick={() => void handleScan()} disabled={scan.isPending || !scanCode.trim()}>
            {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Count 1
          </Button>
          <span className="text-xs text-muted-foreground">Each scan adds one to that line's counted quantity.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SKU, product, bin…"
          className="h-8 w-48 rounded-md border border-black/10 bg-canvas px-2.5 text-xs outline-none focus:border-brand/40"
        />
        <MultiSelectFilter
          label="Result" allLabel="All Results"
          options={["Uncounted", "Matched", "Shortage", "Overage"]}
          selected={lineStatuses} onChange={setLineStatuses} triggerClassName="w-auto"
        />
        <MultiSelectFilter
          label="Category" allLabel="All Categories"
          options={categories} selected={categoryFilter} onChange={setCategoryFilter} triggerClassName="w-auto"
        />
        <Button
          size="sm" variant="ghost"
          disabled={!search && lineStatuses.length === 0 && categoryFilter.length === 0}
          onClick={() => { setSearch(""); setLineStatuses([]); setCategoryFilter([]); }}
          className="ms-auto h-8 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Clear
        </Button>
      </div>

      <SectionCard
        title="Count Sheet"
        desc={`${filtered.length} of ${count.lineCount} lines`}
        action={
          <Button
            variant="ghost" size="sm" className="h-8 gap-1.5"
            onClick={() => {
              exportToCsv(
                `${count.countNo}.csv`,
                ["SKU", "Product", "Category", "UOM", "Bin", "System Qty", "Counted Qty", "Variance", "Variance Value", "Result", "Note"],
                filtered.map((l) => [
                  l.sku, l.productName, l.categoryName, l.uom, l.binLocation ?? "",
                  l.systemQty ?? "", l.countedQty ?? "", l.variance ?? "", l.varianceValue ?? "", l.status, l.note ?? "",
                ]),
              );
              toast.success("Exported count sheet");
            }}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["SKU", "Product", "Category", "Bin", "UOM"].map((h) => (
                  <TableHead key={h} className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</TableHead>
                ))}
                <TableHead className="whitespace-nowrap text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">System</TableHead>
                <TableHead className="whitespace-nowrap text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Counted</TableHead>
                <TableHead className="whitespace-nowrap text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Variance</TableHead>
                <TableHead className="whitespace-nowrap text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Value</TableHead>
                <TableHead className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => {
                const draft = drafts[l.id];
                const shown = draft !== undefined ? draft : l.countedQty === null ? "" : String(l.countedQty);
                return (
                  <TableRow key={l.id} className="hover:bg-canvas">
                    <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                    <TableCell className="text-sm font-medium">{l.productName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.categoryName || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.binLocation || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.uom}</TableCell>
                    <TableCell className="text-right text-sm">
                      {l.systemQty === null
                        ? <span className="text-muted-foreground/60">hidden</span>
                        : qty(l.systemQty)}
                    </TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={shown}
                          onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                          onBlur={() => void commitLine(l)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          placeholder="—"
                          className="h-8 w-24 text-right text-sm"
                        />
                      ) : (
                        <span className="text-sm">{l.countedQty === null ? "—" : qty(l.countedQty)}</span>
                      )}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-medium ${(l.variance ?? 0) < 0 ? "text-critical" : (l.variance ?? 0) > 0 ? "text-info" : "text-muted-foreground"}`}>
                      {l.variance === null ? "—" : `${l.variance > 0 ? "+" : ""}${qty(l.variance)}`}
                    </TableCell>
                    <TableCell className={`text-right text-sm ${(l.varianceValue ?? 0) < 0 ? "text-critical" : "text-muted-foreground"}`}>
                      {l.varianceValue === null ? "—" : money(l.varianceValue)}
                    </TableCell>
                    <TableCell><Pill tone={lineTone(l.status)}>{l.status}</Pill></TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                    No lines match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {count.status === "Completed" && (
        <SectionCard title="Posted" desc={`Approved by ${count.approvedByName ?? "—"} on ${count.completedAt ? new Date(count.completedAt).toLocaleString("en-GB") : "—"}`}>
          <p className="px-1 text-sm leading-relaxed text-muted-foreground">
            This count set both the warehouse and branch stock pools to the counted quantities and wrote stock
            adjustment #{count.stockAdjustmentId ?? "—"}, plus one stock movement per non-zero variance. The same
            figures appear in the Stock Count Report and the Stock Movements ledger.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
