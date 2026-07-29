import { useEffect, useState } from "react";
import { Banknote, Building2, Check, CreditCard, Loader2, Split } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerDto, PaymentInput } from "@/lib/api/pos";
import { CurrencyText } from "@/lib/buildpos/currency";

const QUICK_CASH = [50, 100, 200, 500, 1000];
const CARD_METHODS = [
  { value: "Mada", label: "Mada" },
  { value: "ApplePay", label: "Apple Pay" },
  { value: "StcPay", label: "STC Pay" },
  { value: "Transfer", label: "Bank Transfer" },
];

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

const B2B_TYPES = new Set(["Contractor", "B2B"]);

// BRD §4.3.3: points redemption happens BEFORE Charge now (see CheckoutRedeemDialog, opened from the
// cart's own "Redeem Points" control) — it shows up as its own row in the cart summary and reduces
// `total` here to Amount Due. This dialog only ever collects a real payment method for whatever's
// left, the same way it always has for Cash/Card/Split/Account — there is no Points tab anymore.
export function PaymentDialog({
  open,
  onOpenChange,
  total,
  onCharge,
  customer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  onCharge: (payments: PaymentInput[]) => Promise<void>;
  // Account Credit (BRD §4.2) is only offered when a B2B/Contractor customer is attached — the
  // backend enforces the credit-limit check regardless, this just hides the tab otherwise.
  customer?: CustomerDto | null;
}) {
  const [tab, setTab] = useState<"cash" | "card" | "split" | "account">("cash");
  const accountEligible = Boolean(customer && B2B_TYPES.has(customer.type));
  const availableCredit = customer ? customer.creditLimit - customer.outstanding : 0;
  // The raw prop is an unrounded float sum (e.g. 11.5345). Every user-facing amount — including the
  // prefilled/"Exact" tender — is the 2-dp figure, so comparisons and charges must use the SAME
  // rounded number or exact cash reads as an underpayment and Confirm stays disabled.
  const totalDue = Math.round(total * 100) / 100;
  // Starts empty, like the card method below: a pre-filled exact amount rendered "Exact" as a
  // permanently highlighted button nobody had pressed, so the tender looked already chosen. The
  // cashier types the amount or presses a denomination, and only then does Confirm come alive.
  const [cashGiven, setCashGiven] = useState("");
  // Deliberately empty, not "Mada": a pre-filled default rendered as a solid brand-filled button
  // the cashier had never touched, so the card type looked already confirmed. Nothing is selected
  // until someone selects it, and Confirm stays disabled until then.
  const [cardMethod, setCardMethod] = useState("");
  const [cardStatus, setCardStatus] = useState<"idle" | "waiting" | "success" | "failed">("idle");
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab("cash");
      setCashGiven("");
      setCardMethod("");
      setCardStatus("idle");
      setSplitCash("");
      setSplitCard("");
      setErrorMsg(null);
    }
  }, [open, totalDue]);

  const exactCash = totalDue.toFixed(2);
  const cashEntered = cashGiven.trim() !== "";
  const received = Number(cashGiven) || 0;
  const exchange = Math.max(0, received - totalDue);
  // A tender is only "chosen" once it covers the total — that's the same condition Confirm enables
  // on, so the highlighted button and the live button always agree.
  const cashValid = cashEntered && Number.isFinite(Number(cashGiven)) && received >= totalDue;
  const splitCashAmt = Number(splitCash) || 0;
  const splitCardAmt = Number(splitCard) || 0;
  const splitSum = splitCashAmt + splitCardAmt;
  const splitOk = splitCashAmt >= 0 && splitCardAmt >= 0 && Math.abs(splitSum - totalDue) < 0.01;

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
          <DialogTitle>Charge <CurrencyText value={money(totalDue)} /></DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className={`grid w-full ${accountEligible ? "grid-cols-4" : "grid-cols-3"}`}>
            <TabsTrigger value="cash" className="gap-1.5"><Banknote className="h-3.5 w-3.5" /> Cash</TabsTrigger>
            <TabsTrigger value="card" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Card</TabsTrigger>
            <TabsTrigger value="split" className="gap-1.5"><Split className="h-3.5 w-3.5" /> Split</TabsTrigger>
            {accountEligible && (
              <TabsTrigger value="account" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Account</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="cash" className="mt-4 space-y-3">
            <div>
              <label htmlFor="cash-given" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer Gives</label>
              <Input
                id="cash-given"
                type="number"
                value={cashGiven}
                onChange={(e) => setCashGiven(e.target.value)}
                placeholder="Enter amount or pick one below"
                className="h-11 text-lg font-semibold"
              />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_CASH.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  aria-pressed={cashGiven === String(amt)}
                  onClick={() => setCashGiven(String(amt))}
                  className={`rounded-lg border py-1.5 text-xs font-medium transition ${
                    cashGiven === String(amt)
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-black/10 bg-canvas hover:border-brand/40 hover:bg-brand/5"
                  }`}
                >
                  {amt}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={cashGiven === exactCash}
                onClick={() => setCashGiven(exactCash)}
                className={`rounded-lg border py-1.5 text-xs font-medium transition ${
                  cashGiven === exactCash
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-black/10 bg-canvas hover:border-brand/40 hover:bg-brand/5"
                }`}
              >
                Exact
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-sm">
              <span className="text-muted-foreground">Exchange due</span>
              <span className="font-display text-base font-bold text-foreground"><CurrencyText value={money(exchange)} /></span>
            </div>
            {cashEntered && !cashValid && (
              <p className="text-xs text-critical">
                Short by <CurrencyText value={money(Math.max(0, totalDue - received))} /> — the tender must cover the total.
              </p>
            )}
            {errorMsg && <p className="text-xs text-critical">{errorMsg}</p>}
            <Button
              className="h-11 w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={!cashValid || processing}
              onClick={() => charge([{ method: "Cash", amount: totalDue }])}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{" "}
              {cashEntered ? "Confirm Cash Payment" : "Enter the cash received"}
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
              {cardStatus === "idle" && <p className="text-muted-foreground">{cardMethod ? "Card machine: Geidea Terminal — ready" : "Choose the card method the customer is paying with."}</p>}
              {cardStatus === "waiting" && (
                <p className="flex items-center justify-center gap-1.5 text-brand"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for card…</p>
              )}
              {cardStatus === "success" && <p className="flex items-center justify-center gap-1.5 text-success"><Check className="h-3.5 w-3.5" /> Approved</p>}
              {cardStatus === "failed" && <p className="text-critical">{errorMsg ?? "Declined — try again"}</p>}
            </div>
            <Button
              className="h-11 w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={!cardMethod || processing}
              onClick={() => charge([{ method: cardMethod, amount: totalDue }])}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {cardMethod ? "Confirm Card Payment" : "Select a card method"}
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
              {splitOk ? <>Sum ✓ <CurrencyText value={money(splitSum)} /></> : <>Need <CurrencyText value={money(totalDue - splitSum)} /> more to match total</>}
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
                <div className="flex justify-between text-muted-foreground"><span>Credit limit</span><span><CurrencyText value={money(customer.creditLimit)} /></span></div>
                <div className="flex justify-between text-muted-foreground"><span>Outstanding</span><span><CurrencyText value={money(customer.outstanding)} /></span></div>
                <div className="mt-1 flex justify-between border-t border-black/5 pt-1 font-semibold text-foreground">
                  <span>Available credit</span><span><CurrencyText value={money(Math.max(0, availableCredit))} /></span>
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
