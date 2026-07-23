import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoidOrder, type OrderDto } from "@/lib/api/pos";

export function VoidOrderDialog({ order, onClose }: { order: OrderDto | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const voidOrder = useVoidOrder();

  async function confirm() {
    if (!order || !reason.trim()) return;
    try {
      await voidOrder.mutateAsync({ id: order.id, reason: reason.trim() });
      toast.success(`${order.orderNo} voided`, { description: "Stock has been restored." });
      setReason("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not void this order.");
    }
  }

  return (
    <Dialog open={order !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Void {order?.orderNo}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This reverses the sale, restores stock for every line, and marks the order Voided. This cannot be undone.
        </p>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reason <span className="text-critical">*</span>
          </label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer cancelled, wrong item scanned…" />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!reason.trim() || voidOrder.isPending}
            onClick={confirm}
          >
            {voidOrder.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Void Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
