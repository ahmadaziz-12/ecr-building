import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateReturn } from "@/lib/api/finance";
import type { OrderDto } from "@/lib/api/pos";

const RETURN_TYPES = ["Standard", "Surplus", "Damaged", "Exchange"];

export function CreateReturnDialog({ order, onClose }: { order: OrderDto | null; onClose: () => void }) {
  const [type, setType] = useState("Standard");
  const [reason, setReason] = useState("");
  const createReturn = useCreateReturn();

  async function confirm() {
    if (!order || !reason.trim()) return;
    try {
      await createReturn.mutateAsync({
        orderId: order.id,
        customerId: order.customerId,
        type,
        reason: reason.trim(),
        lines: order.lines.map((l) => ({ productId: l.productId, qty: l.qty, amount: l.lineTotal })),
      });
      toast.success("Return created", { description: type === "Damaged" ? "Sent to quarantine for inspection." : "Pending approval." });
      setReason("");
      setType("Standard");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the return.");
    }
  }

  return (
    <Dialog open={order !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Return {order?.orderNo}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Returns the full order ({order?.lines.length ?? 0} line(s)) for approval and stock re-entry.</p>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Return Type</label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RETURN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reason <span className="text-critical">*</span>
          </label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong item, customer changed mind…" />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!reason.trim() || createReturn.isPending} onClick={confirm} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {createReturn.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
