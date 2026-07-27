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
  type StockBatchDto,
} from "@/lib/api/inventory";

// Warehouse batches (backroom/bulk) and branch batches (shop-floor, post-transfer or a direct
// receipt with no linked warehouse) are two separate tables with their own id sequences and their
// own pair of action endpoints — kept as two tabs on one page rather than merged into a single list,
// since each tab's rows, filters, and row actions are entirely self-contained (no id disambiguation
// needed, unlike an earlier merged-list approach).
const TABS = ["Warehouse", "Branch"] as const;
type Tab = (typeof TABS)[number];

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

  const quarantineBatch = useQuarantineBatch();
  const writeOffBatch = useWriteOffBatch();
  const promoBatch = usePromoBatch();
  const quarantineBranchBatch = useQuarantineBranchBatch();
  const writeOffBranchBatch = useWriteOffBranchBatch();
  const promoBranchBatch = usePromoBranchBatch();

  const skuToCategory = useMemo(
    () => new Map((products ?? []).map((p) => [p.sku, p.categoryName])),
    [products],
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set((products ?? []).map((p) => p.categoryName))).sort(),
    [products],
  );

  const isBranch = tab === "Branch";
  const activeRows = isBranch ? (branchBatches ?? []) : (warehouseBatches ?? []);
  const isFetchingActive = isBranch ? fetchingBranch : fetchingWarehouse;
  const refetchActive = () => (isBranch ? refetchBranch() : refetchWarehouse());

  const fields: FilterFieldDef[] = useMemo(
    () => [
      { kind: "select", key: "category", placeholder: "Category", options: categoryOptions },
      {
        kind: "select",
        key: "status",
        placeholder: "Status",
        options: STATUS_OPTIONS,
        labels: STATUS_LABELS,
      },
      { kind: "search", key: "search", placeholder: "Search SKU, product, batch…" },
    ],
    [categoryOptions],
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

  const pagination = usePagination(filtered, PAGE_SIZE, `${JSON.stringify(applied)}|${tab}`);

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

  function handleExport() {
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
        title="Expiry"
        desc="Batch-sensitive materials: paint, adhesives, chemicals, cement additives, sealants — tracked wherever they physically sit."
        primary="Add Batch"
        onPrimary={() => setAddingBatch(true)}
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
            {t === "Warehouse" ? "Warehouse" : "Branch"}
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
        resultLabel={`${filtered.length} of ${activeRows.length}${isFetchingActive ? " · refreshing…" : ""}`}
      />

      <KpiGrid items={kpis} />

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
              {pagination.pageRows.map((b) => (
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

      <FlowDialog
        flow={addBatchFlow}
        open={addingBatch}
        onOpenChange={(v) => !v && setAddingBatch(false)}
        onSubmit={submitHandlers["add-batch"]}
      />
    </div>
  );
}
