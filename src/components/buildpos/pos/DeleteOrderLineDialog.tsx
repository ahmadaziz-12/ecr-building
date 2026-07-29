import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RequestApprovalDialog } from "./RequestApprovalDialog";
import { useDeleteOrderLine, type OrderDto, type OrderLineDto } from "@/lib/api/pos";

// Approval Center gated counterpart to the line-level void OrdersController already supports
// (VoidLine) — same two-step request-then-execute shape as DeleteInvoiceDialog/
// ChangePaymentMethodDialog, scoped to a single line via ApprovalRequest.RelatedOrderLineId.
export function DeleteOrderLineDialog({
  order, line, onClose,
}: {
  order: OrderDto | null;
  line: OrderLineDto | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [approvalId, setApprovalId] = useState<number | null>(null);
  const [requesting, setRequesting] = useState(false);
  const deleteLine = useDeleteOrderLine();

  function reset() {
    setReason("");
    setApprovalId(null);
  }

  async function confirm() {
    if (!order || !line || !reason.trim() || approvalId === null) return;
    try {
      await deleteLine.mutateAsync({ id: order.id, orderLineId: line.id, approvalRequestId: approvalId, reason: reason.trim() });
      toast.success(`${line.productName} removed from ${order.orderNo}`, { description: "Stock has been restored." });
      reset();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "This request hasn't been approved yet — ask a supervisor to approve it in Approval Center, then try again.",
      );
    }
  }

  return (
    <>
      <Dialog open={order !== null && line !== null} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delete Item — {line?.productName}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes just this line from {order?.orderNo}, restores its stock, and re-derives the order totals. It requires
            supervisor approval and cannot be undone.
          </p>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reason <span className="text-critical">*</span>
            </label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Item was scanned twice by mistake" />
          </div>
          {approvalId === null ? (
            <p className="rounded-lg bg-canvas p-3 text-xs text-muted-foreground">Deleting an item requires a different, higher-tier user's approval.</p>
          ) : (
            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-[oklch(0.4_0.13_70)]">
              Approval requested (#{approvalId}) — once a supervisor approves it in Approval Center, click "Delete Item" again to finish.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            {approvalId === null ? (
              <Button size="sm" disabled={!reason.trim()} onClick={() => setRequesting(true)}>Request Approval</Button>
            ) : (
              <Button size="sm" variant="destructive" disabled={deleteLine.isPending} onClick={confirm}>
                {deleteLine.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete Item"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RequestApprovalDialog
        open={requesting}
        onOpenChange={setRequesting}
        branchId={order?.branchId ?? null}
        defaultType="ItemDeletion"
        defaultAmount={line ? String(line.lineTotal) : ""}
        defaultReason={reason}
        relatedOrderId={order?.id}
        relatedOrderLineId={line?.id}
        onCreated={(approval) => { setApprovalId(approval.id); setRequesting(false); }}
      />
    </>
  );
}
