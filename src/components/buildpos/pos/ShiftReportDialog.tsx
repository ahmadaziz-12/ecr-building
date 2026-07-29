import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchShiftReport, type CashierShiftReportDto } from "@/lib/api/pos";
import { CurrencyText } from "@/lib/buildpos/currency";
import { SARIcon } from "@/lib/buildpos/currency";

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}

export function ShiftReportDialog({ target, onClose }: { target: { shiftId: number; type: "X" | "Z" } | null; onClose: () => void }) {
  const [report, setReport] = useState<CashierShiftReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setError(null);
    if (!target) return;
    // Stale-response guard: a slow response for a previously opened shift must never overwrite the
    // report of the shift currently on screen.
    let cancelled = false;
    fetchShiftReport(target.shiftId, target.type)
      .then((r) => !cancelled && setReport(r))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load report."));
    return () => {
      cancelled = true;
    };
  }, [target]);

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{target?.type === "Z" ? "Z-Report (Final)" : "X-Report (Mid-shift)"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-critical">{error}</p>}
        {report && (
          <div className="space-y-3 text-sm" id="shift-report-printable">
            <div className="rounded-lg border border-black/5 bg-canvas p-3">
              <p className="font-medium">{report.terminalName}</p>
              <p className="text-xs text-muted-foreground">Cashier: {report.cashierName}</p>
              <p className="text-xs text-muted-foreground">Generated: {new Date(report.generatedAt).toLocaleString()}</p>
            </div>
            <div className="grid grid-cols-2 gap-y-1">
              <span className="text-muted-foreground">Opening Float</span><span className="text-right"><CurrencyText value={fmtSar(report.openingFloat)} /></span>
              <span className="text-muted-foreground">Cash Sales</span><span className="text-right"><CurrencyText value={fmtSar(report.cashSales)} /></span>
              <span className="text-muted-foreground">Cash In/Out</span><span className="text-right"><CurrencyText value={fmtSar(report.cashIn - report.cashOut)} /></span>
              <span className="font-semibold">Expected Cash</span><span className="text-right font-semibold"><CurrencyText value={fmtSar(report.expectedCash)} /></span>
              {report.countedCash !== null && (
                <>
                  <span className="text-muted-foreground">Counted Cash</span><span className="text-right"><CurrencyText value={fmtSar(report.countedCash)} /></span>
                  <span className="text-muted-foreground">Variance</span><span className="text-right">{report.variance?.toFixed(2)} <SARIcon /></span>
                </>
              )}
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Breakdown ({report.orderCount} orders)</p>
              <div className="rounded-lg border border-black/5">
                {report.paymentBreakdown.map((b) => (
                  <div key={b.method} className="flex justify-between border-b border-black/5 px-3 py-1.5 last:border-0">
                    <span>{b.method} × {b.count}</span>
                    <span className="font-medium"><CurrencyText value={fmtSar(b.amount)} /></span>
                  </div>
                ))}
                {report.paymentBreakdown.length === 0 && <p className="px-3 py-3 text-center text-muted-foreground">No completed sales in this window.</p>}
              </div>
            </div>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
