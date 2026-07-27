import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RowActionsMenu, statusTone, FilterBar, emptyFilterDraft, exportToCsv, type FilterFieldDef,
} from "./shared";
import { RequestApprovalDialog } from "./RequestApprovalDialog";
import { PriceCheckDialog } from "./PriceCheckDialog";
import { StockEnquiryDialog } from "./StockEnquiryDialog";
import {
  useApprovalRequests, useApproveApproval, useCashierShifts, useParkedSales, useRejectApproval,
} from "@/lib/api/pos";
import { RESUME_HOLD_KEY } from "@/components/buildpos/PosCheckout";
import { useAuth } from "@/lib/api/auth";
import { useBranches } from "@/lib/api/admin";

const APPROVAL_TYPES = ["Discount", "PriceOverride", "Refund"];
const APPROVAL_TYPE_LABELS: Record<string, string> = { Discount: "Discount", PriceOverride: "Price Override", Refund: "Refund" };
const FIELDS: FilterFieldDef[] = [
  { kind: "date", key: "dateFrom", placeholder: "From Date" },
  { kind: "date", key: "dateTo", placeholder: "To Date" },
  { kind: "select", key: "approvalType", placeholder: "Approval Type", options: APPROVAL_TYPES, labels: APPROVAL_TYPE_LABELS },
  { kind: "search", key: "search", placeholder: "Search ticket, customer, reason…" },
];

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function shiftDuration(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${mins}m`;
}
function inDateRange(iso: string, from: string, to: string): boolean {
  const d = new Date(iso).getTime();
  if (from && d < new Date(from).getTime()) return false;
  if (to && d > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

export function CashierWorkspacePage() {
  const { user } = useAuth();
  const { data: branches } = useBranches(user?.branchId == null);
  const effectiveBranchId = user?.branchId ?? branches?.[0]?.id ?? null;

  const { data: shifts, refetch: refetchShifts } = useCashierShifts(true);
  const { data: parkedSales, refetch: refetchParked } = useParkedSales(effectiveBranchId ?? undefined);
  const { data: approvals, refetch: refetchApprovals } = useApprovalRequests(true);
  const navigate = useNavigate();
  const approveApproval = useApproveApproval();
  const rejectApproval = useRejectApproval();

  const [draft, setDraft] = useState<Record<string, string>>(() => emptyFilterDraft(FIELDS));
  const [applied, setApplied] = useState<Record<string, string>>(draft);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [priceCheckOpen, setPriceCheckOpen] = useState(false);
  const [stockEnquiryOpen, setStockEnquiryOpen] = useState(false);

  const myShift = useMemo(() => (shifts ?? []).find((s) => s.status === "Open" && s.cashierName === user?.name), [shifts, user?.name]);

  const filteredParked = useMemo(() => {
    return (parkedSales ?? []).filter((p) => {
      if ((applied.dateFrom || applied.dateTo) && !inDateRange(p.createdAt, applied.dateFrom, applied.dateTo)) return false;
      if (applied.search) {
        const t = applied.search.trim().toLowerCase();
        if (t && !p.ticketNo.toLowerCase().includes(t) && !(p.customerName ?? "").toLowerCase().includes(t) && !(p.notes ?? "").toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [parkedSales, applied]);

  const filteredApprovals = useMemo(() => {
    return (approvals ?? []).filter((a) => {
      if (applied.approvalType && a.type !== applied.approvalType) return false;
      if ((applied.dateFrom || applied.dateTo) && !inDateRange(a.createdAt, applied.dateFrom, applied.dateTo)) return false;
      if (applied.search) {
        const t = applied.search.trim().toLowerCase();
        if (t && !a.requestedByName.toLowerCase().includes(t) && !a.reason.toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [approvals, applied]);

  const pendingApprovals = useMemo(() => (approvals ?? []).filter((a) => a.status === "Pending"), [approvals]);

  const kpis = [
    { label: "My Shift", value: myShift ? `Open · ${shiftDuration(myShift.openedAt)}` : "Not open", sub: myShift ? `Since ${fmtTime(myShift.openedAt)}` : "Open a shift to begin", tone: myShift ? ("success" as const) : ("warning" as const) },
    { label: "Cash Sales", value: myShift ? fmtSar(myShift.cashSales) : "—", sub: myShift ? "This shift" : "—", tone: "success" as const },
    { label: "Cash on Hand", value: myShift ? fmtSar(myShift.expectedCash) : "—", sub: myShift ? "Expected" : "—", tone: "info" as const },
    { label: "Parked Sales", value: (parkedSales ?? []).length, sub: "Held tickets", tone: "warning" as const },
    { label: "Pending Approvals", value: pendingApprovals.length, sub: "Awaiting supervisor", tone: pendingApprovals.length > 0 ? ("warning" as const) : ("success" as const) },
  ];

  // Resume must LOAD the ticket into the register, never just release it — releasing deletes the
  // parked lines server-side, so doing it here would destroy the ticket's contents. Hand the id to
  // the checkout screen, which loads the cart and then releases the hold.
  function resume(id: number, ticketNo: string) {
    sessionStorage.setItem(RESUME_HOLD_KEY, String(id));
    toast.success(`Resuming ${ticketNo}…`);
    void navigate({ to: "/operate/pos-checkout" });
  }

  async function resolveApproval(id: number, approve: boolean) {
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
        title="Cashier Workspace"
        desc="Current shift, parked sales, pending approvals and quick tools."
        onRefresh={() => { refetchShifts(); refetchParked(); refetchApprovals(); }}
        actions={
          <>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => setPriceCheckOpen(true)}>Price Check</Button>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => setStockEnquiryOpen(true)}>Stock Enquiry</Button>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => setRequestingApproval(true)}>Request Approval</Button>
            <Button asChild size="sm" className="h-9 gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to="/operate/pos-checkout">New Sale</Link>
            </Button>
          </>
        }
      />

      <FilterBar
        fields={FIELDS}
        draft={draft}
        onDraftChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
        onApply={() => setApplied(draft)}
        onReset={() => { const empty = emptyFilterDraft(FIELDS); setDraft(empty); setApplied(empty); }}
        resultLabel={`${filteredParked.length} parked · ${filteredApprovals.length} approvals`}
      />

      <KpiGrid items={kpis} />

      <SectionCard
        title="Parked Sales"
        desc={`${filteredParked.length} held tickets`}
        action={
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => { exportToCsv("parked-sales.csv", ["Ticket", "Customer", "Items", "Amount", "Parked At", "Notes"], filteredParked.map((p) => [p.ticketNo, p.customerName ?? "Walk-in", p.lines.reduce((s, l) => s + l.qty, 0), p.total, p.createdAt, p.notes ?? ""])); toast.success("Exported CSV"); }}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Parked At</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredParked.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.ticketNo}</TableCell>
                  <TableCell>{p.customerName ?? "Walk-in"}</TableCell>
                  <TableCell className="text-right">{p.lines.reduce((s, l) => s + l.qty, 0)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtSar(p.total)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtTime(p.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.notes ?? "—"}</TableCell>
                  <TableCell>
                    <RowActionsMenu actions={[{ label: "Resume Sale", onClick: () => resume(p.id, p.ticketNo) }]} />
                  </TableCell>
                </TableRow>
              ))}
              {filteredParked.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No parked sales match those filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard
        title="Approval Requests"
        desc={`${filteredApprovals.length} records`}
        action={
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => { exportToCsv("approval-requests.csv", ["Type", "Requested By", "Amount", "Reason", "Status"], filteredApprovals.map((a) => [a.type, a.requestedByName, a.amount, a.reason, a.status])); toast.success("Exported CSV"); }}
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
                <TableHead>Status</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApprovals.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{APPROVAL_TYPE_LABELS[a.type] ?? a.type}</TableCell>
                  <TableCell>{a.requestedByName}</TableCell>
                  <TableCell className="text-right">{fmtSar(a.amount)}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{a.reason}</TableCell>
                  <TableCell><Pill tone={statusTone(a.status)}>{a.status}</Pill></TableCell>
                  <TableCell>
                    <RowActionsMenu
                      actions={[
                        { label: "Approve", onClick: () => resolveApproval(a.id, true), disabled: a.status !== "Pending" },
                        { label: "Reject", onClick: () => resolveApproval(a.id, false), destructive: true, disabled: a.status !== "Pending" },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filteredApprovals.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No approval requests match those filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <RequestApprovalDialog open={requestingApproval} onOpenChange={setRequestingApproval} branchId={effectiveBranchId} />
      <PriceCheckDialog open={priceCheckOpen} onOpenChange={setPriceCheckOpen} />
      <StockEnquiryDialog open={stockEnquiryOpen} onOpenChange={setStockEnquiryOpen} />
    </div>
  );
}
