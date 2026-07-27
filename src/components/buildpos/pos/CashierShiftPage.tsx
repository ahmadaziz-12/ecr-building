import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RowActionsMenu, statusTone, FilterBar, emptyFilterDraft, usePagination, PaginationBar, exportToCsv,
  type FilterFieldDef,
} from "./shared";
import { OpenShiftDialog } from "./OpenShiftDialog";
import { CloseShiftDialog } from "./CloseShiftDialog";
import { CashMovementDialog } from "./CashMovementDialog";
import { CashMovementsDialog } from "./CashMovementsDialog";
import { ShiftReportDialog } from "./ShiftReportDialog";
import { useCashierShifts, type CashierShiftDto } from "@/lib/api/pos";
import { useAuth } from "@/lib/api/auth";
import { useBranches, useTerminals } from "@/lib/api/admin";

const SHIFT_STATUSES = ["Open", "NeedsReview", "Closed"];
const STATUS_LABELS: Record<string, string> = { NeedsReview: "Needs Review" };
const PAGE_SIZE = 10;

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function inDateRange(iso: string, from: string, to: string): boolean {
  const d = new Date(iso).getTime();
  if (from && d < new Date(from).getTime()) return false;
  if (to && d > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

export function CashierShiftPage() {
  const { user } = useAuth();
  const { data: branches } = useBranches(true);
  const { data: terminals } = useTerminals(true);
  const effectiveBranchId = user?.branchId ?? branches?.[0]?.id ?? null;

  const { data: shifts, refetch, isFetching } = useCashierShifts(true);
  const [opening, setOpening] = useState(false);
  const [closingShift, setClosingShift] = useState<CashierShiftDto | null>(null);
  const [movementShift, setMovementShift] = useState<(CashierShiftDto & { direction: "in" | "out" }) | null>(null);
  const [reportTarget, setReportTarget] = useState<{ shiftId: number; type: "X" | "Z" } | null>(null);
  const [movementsShiftId, setMovementsShiftId] = useState<number | null>(null);

  const terminalBranch = useMemo(() => new Map((terminals ?? []).map((t) => [t.id, t.branchId])), [terminals]);

  const fields: FilterFieldDef[] = useMemo(() => [
    { kind: "date", key: "dateFrom", placeholder: "From Date" },
    { kind: "date", key: "dateTo", placeholder: "To Date" },
    { kind: "select", key: "branchId", placeholder: "Branch", options: (branches ?? []).map((b) => String(b.id)), labels: Object.fromEntries((branches ?? []).map((b) => [String(b.id), b.nameEn])) },
    { kind: "select", key: "terminalId", placeholder: "Terminal", options: (terminals ?? []).map((t) => String(t.id)), labels: Object.fromEntries((terminals ?? []).map((t) => [String(t.id), t.name])) },
    { kind: "select", key: "cashier", placeholder: "Cashier", options: Array.from(new Set((shifts ?? []).map((s) => s.cashierName))) },
    { kind: "select", key: "status", placeholder: "Status", options: SHIFT_STATUSES, labels: STATUS_LABELS },
  ], [branches, terminals, shifts]);

  const [draft, setDraft] = useState<Record<string, string>>(() => emptyFilterDraft(fields));
  const [applied, setApplied] = useState<Record<string, string>>(draft);

  const all = shifts ?? [];
  const filtered = useMemo(() => {
    return all.filter((s) => {
      if (applied.status && s.status !== applied.status) return false;
      if (applied.terminalId && String(s.terminalId) !== applied.terminalId) return false;
      if (applied.cashier && s.cashierName !== applied.cashier) return false;
      if (applied.branchId && String(terminalBranch.get(s.terminalId)) !== applied.branchId) return false;
      if ((applied.dateFrom || applied.dateTo) && !inDateRange(s.openedAt, applied.dateFrom, applied.dateTo)) return false;
      return true;
    });
  }, [all, applied, terminalBranch]);

  const pagination = usePagination(filtered, PAGE_SIZE, JSON.stringify(applied));

  const kpis = useMemo(() => {
    const open = all.filter((s) => s.status === "Open");
    const needsReview = all.filter((s) => s.status === "NeedsReview");
    return [
      { label: "Open Shifts", value: open.length, sub: "Currently active", tone: "info" as const },
      { label: "Total Float", value: fmtSar(open.reduce((s, x) => s + x.openingFloat, 0)), sub: "All open terminals", tone: "info" as const },
      { label: "Cash Sales", value: fmtSar(all.reduce((s, x) => s + x.cashSales, 0)), sub: `${all.length} shifts`, tone: "success" as const },
      { label: "Needs Review", value: needsReview.length, sub: "Variance over threshold", tone: needsReview.length > 0 ? ("critical" as const) : ("success" as const) },
    ];
  }, [all]);

  function handleExport() {
    exportToCsv("cashier-shifts.csv", ["Shift ID", "Cashier", "Terminal", "Opened", "Closed", "Opening Float", "Cash Sales", "Expected", "Counted", "Variance", "Status"],
      filtered.map((s) => [`SH-${String(s.id).padStart(4, "0")}`, s.cashierName, s.terminalName, s.openedAt, s.closedAt ?? "", s.openingFloat, s.cashSales, s.expectedCash, s.countedCash ?? "", s.variance ?? "", s.status]));
    toast.success("Exported CSV");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        group="Operate"
        title="Cashier Shift"
        desc="Shift open/close, float, cash-in/out, X-report, Z-report and variance."
        primary="Open Shift"
        onPrimary={() => setOpening(true)}
        onRefresh={() => refetch()}
        onExport={handleExport}
      />

      <FilterBar
        fields={fields}
        draft={draft}
        onDraftChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
        onApply={() => setApplied(draft)}
        onReset={() => { const empty = emptyFilterDraft(fields); setDraft(empty); setApplied(empty); }}
        resultLabel={`${filtered.length} of ${all.length}${isFetching ? " · refreshing…" : ""}`}
      />

      <KpiGrid items={kpis} />

      <SectionCard title="Shift Ledger" desc={`${filtered.length} records`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shift ID</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Terminal</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead className="text-right">Opening Float</TableHead>
                <TableHead className="text-right">Cash Sales</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pageRows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">SH-{String(s.id).padStart(4, "0")}</TableCell>
                  <TableCell>{s.cashierName}</TableCell>
                  <TableCell>{s.terminalName}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtTime(s.openedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtTime(s.closedAt)}</TableCell>
                  <TableCell className="text-right">{fmtSar(s.openingFloat)}</TableCell>
                  <TableCell className="text-right">{fmtSar(s.cashSales)}</TableCell>
                  <TableCell className="text-right">{fmtSar(s.expectedCash)}</TableCell>
                  <TableCell className="text-right">{s.countedCash === null ? "—" : fmtSar(s.countedCash)}</TableCell>
                  <TableCell className="text-right">{s.variance === null ? "—" : fmtSar(s.variance)}</TableCell>
                  <TableCell><Pill tone={statusTone(s.status)}>{s.status}</Pill></TableCell>
                  <TableCell>
                    <RowActionsMenu
                      actions={[
                        { label: "Cash In", onClick: () => setMovementShift({ ...s, direction: "in" }), disabled: s.status !== "Open" },
                        { label: "Cash Out", onClick: () => setMovementShift({ ...s, direction: "out" }), disabled: s.status !== "Open" },
                        { label: "Close Shift", onClick: () => setClosingShift(s), disabled: s.status !== "Open" },
                        "separator",
                        { label: "View Cash Movements", onClick: () => setMovementsShiftId(s.id) },
                        { label: "Print X-Report", onClick: () => setReportTarget({ shiftId: s.id, type: "X" }) },
                        { label: "Print Z-Report", onClick: () => setReportTarget({ shiftId: s.id, type: "Z" }), disabled: s.status === "Open" },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">No shifts match those filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 0 && (
          <PaginationBar page={pagination.page} totalPages={pagination.totalPages} totalCount={pagination.totalCount} pageSize={PAGE_SIZE} onChange={pagination.setPage} />
        )}
      </SectionCard>

      <OpenShiftDialog open={opening} onOpenChange={setOpening} branchId={effectiveBranchId} />
      <CloseShiftDialog shift={closingShift} onClose={() => setClosingShift(null)} />
      <CashMovementDialog shift={movementShift} onClose={() => setMovementShift(null)} />
      <CashMovementsDialog shiftId={movementsShiftId} onClose={() => setMovementsShiftId(null)} />
      <ShiftReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}
