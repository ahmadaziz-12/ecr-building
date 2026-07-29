import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RowActionsMenu, statusTone, FilterBar, emptyFilterDraft, usePagination, PaginationBar, exportToCsv,
  type FilterFieldDef, type FilterDraftValue, type RowAction,
} from "@/components/buildpos/pos/shared";
import { resolveDateRangeBounds, type DateRangeValue } from "@/components/buildpos/FilterControls";
import { FlowDialog } from "@/components/buildpos/FlowDialog";
import { getFlow } from "@/lib/buildpos/flows";
import { useFlowSubmitHandlers } from "@/lib/api/flow-submit-handlers";
import { useBranches } from "@/lib/api/admin";
import {
  usePurchaseOrders, useSuppliers, useSubmitPurchaseOrder, useApprovePurchaseOrder,
  useDispatchPurchaseOrder, useCancelPurchaseOrder, type PurchaseOrderDto,
} from "@/lib/api/procurement";
import { PurchaseOrderDetailDialog } from "./PurchaseOrderDetailDialog";
import { ReceivePoDialog } from "./ReceivePoDialog";
import { CurrencyText } from "@/lib/buildpos/currency";

// Tabs mirror the backend PurchaseOrderStatus enum (backend/src/EcrBuilding.Domain/Entities/
// Procurement.cs). "Delayed" is a computed display status the API substitutes for an overdue
// Sent / InTransit / PartialReceive PO — it appears as a tab but is never a stored state.
const TABS = [
  "All", "Draft", "Pending Approval", "Sent", "In Transit", "Partial Receive", "Received", "Delayed", "Cancelled",
] as const;
type Tab = (typeof TABS)[number];

const TAB_TO_STATUS: Record<Exclude<Tab, "All">, string> = {
  Draft: "Draft",
  "Pending Approval": "PendingApproval",
  Sent: "Sent",
  "In Transit": "InTransit",
  "Partial Receive": "PartialReceive",
  Received: "Received",
  Delayed: "Delayed",
  Cancelled: "Cancelled",
};

const STATUS_LABELS: Record<string, string> = {
  PendingApproval: "Pending Approval",
  InTransit: "In Transit",
  PartialReceive: "Partial Receive",
};
function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

const OPEN_STATUSES = new Set(["Draft", "PendingApproval", "Sent", "InTransit", "PartialReceive", "Delayed"]);
// Controller transition rules (ProcurementController.cs): submit Draft→PendingApproval, approve
// PendingApproval→Sent, dispatch Sent→InTransit, cancel only Draft/PendingApproval/Sent, receive
// only Sent/InTransit/PartialReceive. A "Delayed" PO is one of the receivable three underneath,
// so it can always receive; dispatch on Delayed mirrors the existing row-actions wiring (valid
// when the underlying status is Sent — the server's message surfaces otherwise).
const CANCELLABLE = new Set(["Draft", "PendingApproval", "Sent"]);
const RECEIVABLE = new Set(["Sent", "InTransit", "PartialReceive", "Delayed"]);

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function inDateRange(iso: string, range: DateRangeValue | undefined): boolean {
  const bounds = resolveDateRangeBounds(range);
  if (!bounds) return true;
  const d = new Date(iso).getTime();
  return d >= bounds.from.getTime() && d <= bounds.to.getTime();
}
function receivedValue(po: PurchaseOrderDto): number {
  return po.lines.reduce((s, l) => s + l.receivedQty * l.unitCost, 0);
}
function outstandingValue(po: PurchaseOrderDto): number {
  return po.lines.reduce((s, l) => s + Math.max(0, l.qty - l.receivedQty) * l.unitCost, 0);
}
function hasOutstandingLines(po: PurchaseOrderDto): boolean {
  return po.lines.some((l) => l.receivedQty < l.qty);
}

const PAGE_SIZE = 10;

