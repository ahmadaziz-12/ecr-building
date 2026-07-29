import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCashMovement, type CashierShiftDto } from "@/lib/api/pos";
import { SARIcon } from "@/lib/buildpos/currency";

export function CashMovementDialog({ shift, onClose }: { shift: (CashierShiftDto & { direction: "in" | "out" }) | null; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const cashMovement = useCashMovement();

  const amountValid = Number.isFinite(Number(amount)) && Number(amount) > 0;

  async function submit() {
    if (!shift || !amountValid || !reason.trim()) return;
    try {
      await cashMovement.mutateAsync({ id: shift.id, direction: shift.direction, amount: Number(amount), reason: reason.trim() });
      toast.success(`Cash ${shift.direction === "in" ? "in" : "out"} recorded`);
      setAmount("");
      setReason("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record this cash movement.");
    }
  }

  return (
    <Dialog open={shift !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Cash {shift?.direction === "in" ? "In" : "Out"} — {shift?.terminalName}</DialogTitle></DialogHeader>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (<SARIcon />) <span className="text-critical">*</span></label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason <span className="text-critical">*</span></label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Change fund top-up, bank drop…" />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!amountValid || !reason.trim() || cashMovement.isPending} onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {cashMovement.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
