import { useEffect, useState } from "react";
import { Banknote, Building2, Check, CreditCard, Gift, Loader2, Split } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerDto, PaymentInput } from "@/lib/api/pos";
import { useLoyaltyConfig } from "@/lib/api/pos";

const QUICK_CASH = [50, 100, 200, 500, 1000];
const CARD_METHODS = [
  { value: "Mada", label: "Mada" },
  { value: "ApplePay", label: "Apple Pay" },
  { value: "StcPay", label: "STC Pay" },
  { value: "Transfer", label: "Bank Transfer" },
];

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

const B2B_TYPES = new Set(["Contractor", "B2B"]);

export function PaymentDialog({
  open,
  onOpenChange,
  total,
  onCharge,
  customer,
  initialTab = "cash",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  onCharge: (payments: PaymentInput[]) => Promise<void>;
  // Account Credit (BRD §4.2) is only offered when a B2B/Contractor customer is attached — the
  // backend enforces the credit-limit check regardless, this just hides the tab otherwise.
  customer?: CustomerDto | null;
  // The cart's own "Redeem Points" shortcut (BRD §4.3.3: the redeem control must be visible at
  // checkout, not buried behind a generic Charge button) opens straight to the Points tab.
  initialTab?: "cash" | "card" | "split" | "account" | "points";
}) {
  const [tab, setTab] = useState<"cash" | "card" | "split" | "account" | "points">(initialTab);
  const accountEligible = Boolean(customer && B2B_TYPES.has(customer.type));
  const availableCredit = customer ? customer.creditLimit - customer.outstanding : 0;
  // The raw prop is an unrounded float sum (e.g. 11.5345). Every user-facing amount — including the
  // prefilled/"Exact" tender — is the 2-dp figure, so comparisons and charges must use the SAME
  // rounded number or exact cash reads as an underpayment and Confirm stays disabled.
  const totalDue = Math.round(total * 100) / 100;
  const [cashGiven, setCashGiven] = useState("");
  const [cardMethod, setCardMethod] = useState("Mada");
  const [cardStatus, setCardStatus] = useState<"idle" | "waiting" | "success" | "failed">("idle");
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // BRD §4.3.3: points redemption as a distinct, partial-payment line — the leftover (if any) is
  // covered by a second real payment method, same pattern as the Split tab.
  const { data: loyaltyConfig } = useLoyaltyConfig(open);
  const pointsPerSar = loyaltyConfig?.pointsPerSarRedeemed ?? 100;
  const minRedeemPoints = loyaltyConfig?.minRedeemPoints ?? 500;
  const maxRedeemPct = loyaltyConfig?.maxRedeemPctOfTotal ?? 20;
  const pointsEligible = Boolean(customer?.loyaltyEnrolled);
  const balanceSar = customer ? customer.loyaltyPoints / pointsPerSar : 0;
  const minRedeemSar = minRedeemPoints / pointsPerSar;
  const maxRedeemSar = Math.min(balanceSar, totalDue * (maxRedeemPct / 100));
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeemRemainderMethod, setRedeemRemainderMethod] = useState<"Cash" | "Mada">("Cash");

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setCashGiven(totalDue.toFixed(2));
      setCardStatus("idle");
      setSplitCash("");
      setSplitCard("");
      setRedeemAmount("");
      setRedeemRemainderMethod("Cash");
      setErrorMsg(null);
    }
  }, [open, totalDue, initialTab]);

  const redeemAmt = Number(redeemAmount) || 0;
  const redeemRemainder = Math.max(0, Math.round((totalDue - redeemAmt) * 100) / 100);
  const redeemBelowMin = redeemAmt > 0 && redeemAmt < minRedeemSar;
  const redeemAboveMax = redeemAmt > maxRedeemSar + 0.001;
  const redeemValid = redeemAmt > 0 && !redeemBelowMin && !redeemAboveMax;

  const received = Number(cashGiven) || 0;
  const exchange = Math.max(0, received - totalDue);
  const splitCashAmt = Number(splitCash) || 0;
  const splitCardAmt = Number(splitCard) || 0;
  const splitSum = splitCashAmt + splitCardAmt;
  const splitOk = Math.abs(splitSum - totalDue) < 0.01;

  async function charge(payments: PaymentInput[]) {
    setProcessing(true);
    setErrorMsg(null);
    setCardStatus("waiting");
    try {
      await onCharge(payments);
      setCardStatus("success");
      setTimeout(() => onOpenChange(false), 500);
    } catch (err) {
      setCardStatus("failed");
      setErrorMsg(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !processing && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Charge {money(totalDue)}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList
            className={`grid w-full ${
              accountEligible && pointsEligible ? "grid-cols-5" : accountEligible || pointsEligible ? "grid-cols-4" : "grid-cols-3"
            }`}
          >
            <TabsTrigger value="cash" className="gap-1.5"><Banknote className="h-3.5 w-3.5" /> Cash</TabsTrigger>
            <TabsTrigger value="card" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Card</TabsTrigger>
            <TabsTrigger value="split" className="gap-1.5"><Split className="h-3.5 w-3.5" /> Split</TabsTrigger>
            {accountEligible && (
              <TabsTrigger value="account" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Account</TabsTrigger>
            )}
            {pointsEligible && (
              <TabsTrigger value="points" className="gap-1.5"><Gift className="h-3.5 w-3.5" /> Points</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="cash" className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer Gives</label>
              <Input type="number" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} className="h-11 text-lg font-semibold" />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_CASH.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setCashGiven(String(amt))}
                  className="rounded-lg border border-black/10 bg-canvas py-1.5 text-xs font-medium hover:border-brand/40 hover:bg-brand/5"
                >
                  {amt}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCashGiven(totalDue.toFixed(2))}
                className="rounded-lg border border-brand/30 bg-brand/5 py-1.5 text-xs font-medium text-brand hover:bg-brand/10"
              >
                Exact
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-sm">
              <span className="text-muted-foreground">Exchange due</span>
              <span className="font-display text-base font-bold text-foreground">{money(exchange)}</span>
            </div>
            {errorMsg && <p className="text-xs text-critical">{errorMsg}</p>}
            <Button
              className="h-11 w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={received < totalDue || processing}
              onClick={() => charge([{ method: "Cash", amount: totalDue }])}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm Cash Payment
            </Button>
          </TabsContent>

          <TabsContent value="card" className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Method</label>
              <div className="grid grid-cols-2 gap-1.5">
                {CARD_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setCardMethod(m.value)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      cardMethod === m.value ? "border-brand bg-brand text-brand-foreground" : "border-black/10 bg-white hover:border-brand/40"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-black/10 bg-canvas p-3 text-center text-xs">
              {cardStatus === "idle" && <p className="text-muted-foreground">Card machine: Geidea Terminal — ready</p>}
              {cardStatus === "waiting" && (
                <p className="flex items-center justify-center gap-1.5 text-brand"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for card…</p>
              )}
              {cardStatus === "success" && <p className="flex items-center justify-center gap-1.5 text-success"><Check className="h-3.5 w-3.5" /> Approved</p>}
              {cardStatus === "failed" && <p className="text-critical">{errorMsg ?? "Declined — try again"}</p>}
            </div>
            <Button
              className="h-11 w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={processing}
              onClick={() => charge([{ method: cardMethod, amount: totalDue }])}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm Card Payment
            </Button>
          </TabsContent>

          <TabsContent value="split" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cash</label>
                <Input type="number" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Card (Mada)</label>
                <Input type="number" value={splitCard} onChange={(e) => setSplitCard(e.target.value)} className="h-10" />
              </div>
            </div>
            <div className={`rounded-lg px-3 py-2 text-xs font-medium ${splitOk ? "bg-success/10 text-success" : "bg-warning/15 text-[oklch(0.4_0.13_70)]"}`}>
              {splitOk ? `Sum ✓ ${money(splitSum)}` : `Need ${money(totalDue - splitSum)} more to match total`}
            </div>
            {errorMsg && <p className="text-xs text-critical">{errorMsg}</p>}
            <Button
              className="h-11 w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={!splitOk || processing}
              onClick={() => charge([{ method: "Cash", amount: splitCashAmt }, { method: "Mada", amount: splitCardAmt }])}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm Split Payment
            </Button>
          </TabsContent>

          {accountEligible && customer && (
            <TabsContent value="account" className="mt-4 space-y-3">
              <div className="rounded-lg border border-black/10 bg-canvas p-3 text-xs">
                <div className="flex justify-between text-muted-foreground"><span>Credit limit</span><span>{money(customer.creditLimit)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Outstanding</span><span>{money(customer.outstanding)}</span></div>
                <div className="mt-1 flex justify-between border-t border-black/5 pt-1 font-semibold text-foreground">
                  <span>Available credit</span><span>{money(Math.max(0, availableCredit))}</span>
                </div>
              </div>
              {totalDue > availableCredit && (
                <p className="text-xs text-warning">
                  This charge exceeds {customer.nameEn}'s available credit — checkout will ask for supervisor approval.
                </p>
              )}
              {errorMsg && <p className="text-xs text-critical">{errorMsg}</p>}
              <Button
                className="h-11 w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
                disabled={processing}
                onClick={() => charge([{ method: "AccountCredit", amount: totalDue }])}
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Charge to Account
              </Button>
            </TabsContent>
          )}

          {pointsEligible && customer && (
            <TabsContent value="points" className="mt-4 space-y-3">
              <div className="rounded-lg border border-black/10 bg-canvas p-3 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Points balance</span><span>{customer.loyaltyPoints.toLocaleString("en-US")} pts ({money(balanceSar)})</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Redeemable this sale</span><span>Up to {money(maxRedeemSar)} ({maxRedeemPct}% of total)</span>
                </div>
              </div>

              {customer.loyaltyPoints < minRedeemPoints ? (
                <p className="text-xs text-muted-foreground">
                  {customer.nameEn} needs at least {minRedeemPoints.toLocaleString("en-US")} points ({money(minRedeemSar)}) to redeem.
                </p>
              ) : (
                <>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Redeem (ر.س) — min {money(minRedeemSar)}
                    </label>
                    <div className="flex gap-1.5">
                      <Input type="number" value={redeemAmount} onChange={(e) => setRedeemAmount(e.target.value)} className="h-10" />
                      <button
                        type="button"
                        onClick={() => setRedeemAmount(maxRedeemSar.toFixed(2))}
                        className="shrink-0 rounded-lg border border-brand/30 bg-brand/5 px-3 text-xs font-medium text-brand hover:bg-brand/10"
                      >
                        Max
                      </button>
                    </div>
                    {redeemBelowMin && <p className="mt-1 text-[11px] text-critical">Minimum redemption is {money(minRedeemSar)}.</p>}
                    {redeemAboveMax && <p className="mt-1 text-[11px] text-critical">Maximum redemption is {money(maxRedeemSar)}.</p>}
                  </div>

                  {redeemValid && redeemRemainder > 0 && (
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Remaining {money(redeemRemainder)} via
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(["Cash", "Mada"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setRedeemRemainderMethod(m)}
                            className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                              redeemRemainderMethod === m ? "border-brand bg-brand text-brand-foreground" : "border-black/10 bg-white hover:border-brand/40"
                            }`}
                          >
                            {m === "Cash" ? "Cash" : "Card (Mada)"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {errorMsg && <p className="text-xs text-critical">{errorMsg}</p>}
                  <Button
                    className="h-11 w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
                    disabled={!redeemValid || processing}
                    onClick={() =>
                      charge(
                        redeemRemainder > 0
                          ? [{ method: "Loyalty", amount: redeemAmt }, { method: redeemRemainderMethod, amount: redeemRemainder }]
                          : [{ method: "Loyalty", amount: redeemAmt }],
                      )
                    }
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm Points Payment
                  </Button>
                </>
              )}
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
