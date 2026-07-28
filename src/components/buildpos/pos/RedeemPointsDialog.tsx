import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
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
import { useCustomerLoyalty, useLoyaltyProgramConfig, useRedeemPoints } from "@/lib/api/loyalty";
import type { CustomerDto } from "@/lib/api/pos";

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
  const [customerSearch, setCustomerSearch] = useState("");
  const [points, setPoints] = useState("");
  const [description, setDescription] = useState("");
  const redeem = useRedeemPoints();

  useEffect(() => {
    if (open) { setCustomerId(initialCustomerId ? String(initialCustomerId) : ""); setCustomerSearch(""); }
  }, [open, initialCustomerId]);

  const selectedId = customerId ? Number(customerId) : null;
  const selectedCustomer = customers.find((c) => c.id === selectedId) ?? null;

  // Same substring-search combobox pattern used at POS checkout — a name/phone dropdown scales far
  // better than a native select once the customer list runs into the hundreds.
  const customerSuggestions = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (term.length < 1) return [];
    return customers
      .filter((c) => c.nameEn.toLowerCase().includes(term)
        || (c.nameAr ?? "").toLowerCase().includes(term)
        || (c.phone ?? "").includes(term))
      .slice(0, 8);
  }, [customerSearch, customers]);
  const { data: summary } = useCustomerLoyalty(selectedId);
  const { data: config } = useLoyaltyProgramConfig();
  const sarPerPoint = config ? 1 / config.pointsPerSarRedeemed : 0.01;
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
        <div className="relative">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Customer <span className="text-critical">*</span>
          </label>
          {selectedCustomer ? (
            <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-black/10 bg-white px-3 text-sm">
              <span className="truncate">{selectedCustomer.nameEn} — {selectedCustomer.loyaltyPoints} pts</span>
              <button
                type="button"
                onClick={() => { setCustomerId(""); setCustomerSearch(""); }}
                className="grid h-5 w-5 flex-none place-items-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <Input
              className="h-9"
              placeholder="Search by name or phone…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
          )}
          {!selectedCustomer && customerSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
              {customerSuggestions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCustomerId(String(c.id)); setCustomerSearch(""); }}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-brand/5"
                >
                  <span className="truncate font-medium text-foreground">{c.nameEn}</span>
                  <span className="ml-2 flex-none text-[10px] text-muted-foreground">
                    {c.loyaltyPoints} pts{c.phone ? ` · ${c.phone}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
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
              {summary.points} points available (≈ {summary.pointsValue.toFixed(2)} ر.س)
              {pointsNum > 0 &&
                !insufficientBalance &&
                ` · redeems for ${(pointsNum * sarPerPoint).toFixed(2)} ر.س`}
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
