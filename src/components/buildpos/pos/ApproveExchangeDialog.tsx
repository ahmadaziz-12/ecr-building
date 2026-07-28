import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranches } from "@/lib/api/admin";
import { useApproveReturn, type ReturnDto } from "@/lib/api/finance";

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
const PAYMENT_METHODS = ["Cash", "Mada", "ApplePay", "StcPay", "Transfer"];

// BRD §3.2.1 exchange workflow: approving an Exchange settles the NET difference between the
// returned item's credit and the replacement item(s)' total — a dedicated dialog because (unlike
// every other return type) it needs a real payment step, not just a text-field flow.
export function ApproveExchangeDialog({ returnRecord, onClose }: { returnRecord: ReturnDto | null; onClose: () => void }) {
  const { data: branches } = useBranches(returnRecord !== null);
  const approveReturn = useApproveReturn();
  const [branchName, setBranchName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  useEffect(() => {
    if (returnRecord) setBranchName(returnRecord.branchName ?? "");
  }, [returnRecord]);

  if (!returnRecord) return null;

  const exchangeTotal = returnRecord.exchangeLines.reduce((s, l) => s + l.lineTotal, 0);
  const netPayable = returnRecord.exchangeNetPayable ?? exchangeTotal - returnRecord.totalAmount;
  const customerOwes = netPayable > 0;
  const customerRefunded = netPayable < 0;

  async function confirm() {
    if (!returnRecord) return;
    const branch = branches?.find((b) => b.nameEn.toLowerCase() === branchName.toLowerCase());
    if (!branch) {
      toast.error("Select the branch restocking the returned item.");
      return;
    }
    try {
      await approveReturn.mutateAsync({
        id: returnRecord.id,
        branchId: branch.id,
        payments: customerOwes ? [{ method: paymentMethod, amount: Math.abs(netPayable) }] : undefined,
      });
      toast.success("Exchange completed", {
        description: customerOwes
          ? `Collected ${money(Math.abs(netPayable))} from the customer.`
          : customerRefunded
            ? `Refunded ${money(Math.abs(netPayable))} to the customer.`
            : "Even swap — nothing owed either way.",
      });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete the exchange.");
    }
  }

  return (
    <Dialog open={returnRecord !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete Exchange · {returnRecord.returnNo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 rounded-lg bg-canvas p-3 text-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Returned item(s)</p>
          {returnRecord.lines.map((l) => (
            <div key={l.productId} className="flex justify-between"><span>{l.productName} × {l.qty}</span><span className="font-mono">{money(l.amount)}</span></div>
          ))}
          <div className="flex justify-between border-t border-black/10 pt-1 font-semibold"><span>Return credit</span><span className="font-mono">{money(returnRecord.totalAmount)}</span></div>

          <p className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Replacement item(s)</p>
          {returnRecord.exchangeLines.map((l) => (
            <div key={l.productId} className="flex justify-between"><span>{l.productName} × {l.qty}</span><span className="font-mono">{money(l.lineTotal)}</span></div>
          ))}
          <div className="flex justify-between border-t border-black/10 pt-1 font-semibold"><span>Replacement total</span><span className="font-mono">{money(exchangeTotal)}</span></div>

          <div className={`flex justify-between border-t border-black/10 pt-1.5 text-sm font-bold ${customerOwes ? "text-critical" : customerRefunded ? "text-success" : ""}`}>
            <span>{customerOwes ? "Customer pays" : customerRefunded ? "Customer is refunded" : "Even exchange"}</span>
            <span className="font-mono">{money(Math.abs(netPayable))}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Restock To Branch</label>
            <Select value={branchName} onValueChange={setBranchName}>
              <SelectTrigger><SelectValue placeholder="Select branch…" /></SelectTrigger>
              <SelectContent>
                {branches?.map((b) => <SelectItem key={b.id} value={b.nameEn}>{b.nameEn}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {customerOwes && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Method</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {customerOwes && (
          <Input value={money(Math.abs(netPayable))} disabled className="h-9 font-mono" />
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!branchName || approveReturn.isPending}
            onClick={confirm}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {approveReturn.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Complete Exchange"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
