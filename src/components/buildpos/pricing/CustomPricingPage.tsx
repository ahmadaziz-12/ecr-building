/** Custom Material Pricing & Rate Engine (BRD §85) — dashboard, rate book, configurator,
 *  project agreements, supplier special rates, requests, approvals, history, quotations, audit. */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Calculator, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, KpiGrid } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Field, Select } from "@/components/delivery/FormFields";
import { ConfiguratorDialog, Breakdown } from "@/components/buildpos/pricing/ConfiguratorDialog";
import { useAuditStore } from "@/lib/store/audit";
import {
  CUSTOMER_TYPES, CUSTOM_PRICING_AUDIT_EVENTS, MATERIAL_CATEGORIES, PRICING_BASES,
  PRICING_TYPES, PRICE_TIERS, RATE_BOOK_CATEGORIES, REQUEST_STATUSES, SUPPLIER_RATE_STATUSES,
  fmt, useCustomPricingStore,
  type MaterialCategory, type PricingBasis, type RateBookCategory, type RateBookEntry,
  type SupplierSpecialRate,
} from "@/lib/pricing/custom-pricing-store";
import type { Severity } from "@/lib/buildpos/format";

const opt = (v: string) => ({ value: v, label: v });

function statusTone(s: string): Severity {
  if (s === "Approved" || s === "Converted to Sale" || s === "Active") return "success";
  if (s === "Rejected" || s === "Cancelled" || s === "Expired") return "critical";
  if (s === "Pending Approval" || s === "Under Review" || s === "Sent") return "warning";
  if (s === "Calculated" || s === "Quoted" || s === "Supplier Responded") return "info";
  return "muted";
}

export function CustomPricingPage() {
  const [configurator, setConfigurator] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader
        group="Finance & Customers"
        title="Custom Material Pricing"
        desc="Calculate, approve, and manage customized rates for project-specific, cut-to-size, fabricated, mixed, bundled, and bulk building-material orders."
        primary="New custom rate"
        onPrimary={() => setConfigurator(true)}
      />

      <Tabs defaultValue="dashboard">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="ratebook">Material Rate Book</TabsTrigger>
          <TabsTrigger value="agreements">Project Rate Agreements</TabsTrigger>
          <TabsTrigger value="supplier">Supplier Special Rates</TabsTrigger>
          <TabsTrigger value="requests">Rate Calculation Requests</TabsTrigger>
          <TabsTrigger value="approvals">Approval Queue</TabsTrigger>
          <TabsTrigger value="quotations">Custom Quotations</TabsTrigger>
          <TabsTrigger value="history">Rate History</TabsTrigger>
          <TabsTrigger value="audit">Pricing Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4"><DashboardTab onOpenConfigurator={() => setConfigurator(true)} /></TabsContent>
        <TabsContent value="ratebook" className="mt-4"><RateBookTab /></TabsContent>
        <TabsContent value="agreements" className="mt-4"><AgreementsTab /></TabsContent>
        <TabsContent value="supplier" className="mt-4"><SupplierRatesTab /></TabsContent>
        <TabsContent value="requests" className="mt-4"><RequestsTab /></TabsContent>
        <TabsContent value="approvals" className="mt-4"><ApprovalsTab /></TabsContent>
        <TabsContent value="quotations" className="mt-4"><QuotationsTab /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
      </Tabs>

      <ConfiguratorDialog open={configurator} onOpenChange={setConfigurator} />
    </div>
  );
}

// ————————————————————————— Dashboard —————————————————————————

