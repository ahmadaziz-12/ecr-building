import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RowActionsMenu, statusTone, FilterBar, emptyFilterDraft, exportToCsv, type FilterFieldDef, type FilterDraftValue } from "./shared";
import { resolveDateRangeBounds, type DateRangeValue } from "@/components/buildpos/FilterControls";
import { RequestApprovalDialog } from "./RequestApprovalDialog";
import { useApprovalRequests, useApproveApproval, useRejectApproval } from "@/lib/api/pos";
import { useAuth } from "@/lib/api/auth";
import { useBranches } from "@/lib/api/admin";
import { CurrencyText } from "@/lib/buildpos/currency";

// Generalizes the "Approval Requests" section embedded in CashierWorkspacePage.tsx into its own
// module: every ApprovalType (BRD discount/price/refund/credit overrides plus the Approval Center's
// InvoiceDeletion/PaymentMethodChange/ItemDeletion) resolved from one cross-branch queue, instead of
// being buried in a single cashier's workspace tab.
const APPROVAL_TYPES = ["Discount", "PriceOverride", "Refund", "CreditOverride", "InvoiceDeletion", "PaymentMethodChange", "ItemDeletion"];
const APPROVAL_TYPE_LABELS: Record<string, string> = {
  Discount: "Discount", PriceOverride: "Price Override", Refund: "Refund", CreditOverride: "Credit Override",
  InvoiceDeletion: "Invoice Deletion", PaymentMethodChange: "Payment Method Change", ItemDeletion: "Item Deletion",
};
const FIELDS: FilterFieldDef[] = [
  { kind: "daterange", key: "dateRange", placeholder: "Date Range" },
  { kind: "select", key: "status", placeholder: "Status", options: ["Pending", "Approved", "Rejected"] },
  { kind: "select", key: "approvalType", placeholder: "Type", options: APPROVAL_TYPES, labels: APPROVAL_TYPE_LABELS },
  { kind: "search", key: "search", placeholder: "Search requester, order #, reason…" },
];

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}
function inDateRange(iso: string, range: DateRangeValue | undefined): boolean {
  const bounds = resolveDateRangeBounds(range);
  if (!bounds) return true;
  const d = new Date(iso).getTime();
  return d >= bounds.from.getTime() && d <= bounds.to.getTime();
}

export function ApprovalCenterPage() {
  const { user, hasAccess } = useAuth();
  const { data: branches } = useBranches(user?.branchId == null);
  const effectiveBranchId = user?.branchId ?? branches?.[0]?.id ?? null;
  // A cashier/senior cashier can see every request (CanView) but only Store Manager/Supervisor/
  // System Admin hold CanApprove on this module — the row menu below hides Approve/Reject rather
  // than just disabling them, so it's clear this isn't a per-request state, it's a role ceiling.
  const canApprove = hasAccess("/operate/approval-center", "Approve");

  const { data: approvals, refetch } = useApprovalRequests(true);
  const approveApproval = useApproveApproval();
  const rejectApproval = useRejectApproval();

  const [draft, setDraft] = useState<Record<string, FilterDraftValue>>(() => emptyFilterDraft(FIELDS));
  const [applied, setApplied] = useState<Record<string, FilterDraftValue>>(draft);
  const [requestingApproval, setRequestingApproval] = useState(false);

  const filtered = useMemo(() => {
    const status = (applied.status as string[]) ?? [];
    const approvalType = (applied.approvalType as string[]) ?? [];
    const search = ((applied.search as string) ?? "").trim().toLowerCase();
    return (approvals ?? []).filter((a) => {
      if (status.length && !status.includes(a.status)) return false;
      if (approvalType.length && !approvalType.includes(a.type)) return false;
      if (!inDateRange(a.createdAt, applied.dateRange as DateRangeValue)) return false;
      if (search) {
        if (
          !a.requestedByName.toLowerCase().includes(search) &&
          !a.reason.toLowerCase().includes(search) &&
          !(a.relatedOrderNo ?? "").toLowerCase().includes(search)
        ) return false;
      }
      return true;
    });
  }, [approvals, applied]);

  const pending = useMemo(() => (approvals ?? []).filter((a) => a.status === "Pending"), [approvals]);
  const kpis = [
    { label: "Pending", value: pending.length, sub: "Awaiting a decision", tone: pending.length > 0 ? ("warning" as const) : ("success" as const) },
    { label: "Approved (all time)", value: (approvals ?? []).filter((a) => a.status === "Approved").length, sub: "Granted", tone: "success" as const },
    { label: "Rejected (all time)", value: (approvals ?? []).filter((a) => a.status === "Rejected").length, sub: "Denied", tone: "critical" as const },
    { label: "Deletion Requests", value: pending.filter((a) => a.type === "InvoiceDeletion" || a.type === "ItemDeletion").length, sub: "Invoice / item deletion pending", tone: "warning" as const },
  ];

  async function resolve(id: number, approve: boolean) {
    try {
      if (approve) await approveApproval.mutateAsync(id);
      else await rejectApproval.mutateAsync(id);
      toast.success(approve ? "Approval granted" : "Approval rejected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve this request.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Operate"
        title="Approval Center"
        desc="Every pending discount, price override, refund, credit override, invoice deletion, payment-method change and item deletion request across the business, in one queue."
        onRefresh={() => refetch()}
        actions={
          <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => setRequestingApproval(true)}>Request Approval</Button>
        }
      />

      <FilterBar
        fields={FIELDS}
        draft={draft}
        onDraftChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
        onApply={() => setApplied(draft)}
        onReset={() => { const empty = emptyFilterDraft(FIELDS); setDraft(empty); setApplied(empty); }}
        resultLabel={`${filtered.length} requests`}
      />

      <KpiGrid items={kpis} scope="approval-center" />

      <SectionCard
        title="Approval Requests"
        desc={`${filtered.length} records`}
        action={
          <Button
            variant="ghost" size="sm" className="h-8 gap-1.5"
            onClick={() => {
              exportToCsv(
                "approval-requests.csv",
                ["Type", "Requested By", "Amount", "Reason", "Order #", "Status", "Approver", "Created At"],
                filtered.map((a) => [APPROVAL_TYPE_LABELS[a.type] ?? a.type, a.requestedByName, a.amount, a.reason, a.relatedOrderNo ?? "", a.status, a.approverName ?? "", a.createdAt]),
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
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approver</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{APPROVAL_TYPE_LABELS[a.type] ?? a.type}</TableCell>
                  <TableCell>{a.requestedByName}</TableCell>
                  <TableCell className="text-right"><CurrencyText value={fmtSar(a.amount)} /></TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{a.reason}</TableCell>
                  <TableCell className="text-muted-foreground">{a.relatedOrderNo ?? "—"}</TableCell>
                  <TableCell><Pill tone={statusTone(a.status)}>{a.status}</Pill></TableCell>
                  <TableCell className="text-muted-foreground">{a.approverName ?? "—"}</TableCell>
                  <TableCell>
                    {canApprove ? (
                      <RowActionsMenu
                        actions={[
                          { label: "Approve", onClick: () => resolve(a.id, true), disabled: a.status !== "Pending" },
                          { label: "Reject", onClick: () => resolve(a.id, false), destructive: true, disabled: a.status !== "Pending" },
                        ]}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No approval requests match those filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <RequestApprovalDialog open={requestingApproval} onOpenChange={setRequestingApproval} branchId={effectiveBranchId} />
    </div>
  );
}
