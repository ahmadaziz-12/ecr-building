/** Custom Material Configurator (BRD §85.5) — an 11-step guided flow that never lets the user type
 *  a final price: every step feeds the rate engine, and step 10 shows margin + approval triggers. */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Calculator, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Select } from "@/components/delivery/FormFields";
import { Pill } from "@/components/buildpos/sections";
import {
  CUSTOMER_TYPES, EMPTY_SERVICES, MATERIAL_CATEGORIES, PRICE_TIERS, PRICING_TYPES,
  approvalTriggers, calculateRate, fmt, isNonReturnable,
  useCustomPricingStore, type CustomRateRequest, type MaterialCategory, type PricingType,
} from "@/lib/pricing/custom-pricing-store";

const STEPS = [
  "Select Customer", "Material Category", "Product & Brand", "Specification",
  "Quantity & UOM", "Customization Services", "Supplier Rate", "Delivery & Handling",
  "Calculate Rate", "Margin & Approval", "Generate Quotation",
];

const UOMS = ["Bag", "Bar", "Piece", "KG", "Ton", "Metre", "Square Metre", "Cubic Metre", "Sheet", "Tin", "Box", "Bundle", "Pallet"];

type Draft = Partial<CustomRateRequest>;

export function ConfiguratorDialog({
  open, onOpenChange, presetCategory,
}: { open: boolean; onOpenChange: (v: boolean) => void; presetCategory?: MaterialCategory }) {
  const store = useCustomPricingStore();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({
    pricingType: "Standard Customization", customerType: "Retail", priceTier: "Retail",
    materialCategory: presetCategory ?? "", conversionFactor: 1, wastagePct: 0, roundingQty: 0,
    requestedQuantity: 0, standardRate: 0, costRate: 0, minSellingRate: 0, discountPct: 0,
    deliveryCharge: 0, heavyDeliveryPct: 0, marketSurchargePct: 0, urgentSurcharge: 100,
    minOrderValue: 0, validityDays: 7, leadTime: "3 days", creditStatus: "Good Standing",
    deliveryRequired: false, services: { ...EMPTY_SERVICES }, stockUom: "Piece", sellingUom: "Piece",
    requestedUom: "Piece", createdBy: store.currentUser,
  });

  function set<K extends keyof CustomRateRequest>(k: K, v: CustomRateRequest[K]) {
    setD((p) => ({ ...p, [k]: v }));
  }
  function setSvc<K extends keyof typeof EMPTY_SERVICES>(k: K, v: (typeof EMPTY_SERVICES)[K]) {
    setD((p) => ({ ...p, services: { ...(p.services ?? EMPTY_SERVICES), [k]: v } }));
  }

  const preview = useMemo(() => {
    const req = { ...d, services: d.services ?? EMPTY_SERVICES } as CustomRateRequest;
    if (!req.requestedQuantity) return null;
    return calculateRate(req, store.rates, store.agreements, store.supplierRates);
  }, [d, store.rates, store.agreements, store.supplierRates]);

  const triggers = preview ? approvalTriggers({ ...d, services: d.services ?? EMPTY_SERVICES } as CustomRateRequest, preview) : [];

  const supplierOffers = store.supplierRates.filter(
    (s) => !d.materialCategory || s.materialCategory === d.materialCategory,
  );

  function finish(generateQuote: boolean) {
    if (!d.customer || !d.product || !d.requestedQuantity) {
      toast.error("Customer, product and quantity are required.");
      return;
    }
    const id = store.createRequest(d);
    store.recalculate(id);
    store.submitForApproval(id);
    if (generateQuote) store.generateQuotation(id);
    toast.success(`${id} created${generateQuote ? " and quoted" : ""}`);
    onOpenChange(false);
    setStep(0);
  }

  const svc = d.services ?? EMPTY_SERVICES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,64rem)] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0">
        <div className="grid grid-cols-1 md:grid-cols-[15rem_1fr]">
          <aside className="hidden border-r border-black/5 bg-sidebar/95 p-4 md:block">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/60">Configurator</p>
            <ol className="space-y-1">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <button
                    onClick={() => setStep(i)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                      i === step ? "bg-white/15 font-semibold text-white" : "text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/30 text-[10px]">
                      {i < step ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="truncate">{s}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <div className="flex max-h-[min(90vh,64rem)] flex-col">
            <DialogHeader className="border-b border-black/5 p-4">
              <DialogTitle className="text-base">
                Step {step + 1} of {STEPS.length} — {STEPS[step]}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-4">
              {step === 0 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Customer" v={d.customer ?? ""} onChange={(v) => set("customer", v)} required />
                  <Select label="Customer Type" v={d.customerType ?? ""} onChange={(v) => set("customerType", v as CustomRateRequest["customerType"])} options={CUSTOMER_TYPES.map((c) => ({ value: c, label: c }))} />
                  <Select label="Price Tier" v={d.priceTier ?? ""} onChange={(v) => set("priceTier", v)} options={PRICE_TIERS.map((c) => ({ value: c, label: c }))} />
                  <Field label="Contractor Account" v={d.contractorAccount ?? ""} onChange={(v) => set("contractorAccount", v)} />
                  <Select label="Project Code" v={d.projectCode ?? ""} onChange={(v) => set("projectCode", v)} options={store.agreements.map((a) => ({ value: a.projectCode, label: `${a.projectCode} — ${a.customer}` }))} />
                  <Field label="PO Reference" v={d.poReference ?? ""} onChange={(v) => set("poReference", v)} />
                  <Select label="Credit Status" v={d.creditStatus ?? ""} onChange={(v) => set("creditStatus", v as CustomRateRequest["creditStatus"])} options={["Good Standing", "On Hold", "Over Limit", "Prepaid Only"].map((c) => ({ value: c, label: c }))} />
                  <Select label="Pricing Type" v={d.pricingType ?? ""} onChange={(v) => set("pricingType", v as PricingType)} options={PRICING_TYPES.map((c) => ({ value: c, label: c }))} />
                </div>
              )}

              {step === 1 && (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {MATERIAL_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => set("materialCategory", c)}
                      className={`rounded-xl border p-3 text-left text-sm transition ${
                        d.materialCategory === c ? "border-brand bg-brand/5 font-semibold text-brand" : "border-black/10 bg-white hover:border-brand/40"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Product / Base Material" v={d.product ?? ""} onChange={(v) => set("product", v)} required />
                  <Field label="SKU" v={d.sku ?? ""} onChange={(v) => set("sku", v)} />
                  <Field label="Brand" v={d.brand ?? ""} onChange={(v) => set("brand", v)} />
                  <Field label="Preferred Supplier" v={d.supplier ?? ""} onChange={(v) => set("supplier", v)} />
                  <Field label="Standard Selling Rate (SAR)" type="number" v={String(d.standardRate ?? 0)} onChange={(v) => set("standardRate", Number(v))} />
                  <Field label="Cost Rate (SAR)" type="number" v={String(d.costRate ?? 0)} onChange={(v) => set("costRate", Number(v))} />
                  <Field label="Minimum Selling Rate (SAR)" type="number" v={String(d.minSellingRate ?? 0)} onChange={(v) => set("minSellingRate", Number(v))} />
                  <Field label="Subcategory" v={d.subcategory ?? ""} onChange={(v) => set("subcategory", v)} />
                </div>
              )}

              {step === 3 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Base Specification" v={d.baseSpecification ?? ""} onChange={(v) => set("baseSpecification", v)} />
                  <Field label="Requested Specification" v={d.requestedSpecification ?? ""} onChange={(v) => set("requestedSpecification", v)} required />
                  <Field label="Dimensions" v={d.dimensions ?? ""} onChange={(v) => set("dimensions", v)} />
                  <Field label="Colour Code" v={d.colorCode ?? ""} onChange={(v) => set("colorCode", v)} />
                  <Field label="Drawing / Technical Reference" v={d.drawingRef ?? ""} onChange={(v) => set("drawingRef", v)} />
                  <Field label="Notes" v={d.notes ?? ""} onChange={(v) => set("notes", v)} />
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Field label="Customer Requested Quantity" type="number" v={String(d.requestedQuantity ?? 0)} onChange={(v) => set("requestedQuantity", Number(v))} required />
                    <Select label="Requested UOM" v={d.requestedUom ?? ""} onChange={(v) => set("requestedUom", v)} options={UOMS.map((u) => ({ value: u, label: u }))} />
                    <Select label="Stock UOM" v={d.stockUom ?? ""} onChange={(v) => set("stockUom", v)} options={UOMS.map((u) => ({ value: u, label: u }))} />
                    <Select label="Selling UOM" v={d.sellingUom ?? ""} onChange={(v) => set("sellingUom", v)} options={UOMS.map((u) => ({ value: u, label: u }))} />
                    <Field label="UOM Conversion Factor" type="number" v={String(d.conversionFactor ?? 1)} onChange={(v) => set("conversionFactor", Number(v) || 1)} />
                    <Field label="Wastage %" type="number" v={String(d.wastagePct ?? 0)} onChange={(v) => set("wastagePct", Number(v))} />
                    <Field label="Rounding Quantity" type="number" v={String(d.roundingQty ?? 0)} onChange={(v) => set("roundingQty", Number(v))} />
                    <Field label="Minimum Order Value (SAR)" type="number" v={String(d.minOrderValue ?? 0)} onChange={(v) => set("minOrderValue", Number(v))} />
                  </div>
                  {preview && (
                    <div className="rounded-xl border border-black/10 bg-muted/30 p-3 text-xs">
                      Converted {preview.convertedQuantity} {d.stockUom} · Wastage {preview.wastageQuantity} · Chargeable{" "}
                      <strong>{preview.chargeableQuantity} {d.stockUom}</strong>
                    </div>
                  )}
                </div>
              )}

              {step === 5 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Field label="Number of Cuts" type="number" v={String(svc.cuts)} onChange={(v) => setSvc("cuts", Number(v))} />
                  <Field label="Number of Bends" type="number" v={String(svc.bends)} onChange={(v) => setSvc("bends", Number(v))} />
                  <Field label="Fabrication Weight (KG)" type="number" v={String(svc.fabricationKg)} onChange={(v) => setSvc("fabricationKg", Number(v))} />
                  <Field label="Fabrication Rate (SAR/KG)" type="number" v={String(svc.fabricationRatePerKg)} onChange={(v) => setSvc("fabricationRatePerKg", Number(v))} />
                  <Field label="Welds" type="number" v={String(svc.welds)} onChange={(v) => setSvc("welds", Number(v))} />
                  <Field label="Weld Rate (SAR)" type="number" v={String(svc.weldRate)} onChange={(v) => setSvc("weldRate", Number(v))} />
                  <Field label="Holes Drilled" type="number" v={String(svc.holes)} onChange={(v) => setSvc("holes", Number(v))} />
                  <Field label="Hole Rate (SAR)" type="number" v={String(svc.holeRate)} onChange={(v) => setSvc("holeRate", Number(v))} />
                  <Field label="Tinting — Number of Tins" type="number" v={String(svc.tintingTins)} onChange={(v) => setSvc("tintingTins", Number(v))} />
                  <Field label="Packaging Charge (SAR)" type="number" v={String(svc.packaging)} onChange={(v) => setSvc("packaging", Number(v))} />
                  <Field label="Edge Finishing (SAR)" type="number" v={String(svc.edgeFinishing)} onChange={(v) => setSvc("edgeFinishing", Number(v))} />
                  <Field label="Protective Coating / Pigment (SAR)" type="number" v={String(svc.coating)} onChange={(v) => setSvc("coating", Number(v))} />
                  <label className="flex h-10 items-center gap-2 self-end rounded-lg border border-black/10 bg-white px-3 text-sm">
                    <input type="checkbox" checked={svc.mixing} onChange={(e) => setSvc("mixing", e.target.checked)} /> Custom mixing required
                  </label>
                  <label className="flex h-10 items-center gap-2 self-end rounded-lg border border-black/10 bg-white px-3 text-sm">
                    <input type="checkbox" checked={svc.urgent} onChange={(e) => setSvc("urgent", e.target.checked)} /> Urgent order
                  </label>
                </div>
              )}

              {step === 6 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Ineligible suppliers (inactive, expired certificate, unmet minimum) are never auto-selected.
                  </p>
                  <div className="ui-table-scroll overflow-x-auto rounded-xl border border-black/5">
                    <table className="w-full text-sm">
                      <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr><th className="px-2 py-2 text-left">Supplier</th><th className="px-2 py-2 text-left">Product</th><th className="px-2 py-2 text-right">Offer</th><th className="px-2 py-2 text-right">Min Qty</th><th className="px-2 py-2 text-left">Lead</th><th className="px-2 py-2 text-left">Status</th></tr>
                      </thead>
                      <tbody>
                        {supplierOffers.map((s) => (
                          <tr key={s.id} className="border-t border-black/5">
                            <td className="px-2 py-2">{s.supplier}</td>
                            <td className="px-2 py-2 text-muted-foreground">{s.product}</td>
                            <td className="px-2 py-2 text-right font-mono text-xs">{s.offeredRate != null ? `SAR ${fmt(s.offeredRate)} / ${s.rateUom}` : "—"}</td>
                            <td className="px-2 py-2 text-right font-mono text-xs">{s.minQuantity ?? "—"}</td>
                            <td className="px-2 py-2 text-xs">{s.leadTimeDays ? `${s.leadTimeDays} d` : "—"}</td>
                            <td className="px-2 py-2"><Pill tone={s.status === "Approved" ? "success" : s.supplierActive ? "info" : "critical"}>{s.supplierActive ? s.status : "Supplier inactive"}</Pill></td>
                          </tr>
                        ))}
                        {supplierOffers.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-sm text-muted-foreground">No supplier rates for this category.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <Field label="Manually entered supplier rate (requires approval)" type="number" v={String(d.manualSupplierRate ?? "")} onChange={(v) => set("manualSupplierRate", v ? Number(v) : (undefined as never))} />
                </div>
              )}

              {step === 7 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="flex h-10 items-center gap-2 self-end rounded-lg border border-black/10 bg-white px-3 text-sm">
                    <input type="checkbox" checked={d.deliveryRequired ?? false} onChange={(e) => set("deliveryRequired", e.target.checked)} /> Delivery required
                  </label>
                  <Field label="Delivery Charge (SAR)" type="number" v={String(d.deliveryCharge ?? 0)} onChange={(v) => set("deliveryCharge", Number(v))} />
                  <Field label="Heavy Material Delivery %" type="number" v={String(d.heavyDeliveryPct ?? 0)} onChange={(v) => set("heavyDeliveryPct", Number(v))} />
                  <Field label="Loading Charge (SAR)" type="number" v={String(svc.loading)} onChange={(v) => setSvc("loading", Number(v))} />
                  <Field label="Handling Charge (SAR)" type="number" v={String(svc.handling)} onChange={(v) => setSvc("handling", Number(v))} />
                  <Field label="Market Surcharge %" type="number" v={String(d.marketSurchargePct ?? 0)} onChange={(v) => set("marketSurchargePct", Number(v))} />
                  <Field label="Urgent Order Surcharge (SAR)" type="number" v={String(d.urgentSurcharge ?? 0)} onChange={(v) => set("urgentSurcharge", Number(v))} />
                  <Field label="Lead Time" v={d.leadTime ?? ""} onChange={(v) => set("leadTime", v)} />
                </div>
              )}

              {(step === 8 || step === 9 || step === 10) && (
                <div className="space-y-3">
                  {step === 8 && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <Field label="Discount %" type="number" v={String(d.discountPct ?? 0)} onChange={(v) => set("discountPct", Number(v))} />
                      <Field label="Rate Validity (days)" type="number" v={String(d.validityDays ?? 7)} onChange={(v) => set("validityDays", Number(v))} />
                    </div>
                  )}
                  {preview ? <Breakdown calc={preview} unit={d.sellingUom ?? "unit"} showInternal={step !== 10} /> : <p className="text-sm text-muted-foreground">Enter a quantity to calculate.</p>}

                  {step === 9 && (
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Approval triggers</p>
                      {triggers.length === 0 ? (
                        <p className="mt-1 text-sm text-[oklch(0.35_0.1_155)]">No triggers — this rate can be approved automatically.</p>
                      ) : (
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[oklch(0.4_0.13_70)]">
                          {triggers.map((t) => <li key={t}>{t}</li>)}
                        </ul>
                      )}
                    </div>
                  )}

                  {step === 10 && (
                    <div className="rounded-xl border border-black/10 bg-white p-3 text-sm">
                      <p className="font-semibold">Customer-facing summary</p>
                      <p className="mt-1 text-muted-foreground">
                        {d.product} · {d.brand} · {d.requestedSpecification} · {d.requestedQuantity} {d.requestedUom} ·
                        valid {d.validityDays} days · lead time {d.leadTime}
                      </p>
                      <p className="mt-2">
                        Return policy:{" "}
                        {isNonReturnable({ ...d, services: svc } as CustomRateRequest)
                          ? "Customised — non-returnable except for approved quality defects."
                          : "Standard return policy applies."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-black/5 p-3">
              <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <div className="flex gap-2">
                {step === STEPS.length - 1 ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => finish(false)}>Save as request</Button>
                    <Button size="sm" onClick={() => finish(true)} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
                      <Calculator className="h-4 w-4" /> Generate quotation
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => setStep((s) => s + 1)} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Breakdown({
  calc, unit, showInternal = true,
}: { calc: ReturnType<typeof calculateRate>; unit: string; showInternal?: boolean }) {
  const rows: [string, string][] = [
    ["Rate source", calc.rateSource],
    ["Effective base rate", `SAR ${fmt(calc.effectiveBaseRate)}`],
    ["Chargeable quantity", `${calc.chargeableQuantity}`],
    ["Material amount", `SAR ${fmt(calc.materialAmount)}`],
    ["Wastage value", `SAR ${fmt(calc.wastageValue)}`],
    ["Customisation charges", `SAR ${fmt(calc.customizationCharges)}`],
    ["Logistics charges", `SAR ${fmt(calc.logisticsCharges)}`],
    ["Surcharges", `SAR ${fmt(calc.surcharges)}`],
    ["Gross custom price", `SAR ${fmt(calc.grossCustomPrice)}`],
    ["Discount", `− SAR ${fmt(calc.discountAmount)}`],
    ["Net excluding VAT", `SAR ${fmt(calc.netExVat)}`],
    ["VAT 15%", `SAR ${fmt(calc.vat)}`],
  ];
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-black/10 bg-white p-3">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b border-black/5 last:border-0">
                <td className="py-1.5 text-muted-foreground">{k}</td>
                <td className="py-1.5 text-right font-mono text-xs">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2">
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">Final total</p>
          <p className="font-display text-2xl font-bold">SAR {fmt(calc.finalTotal)}</p>
          <p className="text-xs text-muted-foreground">SAR {fmt(calc.finalUnitRate)} per {unit} · valid until {calc.validUntil}</p>
        </div>
        {showInternal && (
          <div className="rounded-xl border border-black/10 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Internal — not shown to customer</p>
            <p className="mt-1 text-sm">Cost SAR {fmt(calc.costAmount)} · Margin SAR {fmt(calc.marginAmount)}</p>
            <p className={`text-sm font-semibold ${calc.marginPct < 12 ? "text-critical" : "text-[oklch(0.35_0.1_155)]"}`}>
              Margin {fmt(calc.marginPct)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}