function DashboardTab({ onOpenConfigurator }: { onOpenConfigurator: () => void }) {
  const { rates, agreements, supplierRates, requests } = useCustomPricingStore();
  const [category, setCategory] = useState("");
  const [pricingType, setPricingType] = useState("");
  const [status, setStatus] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [range, setRange] = useState("This Month");

  const shown = useMemo(
    () =>
      requests
        .filter((r) => !category || r.materialCategory === category)
        .filter((r) => !pricingType || r.pricingType === pricingType)
        .filter((r) => !status || r.status === status)
        .filter((r) => !customerType || r.customerType === customerType),
    [requests, category, pricingType, status, customerType],
  );

  const pending = requests.filter((r) => r.status === "Pending Approval").length;
  const converted = requests.filter((r) => r.status === "Converted to Sale").length;
  const margins = requests.filter((r) => r.calc).map((r) => r.calc!.marginPct);
  const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
  const expiring = supplierRates.filter((s) => s.validTo && s.validTo <= "2026-09-30").length;

  return (
    <div className="space-y-4">
      <KpiGrid
        scope="custom-pricing"
        items={[
          { label: "Active Rate Books", value: rates.filter((r) => r.status === "Active").length, sub: `${rates.length} total entries`, tone: "info" },
          { label: "Custom Quotes Today", value: requests.filter((r) => r.quotationId).length, sub: "Generated from configurator", tone: "info" },
          { label: "Pending Pricing Approvals", value: pending, sub: "Maker-checker queue", tone: pending ? "warning" : "muted" },
          { label: "Supplier Rates Expiring", value: expiring, sub: "Within validity window", tone: "warning" },
          { label: "Project Agreements", value: agreements.length, sub: `${agreements.filter((a) => a.status === "Active").length} active`, tone: "success" },
          { label: "Quotes Converted to Sales", value: converted, sub: "Preserved rate components", tone: "success" },
          { label: "Average Custom Margin", value: `${fmt(avgMargin)}%`, sub: "Minimum 12%", tone: avgMargin < 12 ? "critical" : "success" },
          { label: "Rate Overrides Today", value: requests.filter((r) => r.manualSupplierRate != null).length, sub: "Manual supplier rates", tone: "warning" },
        ]}
      />

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-black/5 bg-white p-3">
        <div className="w-44"><Select label="Date" v={range} onChange={setRange} options={["Today", "Last 7 Days", "This Month", "Custom"].map(opt)} /></div>
        <div className="w-52"><Select label="Material Category" v={category} onChange={setCategory} options={MATERIAL_CATEGORIES.map(opt)} /></div>
        <div className="w-52"><Select label="Pricing Type" v={pricingType} onChange={setPricingType} options={PRICING_TYPES.map(opt)} /></div>
        <div className="w-44"><Select label="Status" v={status} onChange={setStatus} options={REQUEST_STATUSES.map(opt)} /></div>
        <div className="w-44"><Select label="Customer Type" v={customerType} onChange={setCustomerType} options={CUSTOMER_TYPES.map(opt)} /></div>
        <Button size="sm" onClick={onOpenConfigurator} className="h-10 gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
          <Calculator className="h-4 w-4" /> Open configurator
        </Button>
      </div>

      <SectionCard title="Custom rate activity" desc={`${shown.length} of ${requests.length} calculations`}>
        <RequestTable ids={shown.map((r) => r.id)} />
      </SectionCard>
    </div>
  );
}

// ————————————————————————— Rate Book —————————————————————————

const EMPTY_RATE: Omit<RateBookEntry, "id"> = {
  code: "", name: "", category: "Base Material Rates", materialCategory: "", basis: "Per Unit",
  rate: 0, rateUom: "Unit", minCharge: 0, effectiveFrom: "2026-08-01", effectiveTo: "2026-12-31",
  vatTreatment: "Standard 15%", approvalRequired: false, status: "Active",
};

