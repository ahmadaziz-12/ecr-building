import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateApproval } from "@/lib/api/pos";

const TYPES = ["Discount", "PriceOverride", "Refund"];
const TYPE_LABELS: Record<string, string> = { Discount: "Discount above limit", PriceOverride: "Price override", Refund: "Refund" };

export function RequestApprovalDialog({ open, onOpenChange, branchId }: { open: boolean; onOpenChange: (v: boolean) => void; branchId: number | null }) {
  const [type, setType] = useState("Discount");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const createApproval = useCreateApproval();

  function reset() {
    setType("Discount");
    setAmount("");
    setReason("");
  }

  async function submit() {
    if (!branchId || !reason.trim()) return;
    try {
      await createApproval.mutateAsync({ type, branchId, amount: Number(amount) || 0, reason: reason.trim() });
      toast.success("Approval requested", { description: "A supervisor will review this shortly." });
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
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (ر.س)</label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason <span className="text-critical">*</span></label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 12% discount requested by contractor above my approval cap" />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!reason.trim() || createApproval.isPending} onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {createApproval.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
