import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RequestApprovalDialog } from "./RequestApprovalDialog";
import { useChangeOrderPaymentMethod, type OrderDto } from "@/lib/api/pos";

const PAYMENT_METHODS = ["Cash", "Mada", "ApplePay", "StcPay", "Transfer"];
const PAYMENT_LABELS: Record<string, string> = { ApplePay: "Apple Pay", StcPay: "STC Pay" };

// Approval Center gated: reassigns how an already-completed order was paid (e.g. cashier keyed Cash
// but the customer actually tapped a card) — same two-step request-then-execute shape as
// DeleteInvoiceDialog, since changing settled payment records needs the same audit-trail rigor.
export function ChangePaymentMethodDialog({ order, onClose }: { order: OrderDto | null; onClose: () => void }) {
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [newMethod, setNewMethod] = useState("");
  const [reason, setReason] = useState("");
  const [approvalId, setApprovalId] = useState<number | null>(null);
  const [requesting, setRequesting] = useState(false);
  const changeMethod = useChangeOrderPaymentMethod();

  useEffect(() => {
    if (order && order.payments.length === 1) setPaymentId(order.payments[0].id);
    else setPaymentId(null);
  }, [order]);

  function reset() {
    setPaymentId(null);
    setNewMethod("");
    setReason("");
    setApprovalId(null);
  }

  async function confirm() {
    if (!order || paymentId === null || !newMethod || !reason.trim() || approvalId === null) return;
    try {
      await changeMethod.mutateAsync({ id: order.id, orderPaymentId: paymentId, approvalRequestId: approvalId, newMethod, reason: reason.trim() });
      toast.success(`Payment method updated to ${PAYMENT_LABELS[newMethod] ?? newMethod}`);
      reset();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "This request hasn't been approved yet — ask a supervisor to approve it in Approval Center, then try again.",
      );
    }
  }

  const currentPayment = order?.payments.find((p) => p.id === paymentId);

  return (
    <>
      <Dialog open={order !== null} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Change Payment Method — {order?.orderNo}</DialogTitle></DialogHeader>
          {order && order.payments.length > 1 && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment <span className="text-critical">*</span></label>
              <Select value={paymentId ? String(paymentId) : ""} onValueChange={(v) => setPaymentId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select a payment…" /></SelectTrigger>
                <SelectContent>
                  {order.payments.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{PAYMENT_LABELS[p.method] ?? p.method} — {p.amount.toFixed(2)} ر.س</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">New Method <span className="text-critical">*</span></label>
            <Select value={newMethod} onValueChange={setNewMethod}>
              <SelectTrigger><SelectValue placeholder="Select a method…" /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.filter((m) => m !== currentPayment?.method).map((m) => (
                  <SelectItem key={m} value={m}>{PAYMENT_LABELS[m] ?? m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason <span className="text-critical">*</span></label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cashier keyed Cash but the customer paid by card" />
          </div>
          {approvalId === null ? (
            <p className="rounded-lg bg-canvas p-3 text-xs text-muted-foreground">Changing a settled payment's method requires a different, higher-tier user's approval.</p>
          ) : (
            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-[oklch(0.4_0.13_70)]">
              Approval requested (#{approvalId}) — once a supervisor approves it in Approval Center, click "Change Method" again to finish.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            {approvalId === null ? (
              <Button size="sm" disabled={paymentId === null || !newMethod || !reason.trim()} onClick={() => setRequesting(true)}>Request Approval</Button>
            ) : (
              <Button size="sm" disabled={changeMethod.isPending} onClick={confirm} className="bg-brand text-brand-foreground hover:bg-brand/90">
                {changeMethod.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Change Method"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RequestApprovalDialog
        open={requesting}
        onOpenChange={setRequesting}
        branchId={order?.branchId ?? null}
        defaultType="PaymentMethodChange"
        defaultAmount={currentPayment ? String(currentPayment.amount) : ""}
        defaultReason={reason}
        relatedOrderId={order?.id}
        onCreated={(approval) => { setApprovalId(approval.id); setRequesting(false); }}
      />
    </>
  );
}
