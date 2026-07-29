import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RowActionsMenu,
  statusTone,
  FilterBar,
  emptyFilterDraft,
  usePagination,
  PaginationBar,
  exportToCsv,
  type FilterFieldDef,
  type FilterDraftValue,
} from "@/components/buildpos/pos/shared";
import { FlowDialog } from "@/components/buildpos/FlowDialog";
import { getFlow } from "@/lib/buildpos/flows";
import { useFlowSubmitHandlers } from "@/lib/api/flow-submit-handlers";
import { useProducts } from "@/lib/api/catalog";
import {
  useStockBatches,
  useBranchStockBatches,
  useQuarantineBatch,
  useWriteOffBatch,
  usePromoBatch,
  useQuarantineBranchBatch,
  useWriteOffBranchBatch,
  usePromoBranchBatch,
  useRemnants,
  useUpdateRemnant,
  useScrapRemnant,
  type StockBatchDto,
  type RemnantDto,
} from "@/lib/api/inventory";

// Warehouse batches (backroom/bulk) and branch batches (shop-floor, post-transfer or a direct
// receipt with no linked warehouse) are two separate tables with their own id sequences and their
// own pair of action endpoints — kept as separate tabs on one page rather than merged into a single
// list, since each tab's rows, filters, and row actions are entirely self-contained (no id
// disambiguation needed, unlike an earlier merged-list approach). Remnants Management (Cut
// Optimization) joins them as a third tab for the same reason — it's a physical-stock-tracking
// concern that belongs next to batches, but its rows (offcuts, not received batches) and actions
// (edit discount / scrap) are entirely their own shape.
const TABS = ["Warehouse", "Branch", "Remnants"] as const;
type Tab = (typeof TABS)[number];
const REMNANT_STATUS_OPTIONS = ["Available", "Sold", "Scrapped"];
// statusTone's regex heuristic doesn't recognize these three — spelled out explicitly instead of
// stretching the shared matcher for one page's vocabulary.
const REMNANT_STATUS_TONE: Record<string, "success" | "info" | "critical"> = {
  Available: "success",
  Sold: "info",
  Scrapped: "critical",
};

