import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCloseShift, type CashierShiftDto } from "@/lib/api/pos";

function fmtSar(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}

export function CloseShiftDialog({ shift, onClose }: { shift: CashierShiftDto | null; onClose: () => void }) {
  const [counted, setCounted] = useState("");
  const closeShift = useCloseShift();

  // A cancelled entry must not carry into the next shift's close — a stale counted figure from
  // Terminal A silently becomes Terminal B's declared drawer count.
  useEffect(() => {
    setCounted("");
  }, [shift?.id]);

  const variance = shift && counted ? Number(counted) - shift.expectedCash : null;

  async function submit() {
    if (!shift || counted === "") return;
    try {
      await closeShift.mutateAsync({ id: shift.id, countedCash: Number(counted) });
      toast.success(`${shift.terminalName} shift closed`);
      setCounted("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not close this shift.");
    }
  }

  return (
    <Dialog open={shift !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Close Shift — {shift?.terminalName}</DialogTitle></DialogHeader>
        <div className="rounded-lg border border-black/5 bg-canvas p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Opening Float</span><span>{shift && fmtSar(shift.openingFloat)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Cash Sales</span><span>{shift && fmtSar(shift.cashSales)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Cash In/Out</span><span>{shift && fmtSar(shift.cashIn - shift.cashOut)}</span></div>
          <div className="mt-1 flex justify-between border-t border-black/10 pt-1 font-semibold"><span>Expected Cash</span><span>{shift && fmtSar(shift.expectedCash)}</span></div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Counted Cash (ر.س) <span className="text-critical">*</span></label>
          <Input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
          {variance !== null && (
            <p className={`mt-1 text-xs ${Math.abs(variance) > 20 ? "text-critical" : "text-muted-foreground"}`}>
              Variance: {variance >= 0 ? "+" : ""}{variance.toFixed(2)} ر.س {Math.abs(variance) > 20 && "— will be flagged for review"}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={counted === "" || closeShift.isPending} onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {closeShift.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Close Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