function RateBookTab() {
  const { rates, addRate, updateRate, removeRate } = useCustomPricingStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_RATE);
  const [category, setCategory] = useState("");

  const shown = rates.filter((r) => !category || r.category === category);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    if (!form.code || !form.name) return toast.error("Rate code and name are required.");
    if (editing) { updateRate(editing, form); toast.success("Rate updated"); }
    else { const id = addRate(form); toast.success(`${id} created`); }
    setOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl border border-black/5 bg-white p-3">
        <div className="w-64"><Select label="Rate Category" v={category} onChange={setCategory} options={RATE_BOOK_CATEGORIES.map(opt)} /></div>
        <Button size="sm" onClick={() => { setEditing(null); setForm(EMPTY_RATE); setOpen(true); }} className="h-10 gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
          <Plus className="h-4 w-4" /> Add rate
        </Button>
      </div>

      <SectionCard title="Material Rate Book" desc={`${shown.length} of ${rates.length} entries`}>
        <div className="ui-table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Rate", "Category", "Material", "Basis", "Rate", "Min / Max", "Qty band", "Effective", "VAT", "Status", ""].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-black/5 align-top">
                  <td className="px-2 py-2"><div className="font-mono text-xs text-brand">{r.code}</div><div className="text-xs text-muted-foreground">{r.name}</div></td>
                  <td className="px-2 py-2 text-xs">{r.category}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{r.materialCategory || "All"}{r.product ? ` · ${r.product}` : ""}{r.brand ? ` · ${r.brand}` : ""}</td>
                  <td className="px-2 py-2 text-xs">{r.basis}</td>
                  <td className="px-2 py-2 font-mono text-xs">{r.basis === "Percentage of Material Value" ? `${r.rate}%` : `SAR ${fmt(r.rate)}`}<div className="text-[10px] text-muted-foreground">/ {r.rateUom}</div></td>
                  <td className="px-2 py-2 font-mono text-xs">{r.minCharge ? `SAR ${r.minCharge}` : "—"}{r.maxCharge ? ` / ${r.maxCharge}` : ""}</td>
                  <td className="px-2 py-2 font-mono text-xs">{r.minQuantity ?? "—"}{r.maxQuantity ? `–${r.maxQuantity}` : ""}</td>
                  <td className="px-2 py-2 text-xs">{r.effectiveFrom}<div className="text-muted-foreground">{r.effectiveTo}</div></td>
                  <td className="px-2 py-2 text-xs">{r.vatTreatment}</td>
                  <td className="px-2 py-2"><Pill tone={statusTone(r.status)}>{r.status}</Pill>{r.approvalRequired && <div className="mt-1"><Pill tone="warning">Approval</Pill></div>}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button onClick={() => { setEditing(r.id); const { id: _i, ...rest } = r; setForm(rest); setOpen(true); }} className="rounded-md border border-black/10 px-2 py-1 text-xs hover:border-brand/40 hover:text-brand">Edit</button>
                    <button onClick={() => { removeRate(r.id); toast.success("Rate removed"); }} className="ml-1 rounded-md border border-black/10 px-2 py-1 text-xs hover:border-critical/40 hover:text-critical"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(88vh,60rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit rate" : "Add rate"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Rate Name" v={form.name} onChange={(v) => set("name", v)} required />
            <Field label="Rate Code" v={form.code} onChange={(v) => set("code", v)} required />
            <Select label="Category" v={form.category} onChange={(v) => set("category", v as RateBookCategory)} options={RATE_BOOK_CATEGORIES.map(opt)} />
            <Select label="Material Category" v={form.materialCategory} onChange={(v) => set("materialCategory", v as MaterialCategory)} options={MATERIAL_CATEGORIES.map(opt)} />
            <Field label="Product" v={form.product ?? ""} onChange={(v) => set("product", v)} />
            <Field label="Brand" v={form.brand ?? ""} onChange={(v) => set("brand", v)} />
            <Field label="Supplier" v={form.supplier ?? ""} onChange={(v) => set("supplier", v)} />
            <Field label="Branch" v={form.branch ?? ""} onChange={(v) => set("branch", v)} />
            <Select label="Customer Tier" v={form.customerTier ?? ""} onChange={(v) => set("customerTier", v)} options={PRICE_TIERS.map(opt)} />
            <Select label="Pricing Basis" v={form.basis} onChange={(v) => set("basis", v as PricingBasis)} options={PRICING_BASES.map(opt)} />
            <Field label="Rate" type="number" v={String(form.rate)} onChange={(v) => set("rate", Number(v))} />
            <Field label="Rate UOM" v={form.rateUom} onChange={(v) => set("rateUom", v)} />
            <Field label="Minimum Charge" type="number" v={String(form.minCharge)} onChange={(v) => set("minCharge", Number(v))} />
            <Field label="Maximum Charge" type="number" v={String(form.maxCharge ?? 0)} onChange={(v) => set("maxCharge", Number(v) || undefined)} />
            <Field label="Minimum Quantity" type="number" v={String(form.minQuantity ?? 0)} onChange={(v) => set("minQuantity", Number(v) || undefined)} />
            <Field label="Maximum Quantity" type="number" v={String(form.maxQuantity ?? 0)} onChange={(v) => set("maxQuantity", Number(v) || undefined)} />
            <Field label="Effective From" type="date" v={form.effectiveFrom} onChange={(v) => set("effectiveFrom", v)} />
            <Field label="Effective To" type="date" v={form.effectiveTo} onChange={(v) => set("effectiveTo", v)} />
            <Select label="VAT Treatment" v={form.vatTreatment} onChange={(v) => set("vatTreatment", v as RateBookEntry["vatTreatment"])} options={["Standard 15%", "Zero Rated", "Exempt"].map(opt)} />
            <Select label="Status" v={form.status} onChange={(v) => set("status", v as RateBookEntry["status"])} options={["Active", "Inactive"].map(opt)} />
            <label className="flex h-10 items-center gap-2 self-end rounded-lg border border-black/10 bg-white px-3 text-sm">
              <input type="checkbox" checked={form.approvalRequired} onChange={(e) => set("approvalRequired", e.target.checked)} /> Approval required
            </label>
          </div>
          <Field label="Notes" v={form.notes ?? ""} onChange={(v) => set("notes", v)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-brand text-brand-foreground hover:bg-brand/90">Save rate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ————————————————————————— Project agreements —————————————————————————

function AgreementsTab() {
  const { agreements, addAgreement, updateAgreement } = useCustomPricingStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customer: "", projectCode: "", validFrom: "2026-08-01", validTo: "2026-10-31", minMonthlySpend: 50000, freeDeliveryAbove: 10000, brands: "", product: "", brand: "", rate: 0, uom: "Bag" });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"><Plus className="h-4 w-4" /> New agreement</Button>
      </div>
      <div className="ui-card-grid grid grid-cols-1 gap-3 lg:grid-cols-2">
        {agreements.map((a) => (
          <SectionCard key={a.id} title={`${a.id} · ${a.projectCode}`} desc={`${a.customer} · ${a.validFrom} → ${a.validTo}`}>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Pill tone={statusTone(a.status)}>{a.status}</Pill>
                <Pill tone="info">Min monthly SAR {a.minMonthlySpend.toLocaleString()}</Pill>
                <Pill tone="muted">Free delivery &gt; SAR {a.freeDeliveryAbove.toLocaleString()}</Pill>
                {!a.combinableWithCoupons && <Pill tone="warning">No coupon stacking</Pill>}
              </div>
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-1 py-1 text-left">Product</th><th className="px-1 py-1 text-left">Brand</th><th className="px-1 py-1 text-right">Agreed rate</th></tr></thead>
                <tbody>
                  {a.lines.map((l) => (
                    <tr key={l.product} className="border-t border-black/5">
                      <td className="px-1 py-1">{l.product}</td>
                      <td className="px-1 py-1 text-muted-foreground">{l.brand}</td>
                      <td className="px-1 py-1 text-right font-mono text-xs">SAR {fmt(l.rate)} / {l.uom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { updateAgreement(a.id, { status: a.status === "Active" ? "Expired" : "Active" }); toast.success("Agreement updated"); }}>
                  {a.status === "Active" ? "Expire agreement" : "Reactivate"}
                </Button>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(88vh,60rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>New project rate agreement</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Customer" v={form.customer} onChange={(v) => set("customer", v)} required />
            <Field label="Project Code" v={form.projectCode} onChange={(v) => set("projectCode", v)} required />
            <Field label="Valid From" type="date" v={form.validFrom} onChange={(v) => set("validFrom", v)} />
            <Field label="Valid To" type="date" v={form.validTo} onChange={(v) => set("validTo", v)} />
            <Field label="Minimum Monthly Spend" type="number" v={String(form.minMonthlySpend)} onChange={(v) => set("minMonthlySpend", Number(v))} />
            <Field label="Free Delivery Above" type="number" v={String(form.freeDeliveryAbove)} onChange={(v) => set("freeDeliveryAbove", Number(v))} />
            <Field label="Approved Brands (comma separated)" v={form.brands} onChange={(v) => set("brands", v)} />
            <Field label="First Product" v={form.product} onChange={(v) => set("product", v)} />
            <Field label="Brand" v={form.brand} onChange={(v) => set("brand", v)} />
            <Field label="Agreed Rate" type="number" v={String(form.rate)} onChange={(v) => set("rate", Number(v))} />
            <Field label="UOM" v={form.uom} onChange={(v) => set("uom", v)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => {
                if (!form.customer || !form.projectCode) return toast.error("Customer and project code are required.");
                const id = addAgreement({
                  customer: form.customer, projectCode: form.projectCode, validFrom: form.validFrom, validTo: form.validTo,
                  minMonthlySpend: form.minMonthlySpend, freeDeliveryAbove: form.freeDeliveryAbove,
                  approvedBrands: form.brands.split(",").map((b) => b.trim()).filter(Boolean),
                  lines: form.product ? [{ product: form.product, brand: form.brand, rate: form.rate, uom: form.uom }] : [],
                  combinableWithCoupons: false, status: "Active",
                });
                toast.success(`${id} created`);
                setOpen(false);
              }}
            >Create agreement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ————————————————————————— Supplier special rates —————————————————————————

function SupplierRatesTab() {
  const { supplierRates, addSupplierRate, updateSupplierRate } = useCustomPricingStore();
  const [open, setOpen] = useState(false);
  const [respondId, setRespondId] = useState<string | null>(null);
  const [form, setForm] = useState({ supplier: "", materialCategory: "" as MaterialCategory | "", product: "", brand: "", specification: "", quantity: 0, purchaseUom: "Ton", requiredDate: "2026-08-15", projectCode: "", deliveryLocation: "", requiredCertificate: "", notes: "" });
  const [resp, setResp] = useState({ offeredRate: 0, rateUom: "Ton", minQuantity: 0, availableQuantity: 0, leadTimeDays: 0, deliveryTerms: "", validTo: "", certificateProvided: "", supplierNotes: "" });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setR = <K extends keyof typeof resp>(k: K, v: (typeof resp)[K]) => setResp((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"><Send className="h-4 w-4" /> Request supplier rate</Button>
      </div>
      <SectionCard title="Supplier special rates" desc="Purchase rates are internal — never shown on customer-facing quotations.">
        <div className="ui-table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>{["Request", "Supplier", "Product", "Qty", "Offer", "Min qty", "Lead", "Valid to", "Status", ""].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody>
              {supplierRates.map((s) => (
                <tr key={s.id} className="border-t border-black/5">
                  <td className="px-2 py-2 font-mono text-xs text-brand">{s.id}</td>
                  <td className="px-2 py-2">{s.supplier}{!s.supplierActive && <div className="text-[10px] text-critical">Inactive supplier</div>}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{s.product}<div>{s.specification}</div></td>
                  <td className="px-2 py-2 font-mono text-xs">{s.quantity} {s.purchaseUom}</td>
                  <td className="px-2 py-2 font-mono text-xs">{s.offeredRate != null ? `SAR ${fmt(s.offeredRate)}` : "—"}</td>
                  <td className="px-2 py-2 font-mono text-xs">{s.minQuantity ?? "—"}</td>
                  <td className="px-2 py-2 text-xs">{s.leadTimeDays ? `${s.leadTimeDays} d` : "—"}</td>
                  <td className="px-2 py-2 text-xs">{s.validTo ?? "—"}</td>
                  <td className="px-2 py-2"><Pill tone={statusTone(s.status)}>{s.status}</Pill></td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button onClick={() => { setRespondId(s.id); setResp({ ...resp, offeredRate: s.offeredRate ?? 0, rateUom: s.rateUom ?? s.purchaseUom }); }} className="rounded-md border border-black/10 px-2 py-1 text-xs hover:border-brand/40 hover:text-brand">Record response</button>
                    <button onClick={() => { updateSupplierRate(s.id, { status: "Approved" }); toast.success("Supplier rate approved"); }} className="ml-1 rounded-md border border-black/10 px-2 py-1 text-xs hover:border-brand/40 hover:text-brand">Approve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(88vh,60rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Request supplier rate</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Supplier" v={form.supplier} onChange={(v) => set("supplier", v)} required />
            <Select label="Category" v={form.materialCategory} onChange={(v) => set("materialCategory", v as MaterialCategory)} options={MATERIAL_CATEGORIES.map(opt)} />
            <Field label="Product" v={form.product} onChange={(v) => set("product", v)} required />
            <Field label="Brand" v={form.brand} onChange={(v) => set("brand", v)} />
            <Field label="Specification" v={form.specification} onChange={(v) => set("specification", v)} />
            <Field label="Quantity" type="number" v={String(form.quantity)} onChange={(v) => set("quantity", Number(v))} />
            <Field label="Purchase UOM" v={form.purchaseUom} onChange={(v) => set("purchaseUom", v)} />
            <Field label="Required Date" type="date" v={form.requiredDate} onChange={(v) => set("requiredDate", v)} />
            <Field label="Project" v={form.projectCode} onChange={(v) => set("projectCode", v)} />
            <Field label="Delivery Location" v={form.deliveryLocation} onChange={(v) => set("deliveryLocation", v)} />
            <Field label="Required Certificate" v={form.requiredCertificate} onChange={(v) => set("requiredCertificate", v)} />
            <Field label="Notes" v={form.notes} onChange={(v) => set("notes", v)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => {
              if (!form.supplier || !form.product) return toast.error("Supplier and product are required.");
              const id = addSupplierRate({ ...form, supplierActive: true, status: "Sent" });
              toast.success(`${id} sent to supplier`);
              setOpen(false);
            }}>Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={respondId != null} onOpenChange={(v) => !v && setRespondId(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader><DialogTitle>Supplier response — {respondId}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Offered Rate" type="number" v={String(resp.offeredRate)} onChange={(v) => setR("offeredRate", Number(v))} />
            <Field label="Rate UOM" v={resp.rateUom} onChange={(v) => setR("rateUom", v)} />
            <Field label="Minimum Quantity" type="number" v={String(resp.minQuantity)} onChange={(v) => setR("minQuantity", Number(v))} />
            <Field label="Available Quantity" type="number" v={String(resp.availableQuantity)} onChange={(v) => setR("availableQuantity", Number(v))} />
            <Field label="Lead Time (days)" type="number" v={String(resp.leadTimeDays)} onChange={(v) => setR("leadTimeDays", Number(v))} />
            <Field label="Delivery Terms" v={resp.deliveryTerms} onChange={(v) => setR("deliveryTerms", v)} />
            <Field label="Rate Validity" type="date" v={resp.validTo} onChange={(v) => setR("validTo", v)} />
            <Field label="Certificate" v={resp.certificateProvided} onChange={(v) => setR("certificateProvided", v)} />
            <Field label="Supplier Notes" v={resp.supplierNotes} onChange={(v) => setR("supplierNotes", v)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRespondId(null)}>Cancel</Button>
            <Button className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => {
              if (respondId) updateSupplierRate(respondId, { ...resp, status: "Supplier Responded" } as Partial<SupplierSpecialRate>);
              toast.success("Supplier response recorded");
              setRespondId(null);
            }}>Save response</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ————————————————————————— Requests / quotations —————————————————————————

function RequestTable({ ids }: { ids: string[] }) {
  const requests = useCustomPricingStore((s) => s.requests).filter((r) => ids.includes(r.id));
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <div className="ui-table-scroll overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>{["Request", "Customer", "Material", "Pricing type", "Qty", "Rate source", "Final total", "Margin", "Status", ""].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t border-black/5 align-top">
                <td className="px-2 py-2"><div className="font-mono text-xs text-brand">{r.id}</div>{r.quotationId && <div className="font-mono text-[10px] text-muted-foreground">{r.quotationId}</div>}</td>
                <td className="px-2 py-2">{r.customer}<div className="text-[10px] uppercase text-muted-foreground">{r.customerType} · {r.priceTier}</div></td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{r.product}<div>{r.requestedSpecification}</div></td>
                <td className="px-2 py-2 text-xs">{r.pricingType}</td>
                <td className="px-2 py-2 font-mono text-xs">{r.requestedQuantity} {r.requestedUom}</td>
                <td className="px-2 py-2 text-xs">{r.rateSource ?? "—"}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{r.calc ? `SAR ${fmt(r.calc.finalTotal)}` : "—"}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{r.calc ? `${fmt(r.calc.marginPct)}%` : "—"}</td>
                <td className="px-2 py-2"><Pill tone={statusTone(r.status)}>{r.status}</Pill>{r.nonReturnable && <div className="mt-1"><Pill tone="warning">Non-returnable</Pill></div>}</td>
                <td className="px-2 py-2 text-right"><button onClick={() => setOpenId(r.id)} className="rounded-md border border-black/10 px-2 py-1 text-xs hover:border-brand/40 hover:text-brand">Open</button></td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan={10} className="px-2 py-6 text-center text-sm text-muted-foreground">No custom rate requests match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <RequestDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function RequestDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const store = useCustomPricingStore();
  const req = store.requests.find((r) => r.id === id);
  const [customerView, setCustomerView] = useState(false);
  const [approver, setApprover] = useState("Finance Manager — Layla Hassan");

  if (!req) return null;
  const calc = req.calc;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[min(90vh,64rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {req.quotationId ?? req.id}
            <Pill tone={statusTone(req.status)}>{req.status}</Pill>
            {req.nonReturnable && <Pill tone="warning">Non-returnable</Pill>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-black/10 bg-muted/30 px-3 py-2 text-xs">
          <span>{customerView ? "Customer view — cost, margin and internal thresholds hidden." : "Internal view — full cost and margin visible."}</span>
          <Button size="sm" variant="outline" onClick={() => setCustomerView((v) => !v)}>{customerView ? "Switch to internal view" : "Switch to customer view"}</Button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          {[
            ["Customer", `${req.customer} (${req.customerType})`],
            ["Project", req.projectCode ?? "—"],
            ["Product", `${req.product} · ${req.brand}`],
            ["Requested spec", req.requestedSpecification],
            ["Quantity", `${req.requestedQuantity} ${req.requestedUom}`],
            ["Stock UOM", req.stockUom],
            ["Lead time", req.leadTime],
            ["Rate validity", calc?.validUntil ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-black/5 bg-white p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
              <p className="mt-0.5">{v}</p>
            </div>
          ))}
        </div>

        {calc ? <Breakdown calc={calc} unit={req.sellingUom} showInternal={!customerView} /> : <p className="text-sm text-muted-foreground">Not calculated yet.</p>}

        {!customerView && req.approvalReasons.length > 0 && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-semibold">Approval triggers</p>
            <ul className="mt-1 list-disc pl-5">{req.approvalReasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}

        {!customerView && req.approvals.length > 0 && (
          <div className="rounded-xl border border-black/10 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Approval chain (maker: {req.createdBy})</p>
            <div className="mt-2 space-y-2">
              {req.approvals.map((a) => (
                <div key={a.level} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/5 p-2 text-sm">
                  <span>Level {a.level} · {a.role ?? a.user} <Pill tone={statusTone(a.status)}>{a.status}</Pill></span>
                  {a.status === "Pending" && (
                    <span className="flex items-center gap-2">
                      <input value={approver} onChange={(e) => setApprover(e.target.value)} className="h-8 rounded-lg border border-black/10 px-2 text-xs" />
                      <Button size="sm" onClick={() => { const err = store.decide(req.id, a.level, true, approver); err ? toast.error(err) : toast.success("Approved"); }} className="bg-brand text-brand-foreground hover:bg-brand/90">Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => { const err = store.decide(req.id, a.level, false, approver); err ? toast.error(err) : toast.success("Rejected"); }}>Reject</Button>
                    </span>
                  )}
                  {a.decidedBy && <span className="text-xs text-muted-foreground">{a.decidedBy}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-black/10 bg-white p-3 text-sm">
          <p className="font-semibold">Return policy</p>
          <p className="text-muted-foreground">
            {req.nonReturnable
              ? "Customized products cannot be returned except for approved quality defects."
              : "Standard return policy applies."}
          </p>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { store.recalculate(req.id); toast.success("Recalculated"); }}>Calculate</Button>
          <Button size="sm" variant="outline" onClick={() => { store.submitForApproval(req.id); toast.success("Submitted for approval"); }}>Submit for approval</Button>
          <Button size="sm" variant="outline" onClick={() => { store.generateQuotation(req.id); toast.success("Quotation generated and sent"); }}>Send to customer</Button>
          <Button size="sm" variant="outline" onClick={() => { window.print(); }}>Print</Button>
          <Button size="sm" variant="outline" onClick={() => { store.acceptQuotation(req.id, ["Dimensions", "Colour / grade", "Quantity", "Non-returnable status", "Final rate"]); toast.success("Customer acceptance recorded"); }}>Accept quotation</Button>
          <Button size="sm" variant="outline" onClick={() => { store.expireQuotation(req.id); toast.success("Quotation expired"); }}>Expire</Button>
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => {
            if (req.status !== "Approved" && req.status !== "Quoted") return toast.error("Only approved or quoted rates can be converted.");
            store.convertToSale(req.id);
            toast.success("Converted to sale — stock deducted in stock UOM, instruction sheet generated");
          }}>Convert to sale</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestsTab() {
  const requests = useCustomPricingStore((s) => s.requests);
  const [status, setStatus] = useState("");
  const shown = requests.filter((r) => !status || r.status === status);
  return (
    <div className="space-y-3">
      <div className="w-52 rounded-xl border border-black/5 bg-white p-3"><Select label="Status" v={status} onChange={setStatus} options={REQUEST_STATUSES.map(opt)} /></div>
      <SectionCard title="Rate calculation requests" desc={`${shown.length} requests`}>
        <RequestTable ids={shown.map((r) => r.id)} />
      </SectionCard>
    </div>
  );
}

function ApprovalsTab() {
  const requests = useCustomPricingStore((s) => s.requests).filter((r) => r.status === "Pending Approval");
  return (
    <SectionCard title="Approval queue" desc="Maker-checker — the person who prepared a rate can never approve it.">
      <RequestTable ids={requests.map((r) => r.id)} />
    </SectionCard>
  );
}

function QuotationsTab() {
  const requests = useCustomPricingStore((s) => s.requests).filter((r) => r.quotationId);
  return (
    <SectionCard title="Custom quotations" desc={`${requests.length} quotations · CQT series`}>
      <RequestTable ids={requests.map((r) => r.id)} />
    </SectionCard>
  );
}

function HistoryTab() {
  const requests = useCustomPricingStore((s) => s.requests);
  const rows = requests.flatMap((r) => r.history.map((h) => ({ ...h, id: r.id, product: r.product, customer: r.customer }))).sort((a, b) => b.at - a.at);
  return (
    <SectionCard title="Rate history" desc="Every calculation, submission and decision, newest first.">
      <div className="ui-table-scroll overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground"><tr>{["When", "Request", "Customer", "Material", "Event", "Detail", "By"].map((h) => <th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.id}-${i}`} className="border-t border-black/5">
                <td className="px-2 py-2 text-xs">{new Date(r.at).toLocaleString()}</td>
                <td className="px-2 py-2 font-mono text-xs text-brand">{r.id}</td>
                <td className="px-2 py-2 text-xs">{r.customer}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{r.product}</td>
                <td className="px-2 py-2 font-mono text-[11px]">{r.event}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{r.detail ?? "—"}</td>
                <td className="px-2 py-2 text-xs">{r.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function AuditTab() {
  const events = useAuditStore((s) => s.events).filter((e) => CUSTOM_PRICING_AUDIT_EVENTS.includes(e.event));
  return (
    <SectionCard title="Pricing audit logs" desc={`${events.length} custom-pricing audit events`}>
      <div className="ui-table-scroll overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground"><tr>{["When", "Event", "Record", "Detail", "User", "Severity"].map((h) => <th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-black/5">
                <td className="px-2 py-2 text-xs">{new Date(e.ts).toLocaleString()}</td>
                <td className="px-2 py-2 font-mono text-[11px]">{e.event}</td>
                <td className="px-2 py-2 font-mono text-xs text-brand">{e.recordId}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{e.newValue ?? "—"}</td>
                <td className="px-2 py-2 text-xs">{e.user}</td>
                <td className="px-2 py-2"><Pill tone={e.severity === "critical" ? "critical" : e.severity === "warning" ? "warning" : "muted"}>{e.severity}</Pill></td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-sm text-muted-foreground">No pricing audit events yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}