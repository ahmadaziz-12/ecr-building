import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomerLoyalty, useRedeemPoints } from "@/lib/api/loyalty";
import type { CustomerDto } from "@/lib/api/pos";

const SAR_PER_POINT = 0.1;

export function RedeemPointsDialog({
  open,
  onOpenChange,
  customers,
  initialCustomerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customers: CustomerDto[];
  initialCustomerId?: number | null;
}) {
  const [customerId, setCustomerId] = useState<string>("");
  const [points, setPoints] = useState("");
  const [description, setDescription] = useState("");
  const redeem = useRedeemPoints();

  useEffect(() => {
    if (open) setCustomerId(initialCustomerId ? String(initialCustomerId) : "");
  }, [open, initialCustomerId]);

  const selectedId = customerId ? Number(customerId) : null;
  const { data: summary } = useCustomerLoyalty(selectedId);
  const pointsNum = Number(points) || 0;
  const insufficientBalance = summary !== undefined && pointsNum > summary.points;

  async function submit() {
    if (!selectedId || pointsNum <= 0) return;
    try {
      const result = await redeem.mutateAsync({
        customerId: selectedId,
        points: pointsNum,
        description: description.trim() || undefined,
      });
      toast.success(`Redeemed ${pointsNum} points — ${result.points} remaining`);
      setPoints("");
      setDescription("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not redeem these points.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Redeem Points</DialogTitle>
        </DialogHeader>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Customer <span className="text-critical">*</span>
          </label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select a loyalty member" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.nameEn} — {c.loyaltyPoints} pts
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Points to Redeem <span className="text-critical">*</span>
          </label>
          <Input
            type="number"
            min={1}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            autoFocus
          />
          {summary && (
            <p
              className={`mt-1 text-xs ${insufficientBalance ? "text-critical" : "text-muted-foreground"}`}
            >
              {summary.points} points available (≈ {(summary.points * SAR_PER_POINT).toFixed(2)}{" "}
              ر.س)
              {pointsNum > 0 &&
                !insufficientBalance &&
                ` · redeems for ${(pointsNum * SAR_PER_POINT).toFixed(2)} ر.س`}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reason
          </label>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Redeemed against invoice settlement…"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!selectedId || pointsNum <= 0 || insufficientBalance || redeem.isPending}
            onClick={submit}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {redeem.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Redeem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
