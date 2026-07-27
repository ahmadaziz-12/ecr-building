import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/api/auth";
import { useVoidOrder, type OrderDto } from "@/lib/api/pos";

// BRD §3.6 (Module 17): every void carries a REASON CODE; a user without void authority also needs
// an authorizing manager confirming with their own PIN — captured separately in the audit trail.
const VOID_REASON_CODES = [
  { value: "CustomerChangedMind", label: "Customer Changed Mind" },
  { value: "PricingError", label: "Pricing Error" },
  { value: "DuplicateEntry", label: "Duplicate Entry" },
  { value: "StockIssue", label: "Stock Issue" },
  { value: "TrainingError", label: "Training Error" },
  { value: "Other", label: "Other" },
];

export function VoidOrderDialog({ order, onClose }: { order: OrderDto | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [authorizerEmail, setAuthorizerEmail] = useState("");
  const [authorizerPin, setAuthorizerPin] = useState("");
  const voidOrder = useVoidOrder();
  const { user } = useAuth();
  const canVoidAlone = user?.posCeilings.canVoidTransactions ?? false;

  const authorizationOk = canVoidAlone || (authorizerEmail.trim() !== "" && authorizerPin.trim() !== "");

  async function confirm() {
    if (!order || !reason.trim() || !reasonCode || !authorizationOk) return;
    try {
      await voidOrder.mutateAsync({
        id: order.id, reason: reason.trim(), reasonCode,
        authorizerEmail: authorizerEmail.trim() || undefined,
        authorizerPin: authorizerPin.trim() || undefined,
      });
      toast.success(`${order.orderNo} voided`, { description: "Stock has been restored." });
      setReason("");
      setReasonCode("");
      setAuthorizerEmail("");
      setAuthorizerPin("");
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
            Reason Code <span className="text-critical">*</span>
          </label>
          <Select value={reasonCode} onValueChange={setReasonCode}>
            <SelectTrigger><SelectValue placeholder="Select a code…" /></SelectTrigger>
            <SelectContent>
              {VOID_REASON_CODES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Details <span className="text-critical">*</span>
          </label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer cancelled, wrong item scanned…" />
        </div>
        {!canVoidAlone && (
          <div className="space-y-2 rounded-lg bg-canvas p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Manager authorization required
            </p>
            <Input value={authorizerEmail} onChange={(e) => setAuthorizerEmail(e.target.value)} placeholder="Manager email" className="h-9" />
            <Input type="password" value={authorizerPin} onChange={(e) => setAuthorizerPin(e.target.value)} placeholder="Manager PIN" className="h-9" />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!reason.trim() || !reasonCode || !authorizationOk || voidOrder.isPending}
            onClick={confirm}
          >
            {voidOrder.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Void Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