const STATUS_OPTIONS = [
  "Healthy",
  "Monitor",
  "Expiring",
  "Critical",
  "Expired",
  "Quarantine",
  "WrittenOff",
  "On Promo",
];
const STATUS_LABELS: Record<string, string> = { WrittenOff: "Written Off" };
const PAGE_SIZE = 10;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ExpiryPage() {
  const [tab, setTab] = useState<Tab>("Warehouse");

  const {
    data: warehouseBatches,
    refetch: refetchWarehouse,
    isFetching: fetchingWarehouse,
  } = useStockBatches(true);
  const {
    data: branchBatches,
    refetch: refetchBranch,
    isFetching: fetchingBranch,
  } = useBranchStockBatches(true);
  const { data: products } = useProducts(true);
  // All statuses (not just Available, which the POS picker defaults to) — this is the admin view.
  const {
    data: remnants,
    refetch: refetchRemnants,
    isFetching: fetchingRemnants,
  } = useRemnants({ status: "All" }, tab === "Remnants");

  const quarantineBatch = useQuarantineBatch();
  const writeOffBatch = useWriteOffBatch();
  const promoBatch = usePromoBatch();
  const quarantineBranchBatch = useQuarantineBranchBatch();
  const writeOffBranchBatch = useWriteOffBranchBatch();
  const promoBranchBatch = usePromoBranchBatch();
  const updateRemnant = useUpdateRemnant();
  const scrapRemnant = useScrapRemnant();

  const skuToCategory = useMemo(
    () => new Map((products ?? []).map((p) => [p.sku, p.categoryName])),
    [products],
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set((products ?? []).map((p) => p.categoryName))).sort(),
    [products],
  );

  const isRemnants = tab === "Remnants";
  const isBranch = tab === "Branch";
  const activeRows = isBranch ? (branchBatches ?? []) : (warehouseBatches ?? []);
  const isFetchingActive = isRemnants ? fetchingRemnants : isBranch ? fetchingBranch : fetchingWarehouse;
  const refetchActive = () => (isRemnants ? refetchRemnants() : isBranch ? refetchBranch() : refetchWarehouse());

  const fields: FilterFieldDef[] = useMemo(
    () => [
      { kind: "select", key: "category", placeholder: "Category", options: categoryOptions },
      {
        kind: "select",
        key: "status",
        placeholder: "Status",
        options: isRemnants ? REMNANT_STATUS_OPTIONS : STATUS_OPTIONS,
        labels: STATUS_LABELS,
      },
      { kind: "search", key: "search", placeholder: isRemnants ? "Search SKU, product…" : "Search SKU, product, batch…" },
    ],
    [categoryOptions, isRemnants],
  );
  const [draft, setDraft] = useState<Record<string, FilterDraftValue>>(() => emptyFilterDraft(fields));
  const [applied, setApplied] = useState<Record<string, FilterDraftValue>>(draft);

  const filtered = useMemo(() => {
    const category = (applied.category as string[]) ?? [];
    const status = (applied.status as string[]) ?? [];
    const search = (applied.search as string) ?? "";
    return activeRows.filter((b) => {
      if (category.length && !category.includes(skuToCategory.get(b.sku) ?? "")) return false;
      if (status.length && !status.includes(b.status)) return false;
      if (search) {
        const t = search.trim().toLowerCase();
        if (
          t &&
          !b.sku.toLowerCase().includes(t) &&
          !b.productName.toLowerCase().includes(t) &&
          !b.batchNo.toLowerCase().includes(t)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [activeRows, applied, skuToCategory]);

  const filteredRemnants = useMemo(() => {
    const category = (applied.category as string[]) ?? [];
    const status = (applied.status as string[]) ?? [];
    const search = (applied.search as string) ?? "";
    return (remnants ?? []).filter((r) => {
      if (category.length && !category.includes(skuToCategory.get(r.sku) ?? "")) return false;
      if (status.length && !status.includes(r.status)) return false;
      if (search) {
        const t = search.trim().toLowerCase();
        if (t && !r.sku.toLowerCase().includes(t) && !r.productName.toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [remnants, applied, skuToCategory]);

  const pagination = usePagination<StockBatchDto | RemnantDto>(
    isRemnants ? filteredRemnants : filtered,
    PAGE_SIZE,
    `${JSON.stringify(applied)}|${tab}`,
  );

  const kpis = useMemo(
    () => [
      {
        label: "Batch-Tracked SKUs",
        value: activeRows.length,
        sub: `${new Set(activeRows.map((b) => b.sku)).size} distinct SKUs`,
        tone: "info" as const,
      },
      {
        label: "Expiring ≤ 30 days",
        value: activeRows.filter((b) => b.daysLeft >= 0 && b.daysLeft <= 30).length,
        sub: "Move to promo",
        tone: "warning" as const,
      },
      {
        label: "Expired / Written Off",
        value: activeRows.filter((b) => b.status === "Expired" || b.status === "WrittenOff").length,
        sub: "Write-off pending",
        tone: "critical" as const,
      },
      {
        label: "Quarantine",
        value: activeRows.filter((b) => b.status === "Quarantine").length,
        sub: "QC review",
        tone: "warning" as const,
      },
    ],
    [activeRows],
  );

  // Cut Optimization: Remnants KPIs — Available is the pool a cashier can actually sell from right
  // now; Discounted highlights offcuts a manager has marked down to help them move.
  const remnantKpis = useMemo(() => {
    const all = remnants ?? [];
    return [
      {
        label: "Available Offcuts",
        value: all.filter((r) => r.status === "Available").length,
        sub: `${new Set(all.filter((r) => r.status === "Available").map((r) => r.sku)).size} distinct SKUs`,
        tone: "success" as const,
      },
      {
        label: "Discounted",
        value: all.filter((r) => r.status === "Available" && r.discountPct > 0).length,
        sub: "Marked down to move",
        tone: "info" as const,
      },
      {
        label: "Sold",
        value: all.filter((r) => r.status === "Sold").length,
        sub: "Reused instead of wasted",
        tone: "success" as const,
      },
      {
        label: "Scrapped",
        value: all.filter((r) => r.status === "Scrapped").length,
        sub: "Waste written off",
        tone: "critical" as const,
      },
    ];
  }, [remnants]);

  async function runAction(batch: StockBatchDto, action: "quarantine" | "write-off" | "promo") {
    try {
      if (action === "quarantine") {
        await (isBranch ? quarantineBranchBatch : quarantineBatch).mutateAsync(batch.id);
        toast.success("Batch quarantined");
      } else if (action === "write-off") {
        await (isBranch ? writeOffBranchBatch : writeOffBatch).mutateAsync(batch.id);
        toast.success("Batch written off");
      } else {
        await (isBranch ? promoBranchBatch : promoBatch).mutateAsync(batch.id);
        toast.success("Batch moved to promo");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    }
  }

  const addBatchFlow = getFlow("Add Batch");
  const submitHandlers = useFlowSubmitHandlers();
  const [addingBatch, setAddingBatch] = useState(false);

  // Cut Optimization: inline discount editing — a remnant's DiscountPct is a single number a manager
  // occasionally nudges to help an offcut move, not a whole form worth a dialog.
  const [editingDiscountId, setEditingDiscountId] = useState<number | null>(null);
  const [discountDraft, setDiscountDraft] = useState("");

  async function saveDiscount(remnant: RemnantDto) {
    const value = Math.max(0, Math.min(100, Number(discountDraft) || 0));
    try {
      await updateRemnant.mutateAsync({ id: remnant.id, discountPct: value, notes: remnant.notes });
      toast.success("Discount updated");
      setEditingDiscountId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function runScrapRemnant(remnant: RemnantDto) {
    try {
      await scrapRemnant.mutateAsync(remnant.id);
      toast.success("Remnant scrapped");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    }
  }

  function handleExport() {
    if (isRemnants) {
      exportToCsv(
        "remnants.csv",
        ["SKU", "Product", "Branch", "Qty", "Uom", "Status", "Discount %", "Source Order", "Created"],
        filteredRemnants.map((r) => [
          r.sku,
          r.productName,
          r.branchName,
          r.qty,
          r.stockUom,
          r.status,
          r.discountPct,
          r.sourceOrderNo ?? "",
          fmtDate(r.createdAt),
        ]),
      );
      toast.success("Exported CSV");
      return;
    }
    exportToCsv(
      `${tab.toLowerCase()}-batches.csv`,
      ["SKU", "Product", "Batch", "Received", "Expires", "Days Left", "Qty", tab, "Status"],
      filtered.map((b) => [
        b.sku,
        b.productName,
        b.batchNo,
        fmtDate(b.receivedDate),
        fmtDate(b.expiryDate),
        b.daysLeft,
        b.qty,
        b.warehouseName,
        b.status,
      ]),
    );
    toast.success("Exported CSV");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Products & Stock"
        title={isRemnants ? "Expiry — Remnants" : "Expiry"}
        desc={
          isRemnants
            ? "Offcuts left over from cut-to-size sales — restocked as their own sellable pieces instead of vanishing back into generic stock. Sold automatically at POS; scrap here what won't move."
            : "Batch-sensitive materials: paint, adhesives, chemicals, cement additives, sealants — tracked wherever they physically sit."
        }
        primary={isRemnants ? undefined : "Add Batch"}
        onPrimary={isRemnants ? undefined : () => setAddingBatch(true)}
        onRefresh={refetchActive}
        onExport={handleExport}
      />

      <div className="flex flex-wrap gap-1 border-b border-black/5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              const empty = emptyFilterDraft(fields);
              setDraft(empty);
              setApplied(empty);
            }}
            className={`relative px-3 py-2 text-sm font-medium transition ${tab === t ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
            {tab === t && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />
            )}
          </button>
        ))}
      </div>

      <FilterBar
        fields={fields}
        draft={draft}
        onDraftChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
        onApply={() => setApplied(draft)}
        onReset={() => {
          const empty = emptyFilterDraft(fields);
          setDraft(empty);
          setApplied(empty);
        }}
        resultLabel={
          isRemnants
            ? `${filteredRemnants.length} of ${(remnants ?? []).length}${isFetchingActive ? " · refreshing…" : ""}`
            : `${filtered.length} of ${activeRows.length}${isFetchingActive ? " · refreshing…" : ""}`
        }
      />

      <KpiGrid items={isRemnants ? remnantKpis : kpis} scope="expiry" />

      {isRemnants ? (
        <SectionCard title="Remnants" desc={`${filteredRemnants.length} offcuts — sellable leftovers from cut-to-size sales`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead>Source Order</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pagination.pageRows as RemnantDto[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell>{r.productName}</TableCell>
                    <TableCell>{r.branchName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {r.qty} {r.stockUom}
                    </TableCell>
                    <TableCell>
                      <Pill tone={REMNANT_STATUS_TONE[r.status] ?? "muted"}>{r.status}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      {editingDiscountId === r.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            autoFocus
                            value={discountDraft}
                            onChange={(e) => setDiscountDraft(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && saveDiscount(r)}
                            aria-label={`${r.sku} discount percent`}
                            className="h-7 w-16 rounded-md border border-black/10 bg-white px-1.5 text-right font-mono text-xs outline-none focus:border-brand"
                          />
                          <button
                            onClick={() => saveDiscount(r)}
                            className="rounded-md border border-brand/30 bg-brand/5 px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-brand/10"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingDiscountId(r.id);
                            setDiscountDraft(String(r.discountPct));
                          }}
                          disabled={r.status !== "Available"}
                          className="font-mono text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-brand disabled:no-underline disabled:opacity-60"
                        >
                          {r.discountPct > 0 ? `-${r.discountPct}%` : "—"}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.sourceOrderNo ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <RowActionsMenu
                        actions={[
                          {
                            label: "Scrap",
                            onClick: () => runScrapRemnant(r),
                            destructive: true,
                            disabled: r.status !== "Available",
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRemnants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      No remnants match those filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filteredRemnants.length > 0 && (
            <PaginationBar
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalCount={pagination.totalCount}
              pageSize={PAGE_SIZE}
              onChange={pagination.setPage}
            />
          )}
        </SectionCard>
      ) : (
        <SectionCard title={`${tab} Batches`} desc={`${filtered.length} records`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Days Left</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>{tab}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pagination.pageRows as StockBatchDto[]).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.sku}</TableCell>
                    <TableCell>{b.productName}</TableCell>
                    <TableCell className="font-mono text-xs">{b.batchNo}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(b.receivedDate)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(b.expiryDate)}</TableCell>
                    <TableCell className="text-right">{b.daysLeft}</TableCell>
                    <TableCell className="text-right">{b.qty}</TableCell>
                    <TableCell>{b.warehouseName}</TableCell>
                    <TableCell>
                      <Pill tone={statusTone(b.status)}>{STATUS_LABELS[b.status] ?? b.status}</Pill>
                    </TableCell>
                    <TableCell>
                      <RowActionsMenu
                        actions={[
                          {
                            label: "Quarantine",
                            onClick: () => runAction(b, "quarantine"),
                            destructive: true,
                            disabled: b.status === "WrittenOff",
                          },
                          {
                            label: "Write-Off",
                            onClick: () => runAction(b, "write-off"),
                            destructive: true,
                            disabled: b.status === "WrittenOff",
                          },
                          {
                            label: "Move to Promo",
                            onClick: () => runAction(b, "promo"),
                            disabled: b.status === "WrittenOff",
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No {tab.toLowerCase()} batches match those filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 0 && (
            <PaginationBar
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalCount={pagination.totalCount}
              pageSize={PAGE_SIZE}
              onChange={pagination.setPage}
            />
          )}
        </SectionCard>
      )}

      <FlowDialog
        flow={addBatchFlow}
        open={addingBatch}
        onOpenChange={(v) => !v && setAddingBatch(false)}
        onSubmit={submitHandlers["add-batch"]}
      />
    </div>
  );
}
