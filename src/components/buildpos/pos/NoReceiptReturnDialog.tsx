import { useMemo, useState } from "react";
import { Loader2, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateReturn } from "@/lib/api/finance";
import { useProducts } from "@/lib/api/catalog";
import { useCustomers } from "@/lib/api/pos";
import { CurrencyText } from "@/lib/buildpos/currency";

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

type NoReceiptItem = { productId: number; sku: string; name: string; qty: number; sellingPrice: number; vatRate: number };

// BRD §3.2.2: a Standard return with no original order to draw down against — gated server-side by
// Role.CanAuthorizeStandardReturnWithoutReceipt. Priced at the product's CURRENT selling price
// (nothing else to go on) and always refunded as store credit against a real customer account.
export function NoReceiptReturnDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState<NoReceiptItem[]>([]);
  const [reason, setReason] = useState("");
  const createReturn = useCreateReturn();

  const { data: customers } = useCustomers(open && customerId === null);
  const { data: products } = useProducts(open);

  const customerSuggestions = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (term.length < 1) return [];
    return (customers ?? [])
      .filter((c) => c.nameEn.toLowerCase().includes(term) || (c.phone ?? "").includes(term))
      .slice(0, 8);
  }, [customerSearch, customers]);
  const productSuggestions = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (term.length < 1) return [];
    return (products ?? [])
      .filter((p) => p.sku.toLowerCase().includes(term) || p.nameEn.toLowerCase().includes(term))
      .filter((p) => !items.some((i) => i.productId === p.id))
      .slice(0, 8);
  }, [productSearch, products, items]);

  function addItem(p: { id: number; sku: string; nameEn: string; sellingPrice: number; vatRate: number }) {
    setItems((c) => [...c, { productId: p.id, sku: p.sku, name: p.nameEn, qty: 1, sellingPrice: p.sellingPrice, vatRate: p.vatRate }]);
    setProductSearch("");
  }
  function setQty(productId: number, qty: number) {
    setItems((c) => c.map((i) => (i.productId === productId ? { ...i, qty: Math.max(0.01, qty) } : i)));
  }
  function removeItem(productId: number) {
    setItems((c) => c.filter((i) => i.productId !== productId));
  }

  const grossRefund = items.reduce((s, i) => s + i.qty * i.sellingPrice, 0);
  const vatReversal = items.reduce((s, i) => s + i.qty * i.sellingPrice * (i.vatRate / 100), 0);
  const netCashback = grossRefund + vatReversal;

  function reset() {
    setCustomerSearch(""); setCustomerId(null); setCustomerName("");
    setProductSearch(""); setItems([]); setReason("");
  }

  async function confirm() {
    if (!customerId) {
      toast.error("Select the customer to credit.");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one product and quantity.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    try {
      const created = await createReturn.mutateAsync({
        orderId: null,
        type: "Standard",
        reason: reason.trim(),
        lines: [],
        customerId,
        noReceiptLines: items.map((i) => ({ productId: i.productId, qty: i.qty })),
      });
      toast.success(`${created.returnNo} created`, { description: `Store credit ${money(created.netCashback)} pending approval.` });
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the return.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>No-Receipt Return</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          No original order — priced at each product's current selling price and always refunded as store credit.
        </p>

        <div className="relative">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Customer <span className="text-critical">*</span>
          </label>
          {customerId ? (
            <div className="flex h-9 items-center justify-between rounded-md border border-black/10 bg-white px-2.5 text-sm">
              <span className="truncate">{customerName}</span>
              <button type="button" onClick={() => { setCustomerId(null); setCustomerName(""); }} className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-black/5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search name or phone…" className="h-9" />
          )}
          {!customerId && customerSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
              {customerSuggestions.map((c) => (
                <button
                  key={c.id} type="button"
                  onClick={() => { setCustomerId(c.id); setCustomerName(c.nameEn); setCustomerSearch(""); }}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-brand/5"
                >
                  <span className="truncate font-medium text-foreground">{c.nameEn}</span>
                  <span className="shrink-0 text-muted-foreground">{c.phone ?? ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Item(s) Being Returned <span className="text-critical">*</span>
          </label>
          <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search SKU or product name to add…" className="h-9" />
          {productSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
              {productSuggestions.map((p) => (
                <button
                  key={p.id} type="button" onClick={() => addItem(p)}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-brand/5"
                >
                  <span className="truncate font-medium text-foreground">{p.sku} — {p.nameEn}</span>
                  <span className="shrink-0 font-mono text-muted-foreground"><CurrencyText value={money(p.sellingPrice)} /></span>
                </button>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="space-y-1">
            {items.map((i) => (
              <div key={i.productId} className="flex items-center justify-between gap-2 rounded-md bg-canvas px-2 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{i.sku} · <CurrencyText value={money(i.sellingPrice)} /> each</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setQty(i.productId, i.qty - 1)} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-black/5">
                    <Minus className="h-3 w-3" />
                  </button>
                  <Input
                    type="number" min={0.01} step="any" value={i.qty} aria-label={`${i.sku} quantity`}
                    onChange={(e) => setQty(i.productId, Number(e.target.value) || 0)}
                    className="h-6 w-14 text-center font-mono text-xs"
                  />
                  <button type="button" onClick={() => setQty(i.productId, i.qty + 1)} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-black/5">
                    <Plus className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => removeItem(i.productId)} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-critical/10 hover:text-critical">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reason <span className="text-critical">*</span>
          </label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer lost the receipt; box still sealed…" />
        </div>

        {items.length > 0 && (
          <div className="space-y-1 rounded-lg bg-canvas p-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Refund (excl. VAT)</span><span className="font-mono"><CurrencyText value={money(grossRefund)} /></span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">VAT reversal</span><span className="font-mono"><CurrencyText value={money(vatReversal)} /></span></div>
            <div className="flex justify-between border-t border-black/10 pt-1 text-sm font-semibold">
              <span>Store credit</span><span className="font-mono"><CurrencyText value={money(netCashback)} /></span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            size="sm"
            disabled={!customerId || items.length === 0 || !reason.trim() || createReturn.isPending}
            onClick={confirm}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {createReturn.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
