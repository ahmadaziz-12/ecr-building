import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateApproval, type ApprovalRequestDto } from "@/lib/api/pos";

const TYPES = ["Discount", "PriceOverride", "Refund", "CreditOverride"];
const TYPE_LABELS: Record<string, string> = {
  Discount: "Discount above limit", PriceOverride: "Price override", Refund: "Refund",
  CreditOverride: "B2B credit limit override",
};

export function RequestApprovalDialog({
  open, onOpenChange, branchId, defaultType, defaultAmount, defaultReason, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branchId: number | null;
  defaultType?: string;
  defaultAmount?: string;
  defaultReason?: string;
  // Fires with the created (still Pending) request — e.g. so a POS screen can hold onto its id and
  // pass it back to checkout once a supervisor approves it, without the cashier re-typing anything.
  onCreated?: (approval: ApprovalRequestDto) => void;
}) {
  const [type, setType] = useState(defaultType ?? "Discount");
  const [amount, setAmount] = useState(defaultAmount ?? "");
  const [reason, setReason] = useState(defaultReason ?? "");
  const createApproval = useCreateApproval();

  function reset() {
    setType(defaultType ?? "Discount");
    setAmount(defaultAmount ?? "");
    setReason(defaultReason ?? "");
  }

  // The dialog instance is reused across opens with different defaults (e.g. PosCheckout pre-fills a
  // fresh discount amount each time) — re-sync on every open rather than only at mount.
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const amountValid = Number.isFinite(Number(amount)) && Number(amount) > 0;

  async function submit() {
    if (!branchId || !reason.trim() || !amountValid) return;
    try {
      const created = await createApproval.mutateAsync({ type, branchId, amount: Number(amount), reason: reason.trim() });
      toast.success("Approval requested", { description: "A supervisor will review this shortly." });
      onCreated?.(created);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit this request.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Request Approval</DialogTitle></DialogHeader>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (ر.س) <span className="text-critical">*</span></label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason <span className="text-critical">*</span></label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 12% discount requested by contractor above my approval cap" />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!reason.trim() || !amountValid || createApproval.isPending} onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {createApproval.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
