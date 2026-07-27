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
import { useUpdateLoyaltyProgramConfig, type LoyaltyConfigDto } from "@/lib/api/loyalty";

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-brand">{children}</p>;
}

type FormState = {
  earnRate: string; redeemRate: string; minPoints: string; maxPct: string;
  silverThreshold: string; goldThreshold: string; platinumThreshold: string;
  silverMultiplier: string; goldMultiplier: string; platinumMultiplier: string;
  silverDiscount: string; goldDiscount: string; platinumDiscount: string;
  freeDeliveryMin: string; birthdayMultiplier: string; expiryMonths: string;
};

function toForm(c: LoyaltyConfigDto): FormState {
  return {
    earnRate: String(c.pointsPerSarEarned), redeemRate: String(c.pointsPerSarRedeemed),
    minPoints: String(c.minRedeemPoints), maxPct: String(c.maxRedeemPctOfTotal),
    silverThreshold: String(c.silverThreshold), goldThreshold: String(c.goldThreshold), platinumThreshold: String(c.platinumThreshold),
    silverMultiplier: String(c.silverMultiplier), goldMultiplier: String(c.goldMultiplier), platinumMultiplier: String(c.platinumMultiplier),
    silverDiscount: String(c.silverDiscountPct), goldDiscount: String(c.goldDiscountPct), platinumDiscount: String(c.platinumDiscountPct),
    freeDeliveryMin: String(c.freeDeliveryMinOrderSar), birthdayMultiplier: String(c.birthdayBonusMultiplier), expiryMonths: String(c.pointsExpiryMonths),
  };
}

export function LoyaltyProgramSettingsDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: LoyaltyConfigDto;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(config));
  const update = useUpdateLoyaltyProgramConfig();
  const set = <K extends keyof FormState>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) setForm(toForm(config));
  }, [open, config]);

  const n = (s: string) => Number(s);
  const valid =
    n(form.earnRate) > 0 && n(form.redeemRate) > 0 && n(form.minPoints) >= 0 && n(form.maxPct) > 0 && n(form.maxPct) <= 100 &&
    n(form.silverThreshold) > 0 && n(form.goldThreshold) > n(form.silverThreshold) && n(form.platinumThreshold) > n(form.goldThreshold) &&
    n(form.silverMultiplier) >= 1 && n(form.goldMultiplier) >= n(form.silverMultiplier) && n(form.platinumMultiplier) >= n(form.goldMultiplier) &&
    n(form.silverDiscount) >= 0 && n(form.goldDiscount) >= n(form.silverDiscount) && n(form.platinumDiscount) >= n(form.goldDiscount) && n(form.platinumDiscount) <= 100 &&
    n(form.freeDeliveryMin) >= 0 && n(form.birthdayMultiplier) >= 1 && Number.isInteger(n(form.expiryMonths)) && n(form.expiryMonths) > 0;

  async function submit() {
    if (!valid) return;
    try {
      await update.mutateAsync({
        pointsPerSarEarned: n(form.earnRate), pointsPerSarRedeemed: n(form.redeemRate),
        minRedeemPoints: Math.round(n(form.minPoints)), maxRedeemPctOfTotal: n(form.maxPct),
        silverThreshold: n(form.silverThreshold), goldThreshold: n(form.goldThreshold), platinumThreshold: n(form.platinumThreshold),
        silverMultiplier: n(form.silverMultiplier), goldMultiplier: n(form.goldMultiplier), platinumMultiplier: n(form.platinumMultiplier),
        silverDiscountPct: n(form.silverDiscount), goldDiscountPct: n(form.goldDiscount), platinumDiscountPct: n(form.platinumDiscount),
        freeDeliveryMinOrderSar: n(form.freeDeliveryMin), birthdayBonusMultiplier: n(form.birthdayMultiplier),
        pointsExpiryMonths: Math.round(n(form.expiryMonths)),
      });
      toast.success("Loyalty program settings updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save these settings.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Loyalty Program Settings</DialogTitle>
        </DialogHeader>

        <SectionLabel>Earning &amp; Redemption</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Points earned / SAR 1" hint="BRD default: 1">
            <Input type="number" step="0.01" value={form.earnRate} onChange={(e) => set("earnRate", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Points needed / SAR 1 redeemed" hint="BRD default: 100">
            <Input type="number" step="1" value={form.redeemRate} onChange={(e) => set("redeemRate", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Minimum points to redeem" hint="BRD default: 500 (= SAR 5)">
            <Input type="number" step="1" value={form.minPoints} onChange={(e) => set("minPoints", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Max redemption (% of total)" hint="BRD default: 20%">
            <Input type="number" step="1" min="1" max="100" value={form.maxPct} onChange={(e) => set("maxPct", e.target.value)} className="h-9" />
          </FormField>
        </div>

        <SectionLabel>Tier Thresholds — cumulative spend (SAR)</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Silver at" hint="Default: 5,000">
            <Input type="number" step="100" value={form.silverThreshold} onChange={(e) => set("silverThreshold", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Gold at" hint="Default: 20,000">
            <Input type="number" step="100" value={form.goldThreshold} onChange={(e) => set("goldThreshold", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Platinum at" hint="Default: 50,000">
            <Input type="number" step="100" value={form.platinumThreshold} onChange={(e) => set("platinumThreshold", e.target.value)} className="h-9" />
          </FormField>
        </div>

        <SectionLabel>Points Multipliers</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Silver" hint="Default: 1.5x">
            <Input type="number" step="0.1" min="1" value={form.silverMultiplier} onChange={(e) => set("silverMultiplier", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Gold" hint="Default: 2x">
            <Input type="number" step="0.1" min="1" value={form.goldMultiplier} onChange={(e) => set("goldMultiplier", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Platinum" hint="Default: 3x">
            <Input type="number" step="0.1" min="1" value={form.platinumMultiplier} onChange={(e) => set("platinumMultiplier", e.target.value)} className="h-9" />
          </FormField>
        </div>

        <SectionLabel>Automatic Checkout Discount</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Silver %" hint="Default: 5%">
            <Input type="number" step="1" min="0" max="100" value={form.silverDiscount} onChange={(e) => set("silverDiscount", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Gold %" hint="Default: 10%">
            <Input type="number" step="1" min="0" max="100" value={form.goldDiscount} onChange={(e) => set("goldDiscount", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Platinum %" hint="Default: 15%">
            <Input type="number" step="1" min="0" max="100" value={form.platinumDiscount} onChange={(e) => set("platinumDiscount", e.target.value)} className="h-9" />
          </FormField>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Discount is the larger of the tier discount and a contractor's trade discount — they don't stack.
        </p>

        <SectionLabel>Other Benefits</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Free delivery min (SAR)" hint="Silver+, default 500">
            <Input type="number" step="10" min="0" value={form.freeDeliveryMin} onChange={(e) => set("freeDeliveryMin", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Birthday bonus" hint="Default: 2x, stacks on tier">
            <Input type="number" step="0.5" min="1" value={form.birthdayMultiplier} onChange={(e) => set("birthdayMultiplier", e.target.value)} className="h-9" />
          </FormField>
          <FormField label="Points expiry (months)" hint="Default: 12">
            <Input type="number" step="1" min="1" value={form.expiryMonths} onChange={(e) => set("expiryMonths", e.target.value)} className="h-9" />
          </FormField>
        </div>

        {!valid && (
          <p className="text-[11px] text-critical">
            Check the values above — thresholds/multipliers/discounts must each increase Silver → Gold → Platinum, and every rate must be within its valid range.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid || update.isPending}
            onClick={submit}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
