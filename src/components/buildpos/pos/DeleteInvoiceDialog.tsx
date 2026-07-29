import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RequestApprovalDialog } from "./RequestApprovalDialog";
import { useDeleteOrder, type OrderDto } from "@/lib/api/pos";

// Approval Center's async-gated alternative to VoidOrderDialog's inline manager-PIN void: a cashier
// without void authority requests an InvoiceDeletion approval here (reusing RequestApprovalDialog),
// then comes back to THIS dialog and clicks "Delete Invoice" again once a supervisor has approved it
// in the Approval Center — same two-step shape as the Discount/CreditOverride approval flow in
// PosCheckout.tsx, just surfaced as its own dialog since Orders isn't a live checkout session.
export function DeleteInvoiceDialog({ order, onClose }: { order: OrderDto | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [approvalId, setApprovalId] = useState<number | null>(null);
  const [requesting, setRequesting] = useState(false);
  const deleteOrder = useDeleteOrder();

  function reset() {
    setReason("");
    setApprovalId(null);
  }

  async function confirm() {
    if (!order || !reason.trim() || approvalId === null) return;
    try {
      await deleteOrder.mutateAsync({ id: order.id, approvalRequestId: approvalId, reason: reason.trim() });
      toast.success(`${order.orderNo} deleted`, { description: "Stock has been restored." });
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
      <Dialog open={order !== null} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delete Invoice {order?.orderNo}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the invoice from active records and restores stock for every line. It requires supervisor
            approval and cannot be undone.
          </p>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reason <span className="text-critical">*</span>
            </label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate invoice created by mistake" />
          </div>
          {approvalId === null ? (
            <p className="rounded-lg bg-canvas p-3 text-xs text-muted-foreground">
              Deleting an invoice requires a different, higher-tier user to approve the request first.
            </p>
          ) : (
            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-[oklch(0.4_0.13_70)]">
              Approval requested (#{approvalId}) — once a supervisor approves it in Approval Center, click "Delete Invoice" again to finish.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            {approvalId === null ? (
              <Button size="sm" disabled={!reason.trim()} onClick={() => setRequesting(true)}>Request Approval</Button>
            ) : (
              <Button size="sm" variant="destructive" disabled={deleteOrder.isPending} onClick={confirm}>
                {deleteOrder.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete Invoice"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RequestApprovalDialog
        open={requesting}
        onOpenChange={setRequesting}
        branchId={order?.branchId ?? null}
        defaultType="InvoiceDeletion"
        defaultAmount={order ? String(order.grandTotal) : ""}
        defaultReason={reason}
        relatedOrderId={order?.id}
        onCreated={(approval) => { setApprovalId(approval.id); setRequesting(false); }}
      />
    </>
  );
}
