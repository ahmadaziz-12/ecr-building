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
import { useAdjustPoints } from "@/lib/api/loyalty";
import type { CustomerDto } from "@/lib/api/pos";

export function AdjustPointsDialog({
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
  const adjust = useAdjustPoints();

  useEffect(() => {
    if (open) setCustomerId(initialCustomerId ? String(initialCustomerId) : "");
  }, [open, initialCustomerId]);

  const pointsNum = Number(points) || 0;

  async function submit() {
    if (!customerId || pointsNum === 0 || !description.trim()) return;
    try {
      const result = await adjust.mutateAsync({
        customerId: Number(customerId),
        points: pointsNum,
        description: description.trim(),
      });
      toast.success(`Balance adjusted — ${result.points} points now`);
      setPoints("");
      setDescription("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not adjust this balance.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Points Balance</DialogTitle>
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
            Points (+ or −) <span className="text-critical">*</span>
          </label>
          <Input
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="e.g. 50 or -50"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reason <span className="text-critical">*</span>
          </label>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Goodwill gesture, data correction…"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!customerId || pointsNum === 0 || !description.trim() || adjust.isPending}
            onClick={submit}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {adjust.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Save Adjustment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
