import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateReturn, useReturnPreview, type ExchangeLineInput, type ReturnPreviewDto } from "@/lib/api/finance";
import { useProducts } from "@/lib/api/catalog";
import type { OrderDto } from "@/lib/api/pos";
import { CurrencyText } from "@/lib/buildpos/currency";

const RETURN_TYPES = ["Standard", "Surplus", "Damaged", "Exchange"];
// BRD §3.2.2: the five mandatory damage reason codes.
const DAMAGE_CODES = [
  { value: "ManufacturingDefect", label: "Manufacturing Defect" },
  { value: "TransitDamage", label: "Transit Damage" },
  { value: "IncorrectProductSupplied", label: "Incorrect Product Supplied" },
  { value: "QualityBelowSpecification", label: "Quality Below Specification" },
  { value: "Other", label: "Other" },
];

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

// Module 6 (BRD §3.2): per-line quantity selection with server-computed Return Value Calculation
// shown BEFORE the cashier confirms — greyed-out non-returnable lines, damage codes + photo reference
// for damaged returns, restocking fee and VAT reversal displayed transparently.
// BRD §3.2.1 exchange workflow: one replacement item the cashier has added to the swap.
type ExchangeItem = { productId: number; sku: string; name: string; uom: string; qty: number };

export function CreateReturnDialog({ order, onClose }: { order: OrderDto | null; onClose: () => void }) {
  const [type, setType] = useState("Standard");
  const [reason, setReason] = useState("");
  const [damageCode, setDamageCode] = useState("");
  const [photoRef, setPhotoRef] = useState("");
  const [qtyByLine, setQtyByLine] = useState<Record<number, number>>({});
  const [preview, setPreview] = useState<ReturnPreviewDto | null>(null);
  const createReturn = useCreateReturn();
  const previewMutation = useReturnPreview();

  // BRD §3.2.1: the replacement item(s) the customer is picking for an Exchange — a real
  // product-picker + running price difference, not just a status label.
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);
  const [exchangeSearch, setExchangeSearch] = useState("");
  const { data: products } = useProducts(type === "Exchange");
  const exchangeSuggestions = useMemo(() => {
    const term = exchangeSearch.trim().toLowerCase();
    if (term.length < 1) return [];
    return (products ?? [])
      .filter((p) => p.sku.toLowerCase().includes(term) || p.nameEn.toLowerCase().includes(term))
      .filter((p) => !exchangeItems.some((i) => i.productId === p.id))
      .slice(0, 8);
  }, [exchangeSearch, products, exchangeItems]);

  function addExchangeItem(p: { id: number; sku: string; nameEn: string; stockUom: string }) {
    setExchangeItems((items) => [...items, { productId: p.id, sku: p.sku, name: p.nameEn, uom: p.stockUom, qty: 1 }]);
    setExchangeSearch("");
  }
  function setExchangeQty(productId: number, qty: number) {
    setExchangeItems((items) => items.map((i) => (i.productId === productId ? { ...i, qty: Math.max(0.01, qty) } : i)));
  }
  function removeExchangeItem(productId: number) {
    setExchangeItems((items) => items.filter((i) => i.productId !== productId));
  }

  const selectedLines = useMemo(
    () => Object.entries(qtyByLine).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ orderLineId: Number(id), qty })),
    [qtyByLine],
  );
  const exchangeLineInputs: ExchangeLineInput[] = useMemo(
    () => exchangeItems.map((i) => ({ productId: i.productId, qty: i.qty, uom: i.uom })),
    [exchangeItems],
  );

  // Server-computed preview refreshes whenever the selection, type, or replacement items change —
  // the numbers the cashier reviews are exactly what Create will freeze onto the return.
  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    previewMutation
      .mutateAsync({ orderId: order.id, type, lines: selectedLines, exchangeLines: type === "Exchange" ? exchangeLineInputs : undefined })
      .then((p) => !cancelled && setPreview(p))
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, type, selectedLines, exchangeLineInputs]);

  function reset() {
    setType("Standard");
    setReason("");
    setDamageCode("");
    setPhotoRef("");
    setQtyByLine({});
    setPreview(null);
    setExchangeItems([]);
    setExchangeSearch("");
  }

  // State must reset whenever the dialog targets a DIFFERENT order (or closes) — leftover qtyByLine
  // keys from a previous order are orderLineIds the new order doesn't own: they have no visible
  // input to clear them, and the server rejects every create ("line does not belong to order").
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  async function confirm() {
    if (!order || !reason.trim() || selectedLines.length === 0) return;
    if (type === "Damaged" && !damageCode) {
      toast.error("Select a damage reason code.");
      return;
    }
    if (type === "Exchange" && exchangeItems.length === 0) {
      toast.error("Add at least one replacement item.");
      return;
    }
    try {
      const created = await createReturn.mutateAsync({
        orderId: order.id,
        type,
        reason: reason.trim(),
        lines: selectedLines,
        damageReasonCode: type === "Damaged" ? damageCode : undefined,
        photoReference: type === "Damaged" && photoRef.trim() ? photoRef.trim() : undefined,
        exchangeLines: type === "Exchange" ? exchangeLineInputs : undefined,
      });
      toast.success(
        created.dgrnNo ? `${created.dgrnNo} issued` : `${created.returnNo} created`,
        { description: type === "Exchange"
          ? `Net ${(created.exchangeNetPayable ?? 0) >= 0 ? "owed" : "refund"} ${money(Math.abs(created.exchangeNetPayable ?? 0))} pending approval.`
          : type === "Damaged" ? "Stock will be quarantined on approval." : `Cashback ${money(created.netCashback)} pending approval.` },
      );
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the return.");
    }
  }

  const previewLines = preview?.lines ?? [];

  return (
    <Dialog open={order !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Return {order?.orderNo}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Return Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RETURN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {type === "Damaged" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Damage Reason Code <span className="text-critical">*</span>
              </label>
              <Select value={damageCode} onValueChange={setDamageCode}>
                <SelectTrigger><SelectValue placeholder="Select a code…" /></SelectTrigger>
                <SelectContent>
                  {DAMAGE_CODES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Per-line quantity picker (BRD §3.2.1 partial returns) */}
        <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-black/10 p-2">
          {previewLines.map((l) => (
            <div key={l.orderLineId} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${l.returnable ? "" : "opacity-50"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{l.productName}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {l.sku} · sold {l.originalQty} {l.uom} @ <CurrencyText value={money(l.unitPricePaid)} />
                  {l.maxReturnableQty < l.originalQty && ` · ${l.maxReturnableQty} left returnable`}
                </p>
                {!l.returnable && <p className="text-[10px] font-semibold text-critical">Non-Returnable — {l.nonReturnableReason}</p>}
              </div>
              <Input
                type="number" min={0} max={l.maxReturnableQty} step="any" disabled={!l.returnable}
                value={qtyByLine[l.orderLineId] ?? ""}
                aria-label={`${l.sku} return quantity`}
                onChange={(e) => setQtyByLine((q) => ({ ...q, [l.orderLineId]: Number(e.target.value) || 0 }))}
                className="h-8 w-20 text-center font-mono"
              />
            </div>
          ))}
          {previewLines.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Loading order lines…</p>}
        </div>

        {type === "Damaged" && (
          <Input value={photoRef} onChange={(e) => setPhotoRef(e.target.value)} placeholder="Photo reference # (optional)" className="h-9" />
        )}

        {/* BRD §3.2.1 exchange workflow: pick the replacement item(s) — a real product picker, not
            just a status label. Price difference is shown live below. */}
        {type === "Exchange" && (
          <div className="space-y-2 rounded-lg border border-black/10 p-2.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Replacement Item(s) <span className="text-critical">*</span>
            </label>
            <div className="relative">
              <Input
                value={exchangeSearch}
                onChange={(e) => setExchangeSearch(e.target.value)}
                placeholder="Search SKU or product name to add…"
                className="h-8"
              />
              {exchangeSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
                  {exchangeSuggestions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addExchangeItem(p)}
                      className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-brand/5"
                    >
                      <span className="truncate font-medium text-foreground">{p.sku} — {p.nameEn}</span>
                      <span className="shrink-0 font-mono text-muted-foreground"><CurrencyText value={money(p.sellingPrice)} /></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {exchangeItems.length > 0 && (
              <div className="space-y-1">
                {exchangeItems.map((i) => (
                  <div key={i.productId} className="flex items-center justify-between gap-2 rounded-md bg-canvas px-2 py-1.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{i.sku}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => setExchangeQty(i.productId, i.qty - 1)} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-black/5">
                        <Minus className="h-3 w-3" />
                      </button>
                      <Input
                        type="number" min={0.01} step="any" value={i.qty} aria-label={`${i.sku} quantity`}
                        onChange={(e) => setExchangeQty(i.productId, Number(e.target.value) || 0)}
                        className="h-6 w-14 text-center font-mono text-xs"
                      />
                      <button type="button" onClick={() => setExchangeQty(i.productId, i.qty + 1)} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-black/5">
                        <Plus className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => removeExchangeItem(i.productId)} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-critical/10 hover:text-critical">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reason <span className="text-critical">*</span>
          </label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Contractor over-ordered; 12 unopened bags returned…" />
        </div>

        {/* Return Value Calculation (BRD §3.2.3/§3.2.4) — reviewed before confirming */}
        {preview && selectedLines.length > 0 && (
          <div className="space-y-1 rounded-lg bg-canvas p-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Refund (excl. VAT)</span><span className="font-mono"><CurrencyText value={money(preview.grossRefund)} /></span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">VAT reversal</span><span className="font-mono"><CurrencyText value={money(preview.vatReversal)} /></span></div>
            {preview.restockingFeeAmount > 0 && (
              <div className="flex justify-between text-critical">
                <span>Restocking fee ({preview.restockingFeePct}%)</span><span className="font-mono">−<CurrencyText value={money(preview.restockingFeeAmount)} /></span>
              </div>
            )}
            <div className="flex justify-between border-t border-black/10 pt-1 text-sm font-semibold">
              <span>{type === "Exchange" ? "Return credit" : "Net cashback"}</span><span className="font-mono"><CurrencyText value={money(preview.netCashback)} /></span>
            </div>
            {type === "Exchange" && exchangeItems.length > 0 && (
              <>
                <div className="flex justify-between pt-1"><span className="text-muted-foreground">Replacement item(s) total</span><span className="font-mono"><CurrencyText value={money(preview.exchangeLinesTotal)} /></span></div>
                <div className={`flex justify-between border-t border-black/10 pt-1 text-sm font-semibold ${
                  (preview.exchangeNetPayable ?? 0) > 0 ? "text-critical" : (preview.exchangeNetPayable ?? 0) < 0 ? "text-success" : ""
                }`}>
                  <span>{(preview.exchangeNetPayable ?? 0) > 0 ? "Customer pays" : (preview.exchangeNetPayable ?? 0) < 0 ? "Customer is refunded" : "Even exchange"}</span>
                  <span className="font-mono"><CurrencyText value={money(Math.abs(preview.exchangeNetPayable ?? 0))} /></span>
                </div>
              </>
            )}
            {preview.requiresWindowOverride && (
              <p className="pt-1 font-medium text-warning-foreground text-[11px]">
                ⚠ Outside the {preview.windowDays}-day return window — supervisor approval (Refund request) is required before this can be created.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={
              !reason.trim() || selectedLines.length === 0 || (type === "Damaged" && !damageCode)
              || (type === "Exchange" && exchangeItems.length === 0) || createReturn.isPending
            }
            onClick={confirm}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {createReturn.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : type === "Damaged" ? "Issue DGRN & Create Return"
              : type === "Exchange" ? "Create Exchange"
              : "Create Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
