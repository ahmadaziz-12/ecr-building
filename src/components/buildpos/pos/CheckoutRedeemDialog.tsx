import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerDto, LoyaltyConfigDto } from "@/lib/api/pos";
import { CurrencyText, SARIcon } from "@/lib/buildpos/currency";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

// BRD §4.3.3: redeeming points at checkout is a cart-level action (a tender the cashier locks in
// before Charge, same as picking a discount) — the cart summary shows exactly what it reduced Amount
// Due by, and Charge only ever asks for what's left. Distinct from the standalone
// RedeemPointsDialog on the Loyalty Program admin page, which redeems against the loyalty ledger
// directly and isn't tied to an in-progress sale.
export function CheckoutRedeemDialog({
  open,
  onOpenChange,
  customer,
  loyaltyConfig,
  total,
  currentRedeemed,
  onConfirm,
  onClear,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: CustomerDto;
  loyaltyConfig: LoyaltyConfigDto;
  // The pre-redemption order total (subtotal - discounts + fees + VAT) — redemption is capped at a
  // % of THIS, not of whatever's left after an earlier redemption, so re-opening this dialog to
  // change the amount doesn't compound against itself.
  total: number;
  currentRedeemed: number;
  onConfirm: (amountSar: number) => void;
  onClear: () => void;
}) {
  const pointsPerSar = loyaltyConfig.pointsPerSarRedeemed;
  const minRedeemPoints = loyaltyConfig.minRedeemPoints;
  const maxRedeemPct = loyaltyConfig.maxRedeemPctOfTotal;
  const balanceSar = customer.loyaltyPoints / pointsPerSar;
  const minRedeemSar = minRedeemPoints / pointsPerSar;
  const maxRedeemSar = Math.min(balanceSar, total * (maxRedeemPct / 100));
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (open) setAmount(currentRedeemed > 0 ? currentRedeemed.toFixed(2) : "");
  }, [open, currentRedeemed]);

  const amt = Number(amount) || 0;
  const belowMin = amt > 0 && amt < minRedeemSar;
  const aboveMax = amt > maxRedeemSar + 0.001;
  const valid = amt > 0 && !belowMin && !aboveMax;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Redeem Points</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-black/10 bg-canvas p-3 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Points balance</span>
            <span>
              {customer.loyaltyPoints.toLocaleString("en-US")} pts (<CurrencyText value={money(balanceSar)} />)
            </span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Redeemable this sale</span>
            <span>
              Up to <CurrencyText value={money(maxRedeemSar)} /> ({maxRedeemPct}% of total)
            </span>
          </div>
        </div>

        {customer.loyaltyPoints < minRedeemPoints ? (
          <p className="text-xs text-muted-foreground">
            {customer.nameEn} needs at least {minRedeemPoints.toLocaleString("en-US")} points (
            <CurrencyText value={money(minRedeemSar)} />) to redeem.
          </p>
        ) : (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Redeem (<SARIcon />) — min <CurrencyText value={money(minRedeemSar)} />
            </label>
            <div className="flex gap-1.5">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setAmount(maxRedeemSar.toFixed(2))}
                className="shrink-0 rounded-lg border border-brand/30 bg-brand/5 px-3 text-xs font-medium text-brand hover:bg-brand/10"
              >
                Max
              </button>
            </div>
            {belowMin && (
              <p className="mt-1 text-[11px] text-critical">
                Minimum redemption is <CurrencyText value={money(minRedeemSar)} />.
              </p>
            )}
            {aboveMax && (
              <p className="mt-1 text-[11px] text-critical">
                Maximum redemption is <CurrencyText value={money(maxRedeemSar)} />.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {currentRedeemed > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onClear();
                onOpenChange(false);
              }}
              className="text-critical hover:text-critical"
            >
              Remove redemption
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!valid}
              onClick={() => {
                onConfirm(amt);
                onOpenChange(false);
              }}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
