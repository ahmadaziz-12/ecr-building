import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateQuotation, useUpdateQuotation, useCustomers, usePricingRules, type QuotationDto } from "@/lib/api/pos";
import { categoryDisplayLabel, useCategories, useProducts } from "@/lib/api/catalog";

type Line = { productId: number; sku: string; name: string; qty: number; price: number };

const CONTRACTOR_DISCOUNT_PCT = 5;

export function QuotationFormDialog({
  open, onOpenChange, branchId, editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branchId: number | null;
  // Present = edit an existing quotation instead of creating a new one.
  editing?: QuotationDto | null;
}) {
  const { data: customers } = useCustomers(open);
  // branchId-scoped so totalAvailable reflects stock at THIS quotation's branch, not a company-wide sum.
  const { data: products } = useProducts(open, branchId ?? undefined);
  const { data: categories } = useCategories(open);
  const { data: pricingRules } = usePricingRules(open);
  const categoriesById = new Map((categories ?? []).map((c) => [c.id, c]));
  const categoryLabelFor = (categoryId: number) => {
    const c = categoriesById.get(categoryId);
    return c ? categoryDisplayLabel(c) : "";
  };
  const createQuotation = useCreateQuotation();
  const updateQuotation = useUpdateQuotation();
  const saving = createQuotation.isPending || updateQuotation.isPending;

  const [customerId, setCustomerId] = useState<string>("walk-in");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  // BRD §3.4 (Module 16): both mandatory on every quotation.
  const [projectCode, setProjectCode] = useState("");
  const [customerReference, setCustomerReference] = useState("");
  const [discountPct, setDiscountPct] = useState(0);

  // Auto-fill tracking: remembers the last value WE set from the selected customer, so picking a
  // customer fills project code + discount for convenience without ever clobbering something the
  // user typed/changed themselves.
  const lastAutoProjectCode = useRef<string>("");
  const lastAutoDiscount = useRef<number>(0);

  // Excludes the real seeded "Walk-in Customer" DB row (Type=WalkIn): the "walk-in" sentinel value
  // already covers that case, so listing both would show "Walk-in Customer" twice in the dropdown.
  const selectableCustomers = (customers ?? []).filter((c) => c.type !== "WalkIn");
  const customer = customerId === "walk-in" ? null : selectableCustomers.find((c) => String(c.id) === customerId) ?? null;

  // BRD §5.1/§6.2, mirroring QuotationsController/OrdersController.Checkout: Active rules scoped to
  // this quotation's branch (or company-wide) and not past ValidUntil.
  const activePricingRules = (pricingRules ?? []).filter((r) =>
    r.status === "Active"
    && (r.branchId == null || r.branchId === branchId)
    && (r.validUntil == null || new Date(r.validUntil).getTime() >= Date.now()));
  const bestTradeTierRule = activePricingRules
    .filter((r) => r.type === "Trade Tier")
    .sort((a, b) => (Number(b.branchId != null) - Number(a.branchId != null)) || b.priority - a.priority)[0] ?? null;
  const contractorRatePct = bestTradeTierRule?.value ?? CONTRACTOR_DISCOUNT_PCT;
  // BRD §6.2 Quantity Discount: matched case-insensitively (a rule's Sku is uppercased at creation,
  // a product's own Sku is stored exactly as entered) and doesn't stack with the blanket discount —
  // each line gets whichever is larger, same as OrdersController.Checkout / PosCheckout's cart preview.
  const quantityRules = activePricingRules.filter((r) => r.type === "Quantity" && r.minQuantity != null);
  const quantityPctFor = (l: Line) =>
    quantityRules
      .filter((r) => (!r.sku || r.sku.toUpperCase() === l.sku.toUpperCase()) && l.qty >= r.minQuantity!)
      .reduce((max, r) => Math.max(max, r.value), 0);
  const lineDiscountPct = (l: Line) => Math.max(discountPct, quantityPctFor(l));

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCustomerId(editing.customerId ? String(editing.customerId) : "walk-in");
      setLines(editing.lines.map((l) => ({ productId: l.productId, sku: l.sku, name: l.productName, qty: l.qty, price: l.unitPrice })));
      setValidUntil(editing.validUntil ? editing.validUntil.slice(0, 10) : "");
      setNotes(editing.notes ?? "");
      setProjectCode(editing.projectCode);
      setCustomerReference(editing.customerReference);
      setDiscountPct(editing.discountPct);
      lastAutoProjectCode.current = editing.projectCode;
      lastAutoDiscount.current = editing.discountPct;
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  function handleCustomerChange(value: string) {
    setCustomerId(value);
    const picked = value === "walk-in" ? null : selectableCustomers.find((c) => String(c.id) === value) ?? null;

    // Project code: fill from the customer's project name, but only if the field is still blank or
    // still holds whatever we auto-filled last time (i.e. the user hasn't typed their own).
    if (projectCode === "" || projectCode === lastAutoProjectCode.current) {
      const auto = picked?.projectName ?? "";
      setProjectCode(auto);
      lastAutoProjectCode.current = auto;
    }

    // Discount: BRD §3.4 contractor auto-discount, sourced from the active Trade Tier rule's own
    // Value when a manager has configured one (falls back to the flat default) — same non-destructive
    // auto-fill rule as project code above.
    if (discountPct === lastAutoDiscount.current) {
      const auto = picked?.type === "Contractor" ? contractorRatePct : 0;
      setDiscountPct(auto);
      lastAutoDiscount.current = auto;
    }
  }

  const matches = search.trim().length > 0
    ? (products ?? []).filter((p) => p.sku.toLowerCase().includes(search.toLowerCase()) || p.nameEn.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];

  function addLine(p: NonNullable<typeof products>[number]) {
    if (p.totalAvailable <= 0) {
      toast.error(`${p.sku} has no stock at this branch — can't add it to a quotation.`);
      return;
    }
    setLines((prev) => (prev.some((l) => l.productId === p.id) ? prev : [...prev, { productId: p.id, sku: p.sku, name: p.nameEn, qty: 1, price: p.sellingPrice }]));
    setSearch("");
  }

  // Available stock for a line already on the quotation — used to cap its qty input below.
  const availableFor = (productId: number) => products?.find((p) => p.id === productId)?.totalAvailable ?? Infinity;

  function reset() {
    setCustomerId("walk-in");
    setSearch("");
    setLines([]);
    setValidUntil("");
    setNotes("");
    setProjectCode("");
    setCustomerReference("");
    setDiscountPct(0);
    lastAutoProjectCode.current = "";
    lastAutoDiscount.current = 0;
  }

  const locked = editing != null && editing.status !== "Draft" && editing.status !== "Sent";
  const hasOverStockLine = lines.some((l) => l.qty > availableFor(l.productId));

  async function submit() {
    if (!branchId || lines.length === 0 || locked) return;
    if (!projectCode.trim()) {
      toast.error("Project code is required on every quotation.");
      return;
    }
    if (hasOverStockLine) {
      toast.error("One or more lines exceed the stock available at this branch — reduce the quantity before saving.");
      return;
    }
    const request = {
      customerId: customerId === "walk-in" ? null : Number(customerId),
      lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      notes: notes || undefined,
      projectCode: projectCode.trim(),
      customerReference: customerReference.trim() || undefined,
      discountPct,
    };
    try {
      if (editing) {
        await updateQuotation.mutateAsync({ id: editing.id, request });
        toast.success("Quotation updated");
      } else {
        await createQuotation.mutateAsync({ branchId, ...request });
        toast.success("Quotation created");
      }
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the quotation.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{editing ? `Edit ${editing.quoteNo}` : "New Quotation"}</DialogTitle></DialogHeader>

        {locked && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            This quotation is {editing?.status} and can no longer be edited.
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</label>
          <Select value={customerId} onValueChange={handleCustomerChange} disabled={locked}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="walk-in">Walk-in Customer</SelectItem>
              {selectableCustomers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nameEn}</SelectItem>)}
            </SelectContent>
          </Select>
          {customer && (
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg border border-black/5 bg-canvas px-3 py-2 text-xs text-muted-foreground">
              <span>{customer.phone || "No phone on file"}</span>
              <span>{customer.vatNo ? `VAT ${customer.vatNo}` : "No VAT No."}</span>
              <span className="col-span-2 truncate">{[customer.address, customer.district, customer.city].filter(Boolean).join(", ") || "No address on file"}</span>
              <span>Credit limit {customer.creditLimit.toFixed(2)} ر.س</span>
              <span>Outstanding {customer.outstanding.toFixed(2)} ر.س</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Project Code <span className="text-critical">*</span>
            </label>
            <Input value={projectCode} onChange={(e) => setProjectCode(e.target.value)} placeholder="PRJ-104" disabled={locked} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Customer Reference <span className="normal-case text-muted-foreground/70">(optional)</span>
            </label>
            <Input value={customerReference} onChange={(e) => setCustomerReference(e.target.value)} placeholder="REF-2026-88" disabled={locked} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add Items</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search SKU or name…" value={search} onChange={(e) => setSearch(e.target.value)} disabled={locked} />
          </div>
          {matches.length > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
              {matches.map((p) => {
                const outOfStock = p.totalAvailable <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addLine(p)}
                    disabled={outOfStock}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{p.sku} · {p.nameEn}</span>
                      {categoryLabelFor(p.categoryId) && (
                        <span className="block truncate text-[10px] text-brand">{categoryLabelFor(p.categoryId)}</span>
                      )}
                    </span>
                    <span className="shrink-0 pl-2 text-right text-muted-foreground">
                      <span className="block">{p.sellingPrice.toFixed(2)} ر.س</span>
                      <span className={`block text-[10px] ${outOfStock ? "text-critical" : "text-muted-foreground/70"}`}>
                        {outOfStock ? "Out of stock" : `${p.totalAvailable} available`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="rounded-lg border border-black/5">
            {lines.map((l, i) => {
              const gross = l.qty * l.price;
              const pct = lineDiscountPct(l);
              const discountAmt = gross * pct / 100;
              const available = availableFor(l.productId);
              const overStock = l.qty > available;
              return (
                <div key={l.productId} className={`px-3 py-2 text-sm ${i > 0 ? "border-t border-black/5" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate">{l.sku} · {l.name}</span>
                    <Input
                      type="number"
                      min={1}
                      max={Number.isFinite(available) ? available : undefined}
                      className={`h-7 w-16 text-right ${overStock ? "border-critical text-critical" : ""}`}
                      value={l.qty}
                      disabled={locked}
                      onChange={(e) => {
                        const requested = Number(e.target.value) || 1;
                        const clamped = Number.isFinite(available) ? Math.min(requested, available) : requested;
                        setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, qty: Math.max(1, clamped) } : x)));
                      }}
                    />
                    <span className="w-24 text-right text-muted-foreground">
                      {(gross - discountAmt).toFixed(2)}
                      {discountAmt > 0 && <span className="ml-1 text-[10px] text-warning">-{discountAmt.toFixed(2)} ({pct}%)</span>}
                    </span>
                    {!locked && (
                      <button onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))} className="text-muted-foreground hover:text-critical">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {overStock && (
                    <p className="mt-0.5 text-right text-[10px] text-critical">Only {available} available at this branch now — reduce the quantity before saving.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Valid Until</label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={locked} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Discount %</label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={discountPct}
              disabled={locked}
              onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={locked} />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={lines.length === 0 || saving || locked || hasOverStockLine} onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editing ? "Save Changes" : "Create Quotation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