export function PurchaseOrdersPage() {
  const { data: pos, refetch, isFetching, isLoading } = usePurchaseOrders(true);
  const { data: branches } = useBranches(true);
  const { data: suppliers } = useSuppliers(true);
  const submitPo = useSubmitPurchaseOrder();
  const approvePo = useApprovePurchaseOrder();
  const dispatchPo = useDispatchPurchaseOrder();
  const cancelPo = useCancelPurchaseOrder();

  // Create PO reuses the same FlowDialog + flow config + submit handler ModulePage wires for the
  // module's primaryAction — the only difference is the static supplier options are replaced with
  // the live supplier list so the picker always matches what the backend actually has.
  const createPoFlow = getFlow("Create PO");
  const submitHandlers = useFlowSubmitHandlers();
  const [creating, setCreating] = useState(false);
  const createPoOverrides = useMemo(
    () => (suppliers?.length ? { supplier: { options: suppliers.map((s) => s.nameEn) } } : undefined),
    [suppliers],
  );

  const [tab, setTab] = useState<Tab>("All");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [receiveId, setReceiveId] = useState<number | null>(null);

  const allPos = pos ?? [];
  // Dialogs read the live query row (not a stored snapshot) so a receive/approve immediately
  // updates the open dialog instead of showing stale status and quantities.
  const detailPo = allPos.find((p) => p.id === detailId) ?? null;
  const receiveTarget = allPos.find((p) => p.id === receiveId) ?? null;

  const fields: FilterFieldDef[] = useMemo(() => [
    { kind: "daterange", key: "dateRange", placeholder: "ETA" },
    { kind: "select", key: "supplier", placeholder: "Supplier", options: Array.from(new Set(allPos.map((p) => p.supplierName))).sort() },
    { kind: "select", key: "branch", placeholder: "Branch", options: (branches ?? []).map((b) => b.nameEn) },
    { kind: "search", key: "search", placeholder: "Search PO #, supplier…" },
  ], [allPos, branches]);

  const [draft, setDraft] = useState<Record<string, FilterDraftValue>>(() => emptyFilterDraft(fields));
  const [applied, setApplied] = useState<Record<string, FilterDraftValue>>(draft);

  const filtered = useMemo(() => {
    const supplier = (applied.supplier as string[]) ?? [];
    const branch = (applied.branch as string[]) ?? [];
    const search = (applied.search as string) ?? "";
    return allPos.filter((p) => {
      if (tab !== "All" && p.status !== TAB_TO_STATUS[tab]) return false;
      if (supplier.length && !supplier.includes(p.supplierName)) return false;
      if (branch.length && !branch.some((b) => p.branches.includes(b))) return false;
      if (!inDateRange(p.expectedDate, applied.dateRange as DateRangeValue)) return false;
      if (search) {
        const t = search.trim().toLowerCase();
        if (t && !p.poNo.toLowerCase().includes(t) && !p.supplierName.toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [allPos, tab, applied]);

  const pagination = usePagination(filtered, PAGE_SIZE, JSON.stringify(applied) + tab);

  // Count cards drive the Status filter they summarise; the two value cards are money totals with
  // no single status behind them, so they stay plain readouts rather than dead controls.
  const appliedStatus = (applied.status as string[]) ?? [];
  const filterByStatus = (...s: string[]) => () => {
    const same = appliedStatus.length === s.length && s.every((x) => appliedStatus.includes(x));
    const next = same ? [] : s;
    setDraft((d) => ({ ...d, status: next }));
    setApplied((a) => ({ ...a, status: next }));
  };
  const kpis = useMemo(() => {
    const open = allPos.filter((p) => OPEN_STATUSES.has(p.status));
    const pending = allPos.filter((p) => p.status === "PendingApproval").length;
    const inTransit = allPos.filter((p) => p.status === "InTransit").length;
    const delayed = allPos.filter((p) => p.status === "Delayed").length;
    const now = new Date();
    // The DTO carries no receipt timestamp, so "this month" is approximated by expected date —
    // the value received to date against POs whose ETA falls in the current month.
    const receivedThisMonth = allPos
      .filter((p) => {
        const d = new Date(p.expectedDate);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, p) => s + receivedValue(p), 0);
    const outstanding = open.reduce((s, p) => s + outstandingValue(p), 0);
    const only = (...s: string[]) =>
      appliedStatus.length === s.length && s.every((x) => appliedStatus.includes(x));
    return [
      { label: "Open POs", value: open.length, sub: `${allPos.length} total`, tone: "info" as const, onSelect: filterByStatus(...OPEN_STATUSES), active: only(...OPEN_STATUSES) },
      { label: "Awaiting Approval", value: pending, sub: "Pending review", tone: "warning" as const, onSelect: filterByStatus("PendingApproval"), active: only("PendingApproval") },
      { label: "In Transit", value: inTransit, sub: delayed > 0 ? `${delayed} delayed` : "On schedule", tone: (delayed > 0 ? "critical" : "info") as "critical" | "info", onSelect: filterByStatus("InTransit"), active: only("InTransit") },
      { label: "Received This Month", value: fmtSar(receivedThisMonth), sub: "By expected date", tone: "success" as const },
      { label: "Outstanding Value", value: fmtSar(outstanding), sub: "Not yet received", tone: "warning" as const },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPos, appliedStatus.join("|")]);

  async function runAction(po: PurchaseOrderDto, action: "submit" | "approve" | "dispatch" | "cancel") {
    try {
      if (action === "submit") {
        await submitPo.mutateAsync(po.id);
        toast.success(`${po.poNo} submitted for approval`);
      }
      if (action === "approve") {
        await approvePo.mutateAsync({ id: po.id, approverUserId: null });
        toast.success(`${po.poNo} approved · sent to supplier`);
      }
      if (action === "dispatch") {
        await dispatchPo.mutateAsync({ id: po.id, carrier: null, trackingRef: null });
        toast.success(`${po.poNo} marked in transit`);
      }
      if (action === "cancel") {
        await cancelPo.mutateAsync(po.id);
        toast.success(`${po.poNo} cancelled`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    }
  }

  function rowActions(po: PurchaseOrderDto): RowAction[] {
    return [
      { label: "View", onClick: () => setDetailId(po.id) },
      ...(po.status === "Draft"
        ? [{ label: "Submit for Approval", onClick: () => runAction(po, "submit") }]
        : []),
      ...(po.status === "PendingApproval"
        ? [{ label: "Approve", onClick: () => runAction(po, "approve") }]
        : []),
      ...(po.status === "Sent" || po.status === "Delayed"
        ? [{ label: "Mark In Transit", onClick: () => runAction(po, "dispatch") }]
        : []),
      ...(RECEIVABLE.has(po.status) && hasOutstandingLines(po)
        ? [{ label: "Receive…", onClick: () => setReceiveId(po.id) }]
        : []),
      "separator" as const,
      { label: "Cancel PO", onClick: () => runAction(po, "cancel"), destructive: true, disabled: !CANCELLABLE.has(po.status) },
    ];
  }

  function handleExport() {
    exportToCsv(
      "purchase-orders.csv",
      ["PO #", "Supplier", "Branch(es)", "Expected Date", "Lines", "Total Value", "Received %", "Status"],
      filtered.map((p) => [
        p.poNo, p.supplierName, p.branches.join(" / "), p.expectedDate, p.lines.length,
        p.totalValue, p.receivedPct, statusLabel(p.status),
      ]),
    );
    toast.success("Exported CSV");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Finance"
        title="Purchase Orders"
        desc="PO creation and status for suppliers and stock replenishment."
        onRefresh={() => refetch()}
        onExport={handleExport}
        primary="Create PO"
        onPrimary={() => setCreating(true)}
      />

      <div className="flex flex-wrap gap-1 border-b border-black/5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-3 py-2 text-sm font-medium transition ${tab === t ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      <FilterBar
        fields={fields}
        draft={draft}
        onDraftChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
        onApply={() => setApplied(draft)}
        onReset={() => { const empty = emptyFilterDraft(fields); setDraft(empty); setApplied(empty); }}
        resultLabel={`${filtered.length} record(s)${isFetching ? " · refreshing…" : ""}`}
      />

      <KpiGrid items={kpis} scope="purchase-orders" />

      <SectionCard title="Purchase Order Ledger" desc={`${filtered.length} records`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Branch(es)</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-full animate-pulse rounded bg-black/5" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : pagination.pageRows.map((po) => {
                    const doneLines = po.lines.filter((l) => l.receivedQty >= l.qty).length;
                    return (
                      <TableRow key={po.id} onClick={() => setDetailId(po.id)} className="cursor-pointer">
                        <TableCell className="font-mono text-xs">{po.poNo}</TableCell>
                        <TableCell>{po.supplierName}</TableCell>
                        <TableCell className="text-muted-foreground">{po.branches.join(", ") || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(po.expectedDate)}</TableCell>
                        <TableCell className="text-right">{po.lines.length}</TableCell>
                        <TableCell className="text-right font-medium"><CurrencyText value={fmtSar(po.totalValue)} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 flex-none overflow-hidden rounded-full bg-black/5">
                              <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, po.receivedPct)}%` }} />
                            </div>
                            <span className="whitespace-nowrap text-xs text-muted-foreground">{doneLines}/{po.lines.length} lines</span>
                          </div>
                        </TableCell>
                        <TableCell><Pill tone={statusTone(statusLabel(po.status))}>{statusLabel(po.status)}</Pill></TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <RowActionsMenu actions={rowActions(po)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">No purchase orders match those filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 0 && (
          <PaginationBar page={pagination.page} totalPages={pagination.totalPages} totalCount={pagination.totalCount} pageSize={PAGE_SIZE} onChange={pagination.setPage} />
        )}
      </SectionCard>

      <PurchaseOrderDetailDialog
        po={detailPo}
        onClose={() => setDetailId(null)}
        onReceive={(po) => setReceiveId(po.id)}
      />
      <ReceivePoDialog po={receiveTarget} onClose={() => setReceiveId(null)} />
      <FlowDialog
        flow={createPoFlow}
        open={creating}
        onOpenChange={(v) => !v && setCreating(false)}
        onSubmit={submitHandlers["create-po"]}
        fieldOverrides={createPoOverrides}
      />
    </div>
  );
}
