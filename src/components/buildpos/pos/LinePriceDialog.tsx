import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Runtime price customisation for a single cart line: instead of two separate hidden inputs
// (absolute override vs. discount %), the cashier gets one panel with three interchangeable ways
// of expressing the same thing plus a live preview of what the line will actually charge.
// It only ever emits the two fields checkout already understands:
//   manualUnitPrice (BRD §7 CR-039 absolute override) and manualDiscountPct (BRD §2.3/§6.2).

export type LinePriceTarget = {
  sku: string;
  name: string;
  uom: string;
  qty: number;
  price: number;
  manualUnitPrice?: number;
  manualDiscountPct?: number;
};

type Mode = "price" | "pct" | "amount";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

export function LinePriceDialog({
  line,
  canOverrideItemPrice,
  discountCeilingPercent,
  onClose,
  onApply,
}: {
  line: LinePriceTarget | null;
  canOverrideItemPrice: boolean;
  discountCeilingPercent: number | null;
  onClose: () => void;
  onApply: (sku: string, manualUnitPrice?: number, manualDiscountPct?: number) => void;
}) {
  const [mode, setMode] = useState<Mode>("price");
  const [value, setValue] = useState("");

  // Re-seed the field every time a different line opens the dialog.
  useEffect(() => {
    if (!line) return;
    if (line.manualUnitPrice != null) {
      setMode("price");
      setValue(String(line.manualUnitPrice));
    } else if (line.manualDiscountPct) {
      setMode("pct");
      setValue(String(line.manualDiscountPct));
    } else {
      setMode("price");
      setValue("");
    }
  }, [line?.sku, line?.manualUnitPrice, line?.manualDiscountPct]);

  if (!line) return null;

  const list = line.price;
  const num = Number(value);
  const entered = value.trim() === "" || Number.isNaN(num) ? null : Math.max(0, num);

  // Everything is normalised to a resulting unit price so the preview, the ceiling check and the
  // emitted fields all agree no matter which mode the cashier typed in.
  let unitPrice = list;
  if (entered != null) {
    if (mode === "price") unitPrice = entered;
    else if (mode === "pct") unitPrice = list * (1 - Math.min(entered, 100) / 100);
    else unitPrice = Math.max(0, list - entered);
  }
  const discountPct = list > 0 ? Math.max(0, ((list - unitPrice) / list) * 100) : 0;
  const isDiscount = unitPrice < list - 0.0001;
  const isMarkup = unitPrice > list + 0.0001;

  const needsOverrideApproval = isMarkup || (isDiscount && !canOverrideItemPrice && mode === "price");
  const overCeiling =
    isDiscount && discountCeilingPercent !== null && discountPct > discountCeilingPercent;

  function apply() {
    if (entered == null || Math.abs(unitPrice - list) < 0.0001) {
      onApply(line!.sku, undefined, undefined);
    } else if (mode === "pct") {
      // A pure % stays a discount so it keeps competing with the auto trade/quantity discounts
      // under the existing "larger of, never stacks" rule.
      onApply(line!.sku, undefined, Math.min(entered, 100));
    } else {
      onApply(line!.sku, Number(unitPrice.toFixed(2)), undefined);
    }
    onClose();
  }

  function clear() {
    onApply(line!.sku, undefined, undefined);
    onClose();
  }

  const modes: { id: Mode; label: string; suffix: string }[] = [
    { id: "price", label: "New unit price", suffix: "ر.س" },
    { id: "pct", label: "Discount %", suffix: "%" },
    { id: "amount", label: "Discount amount", suffix: "ر.س" },
  ];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Customise price — {line.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="font-mono text-[11px] text-muted-foreground">
            {line.sku} · {line.qty} {line.uom} · list {money(list)}
          </p>

          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  setValue("");
                }}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  mode === m.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === "price" ? String(list) : "0"}
              aria-label={`${line.sku} ${mode === "price" ? "new unit price" : mode === "pct" ? "discount percent" : "discount amount"}`}
            />
            <span className="w-10 shrink-0 text-xs text-muted-foreground">
              {modes.find((m) => m.id === mode)!.suffix}
            </span>
          </div>

          {mode === "pct" && (
            <div className="flex flex-wrap gap-1.5">
              {[5, 10, 15, 20, 25].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setValue(String(p))}
                  className="rounded-md border border-black/10 px-2 py-1 text-xs hover:border-brand hover:text-brand"
                >
                  {p}%
                </button>
              ))}
            </div>
          )}
          {mode === "price" && (
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Round down to 5", v: Math.floor(list / 5) * 5 },
                { label: "Round down to 10", v: Math.floor(list / 10) * 10 },
                { label: "Reset to list", v: list },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setValue(String(Number(p.v.toFixed(2))))}
                  className="rounded-md border border-black/10 px-2 py-1 text-xs hover:border-brand hover:text-brand"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-black/10 bg-muted/40 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">New unit price</span>
              <span className="font-semibold text-foreground">{money(unitPrice)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">
                {isMarkup ? "Uplift vs list" : "Discount vs list"}
              </span>
              <span className={isMarkup ? "text-warning" : "text-success"}>
                {isMarkup
                  ? `+${money(unitPrice - list)}`
                  : `${discountPct.toFixed(1)}% · ${money(list - unitPrice)}`}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-black/10 pt-1">
              <span className="text-muted-foreground">Line total ({line.qty})</span>
              <span className="font-semibold text-foreground">{money(unitPrice * line.qty)}</span>
            </div>
          </div>

          {(needsOverrideApproval || overCeiling) && (
            <p className="rounded-md bg-warning/10 px-2 py-1.5 text-[11px] font-medium text-warning">
              {overCeiling
                ? `Above your ${discountCeilingPercent}% discount limit — a supervisor approval will be requested at Charge.`
                : "This price change needs supervisor approval before the sale can be charged."}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {(line.manualUnitPrice != null || line.manualDiscountPct) && (
            <Button variant="ghost" onClick={clear}>
              Clear
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply price</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}