import { useEffect, useState } from "react";
import { Banknote, Check, CreditCard, Loader2, Split } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PaymentInput } from "@/lib/api/pos";

const QUICK_CASH = [50, 100, 200, 500, 1000];
const CARD_METHODS = [
  { value: "Mada", label: "Mada" },
  { value: "ApplePay", label: "Apple Pay" },
  { value: "StcPay", label: "STC Pay" },
  { value: "Transfer", label: "Bank Transfer" },
];

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

export function PaymentDialog({
  open,
  onOpenChange,
  total,
  onCharge,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  onCharge: (payments: PaymentInput[]) => Promise<void>;
}) {
  const [tab, setTab] = useState<"cash" | "card" | "split">("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [cardMethod, setCardMethod] = useState("Mada");
  const [cardStatus, setCardStatus] = useState<"idle" | "waiting" | "success" | "failed">("idle");
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab("cash");
      setCashGiven(total.toFixed(2));
      setCardStatus("idle");
      setSplitCash("");
      setSplitCard("");
      setErrorMsg(null);
    }
  }, [open, total]);

  const received = Number(cashGiven) || 0;
  const exchange = Math.max(0, received - total);
  const splitCashAmt = Number(splitCash) || 0;
  const splitCardAmt = Number(splitCard) || 0;
  const splitSum = splitCashAmt + splitCardAmt;
  const splitOk = Math.abs(splitSum - total) < 0.01;

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
          <DialogTitle>Charge {money(total)}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cash" className="gap-1.5"><Banknote className="h-3.5 w-3.5" /> Cash</TabsTrigger>
            <TabsTrigger value="card" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Card</TabsTrigger>
            <TabsTrigger value="split" className="gap-1.5"><Split className="h-3.5 w-3.5" /> Split</TabsTrigger>
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
                onClick={() => setCashGiven(total.toFixed(2))}
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
              disabled={received < total || processing}
              onClick={() => charge([{ method: "Cash", amount: total }])}
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
              onClick={() => charge([{ method: cardMethod, amount: total }])}
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
              {splitOk ? `Sum ✓ ${money(splitSum)}` : `Need ${money(total - splitSum)} more to match total`}
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
