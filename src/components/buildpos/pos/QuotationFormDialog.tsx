import { useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateQuotation, useCustomers } from "@/lib/api/pos";
import { useProducts } from "@/lib/api/catalog";

type Line = { productId: number; sku: string; name: string; qty: number; price: number };

export function QuotationFormDialog({ open, onOpenChange, branchId }: { open: boolean; onOpenChange: (v: boolean) => void; branchId: number | null }) {
  const { data: customers } = useCustomers(open);
  const { data: products } = useProducts(open);
  const createQuotation = useCreateQuotation();

  const [customerId, setCustomerId] = useState<string>("walk-in");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  // BRD §3.4 (Module 16): both mandatory on every quotation.
  const [projectCode, setProjectCode] = useState("");
  const [customerReference, setCustomerReference] = useState("");

  const matches = search.trim().length > 0
    ? (products ?? []).filter((p) => p.sku.toLowerCase().includes(search.toLowerCase()) || p.nameEn.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];

  function addLine(p: NonNullable<typeof products>[number]) {
    setLines((prev) => (prev.some((l) => l.productId === p.id) ? prev : [...prev, { productId: p.id, sku: p.sku, name: p.nameEn, qty: 1, price: p.sellingPrice }]));
    setSearch("");
  }

  function reset() {
    setCustomerId("walk-in");
    setSearch("");
    setLines([]);
    setValidUntil("");
    setNotes("");
    setProjectCode("");
    setCustomerReference("");
  }

  async function submit() {
    if (!branchId || lines.length === 0) return;
    if (!projectCode.trim() || !customerReference.trim()) {
      toast.error("Project code and customer reference are required on every quotation.");
      return;
    }
    try {
      await createQuotation.mutateAsync({
        branchId,
        customerId: customerId === "walk-in" ? null : Number(customerId),
        lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        notes: notes || undefined,
        projectCode: projectCode.trim(),
        customerReference: customerReference.trim(),
      });
      toast.success("Quotation created");
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the quotation.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New Quotation</DialogTitle></DialogHeader>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="walk-in">Walk-in Customer</SelectItem>
              {(customers ?? []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nameEn}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Project Code <span className="text-critical">*</span>
            </label>
            <Input value={projectCode} onChange={(e) => setProjectCode(e.target.value)} placeholder="PRJ-104" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Customer Reference <span className="text-critical">*</span>
            </label>
            <Input value={customerReference} onChange={(e) => setCustomerReference(e.target.value)} placeholder="REF-2026-88" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add Items</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search SKU or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {matches.length > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
              {matches.map((p) => (
                <button key={p.id} onClick={() => addLine(p)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-canvas">
                  <span>{p.sku} · {p.nameEn}</span>
                  <span className="text-muted-foreground">{p.sellingPrice.toFixed(2)} ر.س</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="rounded-lg border border-black/5">
            {lines.map((l, i) => (
              <div key={l.productId} className={`flex items-center gap-2 px-3 py-2 text-sm ${i > 0 ? "border-t border-black/5" : ""}`}>
                <span className="flex-1 truncate">{l.sku} · {l.name}</span>
                <Input
                  type="number"
                  min={1}
                  className="h-7 w-16 text-right"
                  value={l.qty}
                  onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))}
                />
                <span className="w-20 text-right text-muted-foreground">{(l.qty * l.price).toFixed(2)}</span>
                <button onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))} className="text-muted-foreground hover:text-critical">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Valid Until</label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={lines.length === 0 || createQuotation.isPending} onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {createQuotation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Quotation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
