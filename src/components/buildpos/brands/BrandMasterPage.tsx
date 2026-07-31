/** BRD §80.2 / §80.3 — Brand Master plus supplier ↔ brand ↔ category mapping. */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Link2, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { cols } from "@/lib/buildpos/grid";
import { useAuth } from "@/lib/api/auth";
import {
  BRAND_SALES, CATEGORY_TREE, SUPPLIERS, available, useBrandStore,
  type Brand, type SupplierBrandMap,
} from "@/lib/catalog/brand-store";
import { fmtTs, money } from "@/components/buildpos/brands/shared";

const ALL_CATEGORIES = [...Object.keys(CATEGORY_TREE), "Hardware & Fasteners", "Paints & Coatings", "Tiles & Flooring"];

const emptyBrand = (): Brand => ({
  id: "", nameEn: "", nameAr: "", code: "", manufacturer: "", country: "Saudi Arabia",
  categories: [], description: "", website: "", warranty: "", certification: "",
  preferred: false, status: "Active",
});

const emptyMapping = (): SupplierBrandMap => ({
  id: "", supplier: SUPPLIERS[0], category: "Steel & Reinforcement", subcategory: "Rebar", brand: "",
  authorizedDistributor: true, supplierProductCode: "", leadTimeDays: 3, moq: 10, purchaseUom: "Bundle",
  currency: "SAR", standardCost: 0, lastCost: 0, discountPct: 0, deliveryTerms: "Delivered to branch",
  paymentTerms: "30 Days", certificateRequired: true, agreementStart: "2026-01-01", agreementEnd: "2026-12-31",
  preferred: false, status: "Active",
});

export function BrandMasterPage() {
  const { user } = useAuth();
  const userName = user?.name ?? "System Admin";
  const store = useBrandStore();
  const [tab, setTab] = useState("Brands");
  const [q, setQ] = useState("");
  const [brandForm, setBrandForm] = useState<Brand | null>(null);
  const [mapForm, setMapForm] = useState<SupplierBrandMap | null>(null);

  const brands = useMemo(
    () => store.brands.filter((b) => `${b.nameEn} ${b.code} ${b.manufacturer}`.toLowerCase().includes(q.toLowerCase())),
    [store.brands, q],
  );

  function saveBrand() {
    if (!brandForm) return;
    const b: Brand = { ...brandForm, id: brandForm.id || `BRD-${brandForm.code.toUpperCase() || "NEW"}-${String(store.brands.length + 1).padStart(3, "0")}` };
    if (!b.nameEn.trim() || !b.code.trim()) { toast.error("Brand name and code are required."); return; }
    const res = store.saveBrand(b, userName);
    toast[res.ok ? "success" : "error"](res.message);
    if (res.ok) setBrandForm(null);
  }

  function saveMapping() {
    if (!mapForm) return;
    if (!mapForm.brand) { toast.error("Select a brand for this supplier mapping."); return; }
    const brand = store.brands.find((b) => b.nameEn === mapForm.brand);
    if (brand && brand.status === "Inactive") { toast.error("Inactive brands cannot be mapped to suppliers."); return; }
    if (brand && !brand.categories.includes(mapForm.category)) {
      toast.error(`${brand.nameEn} is not approved for ${mapForm.category}.`); return;
    }
    store.saveMapping({ ...mapForm, id: mapForm.id || `SBM-${String(store.mappings.length + 1).padStart(3, "0")}` }, userName);
    toast.success(`${mapForm.supplier} mapped to ${mapForm.brand}.`);
    setMapForm(null);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold">Brands</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Brand master, category approval and supplier–brand agreements. Brands and suppliers stay separate entities.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMapForm(emptyMapping())}>
            <Link2 className="mr-1.5 size-4" /> Map Supplier
          </Button>
          <Button size="sm" onClick={() => setBrandForm(emptyBrand())}>
            <Plus className="mr-1.5 size-4" /> Create Brand
          </Button>
        </div>
      </header>

      <div className={`grid gap-3 ${cols(4)}`}>
        {[
          ["Active Brands", String(store.brands.filter((b) => b.status === "Active").length)],
          ["Supplier Mappings", String(store.mappings.length)],
          ["Branded SKUs", String(store.skus.length)],
          ["Preferred Brands", String(store.brands.filter((b) => b.preferred).length)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-black/5 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          {["Brands", "Supplier Mapping", "Brand Products", "Brand Sales", "Audit Log"].map((t) => (
            <TabsTrigger key={t} value={t}>{t}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="Brands" className="mt-4">
          <SectionCard title="Brand Master" desc="BRD-xxx brand records with category approval and certification."
            action={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand, code, manufacturer" className="h-8 w-56" />}>
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>
                  {["Brand ID", "Brand", "Code", "Manufacturer", "Origin", "Categories", "Certification", "Preferred", "SKUs", "Status", ""].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>))}
                </TableRow></TableHeader>
                <TableBody>
                  {brands.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.id}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {b.nameEn}{b.nameAr ? <span className="ml-2 text-xs text-muted-foreground">{b.nameAr}</span> : null}
                      </TableCell>
                      <TableCell>{b.code}</TableCell>
                      <TableCell className="whitespace-nowrap">{b.manufacturer}</TableCell>
                      <TableCell className="whitespace-nowrap">{b.country}</TableCell>
                      <TableCell className="text-xs">{b.categories.join(", ")}</TableCell>
                      <TableCell className="text-xs">{b.certification ?? "—"}</TableCell>
                      <TableCell>{b.preferred ? <Pill tone="success"><Star className="size-3" /> Preferred</Pill> : "—"}</TableCell>
                      <TableCell>{store.skus.filter((s) => s.brand === b.nameEn).length}</TableCell>
                      <TableCell><Pill tone={b.status === "Active" ? "success" : "muted"}>{b.status}</Pill></TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button variant="ghost" size="sm" onClick={() => setBrandForm(b)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => { store.toggleBrand(b.id, userName); toast.success(`${b.nameEn} ${b.status === "Active" ? "deactivated" : "activated"}.`); }}>
                          {b.status === "Active" ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Supplier Mapping" className="mt-4">
          <SectionCard title="Supplier · Brand · Category agreements"
            desc="The same brand may be supplied by several suppliers; each keeps its own cost, lead time and terms.">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>
                  {["Supplier", "Category", "Subcategory", "Brand", "Distributor", "Supplier Code", "Lead Time", "MOQ", "UOM", "Std Cost", "Payment Terms", "Certificate", "Agreement", "Preferred", "Status", ""].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>))}
                </TableRow></TableHeader>
                <TableBody>
                  {store.mappings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap font-medium">{m.supplier}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.category}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.subcategory ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.brand}</TableCell>
                      <TableCell>{m.authorizedDistributor ? "Authorized" : "Approved Reseller"}</TableCell>
                      <TableCell className="font-mono text-xs">{m.supplierProductCode}</TableCell>
                      <TableCell>{m.leadTimeDays} d</TableCell>
                      <TableCell>{m.moq}</TableCell>
                      <TableCell>{m.purchaseUom}</TableCell>
                      <TableCell className="whitespace-nowrap">{money(m.standardCost)}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.paymentTerms}</TableCell>
                      <TableCell>{m.certificateRequired ? "Required" : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{m.agreementStart} → {m.agreementEnd}</TableCell>
                      <TableCell>{m.preferred ? <Pill tone="success">Preferred</Pill> : "—"}</TableCell>
                      <TableCell><Pill tone={m.status === "Active" ? "success" : "muted"}>{m.status}</Pill></TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button variant="ghost" size="sm" onClick={() => setMapForm(m)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => { store.removeMapping(m.id, userName); toast.success("Mapping removed."); }}>
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Brand Products" className="mt-4">
          <SectionCard title="Brand products & stock" desc="Every active SKU carries a brand; the same specification exists under several brands.">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>
                  {["SKU", "Brand", "Product", "Category", "Subcategory", "Specification", "Retail", "Trade", "Available", "Suppliers"].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>))}
                </TableRow></TableHeader>
                <TableBody>
                  {store.skus.map((s) => (
                    <TableRow key={s.sku}>
                      <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{s.brand}</TableCell>
                      <TableCell className="whitespace-nowrap">{s.nameEn}</TableCell>
                      <TableCell className="whitespace-nowrap">{s.category}</TableCell>
                      <TableCell className="whitespace-nowrap">{s.subcategory}</TableCell>
                      <TableCell className="text-xs">{Object.entries(s.attributes).map(([k, v]) => `${k} ${v}`).join(" · ")}</TableCell>
                      <TableCell className="whitespace-nowrap">{money(s.retailPrice)}</TableCell>
                      <TableCell className="whitespace-nowrap">{money(s.tradePrice)}</TableCell>
                      <TableCell>{available(s)}</TableCell>
                      <TableCell className="text-xs">{store.offers.filter((o) => o.sku === s.sku).map((o) => o.supplier).join(", ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Brand Sales" className="mt-4">
          <SectionCard title="Sales by brand — Steel & Reinforcement" desc="Period to date.">
            <div className="space-y-3">
              {BRAND_SALES.map((b) => (
                <div key={b.brand} className="rounded-xl border border-black/5 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{b.brand}</span>
                    <span className="text-muted-foreground">{money(b.sales)} · {b.units.toLocaleString()} bars · {b.share}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-black/5">
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${b.share * 2.4}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Audit Log" className="mt-4">
          <SectionCard title="Brand & supplier audit events">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>
                  {["Event ID", "Event", "Brand", "Supplier", "SKU", "Customer", "User", "Old", "New", "Severity", "Date"].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>))}
                </TableRow></TableHeader>
                <TableBody>
                  {store.audit.length === 0 && (
                    <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground">No events yet — create a brand or map a supplier.</TableCell></TableRow>
                  )}
                  {store.audit.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">{e.id}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-medium">{e.event}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.brand ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.supplier ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.sku ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.customer ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.user}</TableCell>
                      <TableCell className="text-xs">{e.oldValue ?? "—"}</TableCell>
                      <TableCell className="text-xs">{e.newValue ?? "—"}</TableCell>
                      <TableCell><Pill tone={e.severity === "critical" ? "critical" : e.severity === "warning" ? "warning" : "info"}>{e.severity}</Pill></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{fmtTs(e.ts)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Create / edit brand */}
      <Dialog open={!!brandForm} onOpenChange={(o) => !o && setBrandForm(null)}>
        <DialogContent className="max-h-[min(88vh,60rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{brandForm?.id ? "Edit Brand" : "Create Brand"}</DialogTitle></DialogHeader>
          {brandForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Brand Name (English)"><Input value={brandForm.nameEn} onChange={(e) => setBrandForm({ ...brandForm, nameEn: e.target.value })} /></Field>
              <Field label="Brand Name (Arabic)"><Input dir="rtl" value={brandForm.nameAr ?? ""} onChange={(e) => setBrandForm({ ...brandForm, nameAr: e.target.value })} /></Field>
              <Field label="Brand Code"><Input value={brandForm.code} onChange={(e) => setBrandForm({ ...brandForm, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Brand Logo URL"><Input value={brandForm.logoUrl ?? ""} onChange={(e) => setBrandForm({ ...brandForm, logoUrl: e.target.value })} placeholder="https://…" /></Field>
              <Field label="Manufacturer"><Input value={brandForm.manufacturer} onChange={(e) => setBrandForm({ ...brandForm, manufacturer: e.target.value })} /></Field>
              <Field label="Country of Origin"><Input value={brandForm.country} onChange={(e) => setBrandForm({ ...brandForm, country: e.target.value })} /></Field>
              <Field label="Website"><Input value={brandForm.website ?? ""} onChange={(e) => setBrandForm({ ...brandForm, website: e.target.value })} /></Field>
              <Field label="Quality Certification"><Input value={brandForm.certification ?? ""} onChange={(e) => setBrandForm({ ...brandForm, certification: e.target.value })} /></Field>
              <Field label="Warranty Information" className="sm:col-span-2"><Input value={brandForm.warranty ?? ""} onChange={(e) => setBrandForm({ ...brandForm, warranty: e.target.value })} /></Field>
              <Field label="Brand Description" className="sm:col-span-2"><Textarea rows={2} value={brandForm.description ?? ""} onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })} /></Field>
              <Field label="Applicable Categories (at least one)" className="sm:col-span-2">
                <div className="flex flex-wrap gap-3">
                  {ALL_CATEGORIES.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={brandForm.categories.includes(c)}
                        onCheckedChange={(v) => setBrandForm({
                          ...brandForm,
                          categories: v ? [...brandForm.categories, c] : brandForm.categories.filter((x) => x !== c),
                        })} />
                      {c}
                    </label>
                  ))}
                </div>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={brandForm.preferred} onCheckedChange={(v) => setBrandForm({ ...brandForm, preferred: v })} /> Preferred brand
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={brandForm.status === "Active"} onCheckedChange={(v) => setBrandForm({ ...brandForm, status: v ? "Active" : "Inactive" })} /> Active
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBrandForm(null)}>Cancel</Button>
            <Button onClick={saveBrand}><BadgeCheck className="mr-1.5 size-4" /> Save Brand</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier brand mapping */}
      <Dialog open={!!mapForm} onOpenChange={(o) => !o && setMapForm(null)}>
        <DialogContent className="max-h-[min(88vh,60rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Supplier · Brand · Category Mapping</DialogTitle></DialogHeader>
          {mapForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Supplier">
                <Select value={mapForm.supplier} onValueChange={(v) => setMapForm({ ...mapForm, supplier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUPPLIERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Category">
                <Select value={mapForm.category} onValueChange={(v) => setMapForm({ ...mapForm, category: v, subcategory: CATEGORY_TREE[v]?.[0] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(CATEGORY_TREE).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Subcategory">
                <Select value={mapForm.subcategory ?? ""} onValueChange={(v) => setMapForm({ ...mapForm, subcategory: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{(CATEGORY_TREE[mapForm.category] ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Brand">
                <Select value={mapForm.brand} onValueChange={(v) => setMapForm({ ...mapForm, brand: v })}>
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {store.brands.filter((b) => b.status === "Active" && b.categories.includes(mapForm.category))
                      .map((b) => <SelectItem key={b.id} value={b.nameEn}>{b.nameEn}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Supplier Product Code"><Input value={mapForm.supplierProductCode ?? ""} onChange={(e) => setMapForm({ ...mapForm, supplierProductCode: e.target.value })} /></Field>
              <Field label="Purchase UOM"><Input value={mapForm.purchaseUom} onChange={(e) => setMapForm({ ...mapForm, purchaseUom: e.target.value })} /></Field>
              <Field label="Default Lead Time (days)"><Input type="number" value={mapForm.leadTimeDays} onChange={(e) => setMapForm({ ...mapForm, leadTimeDays: Number(e.target.value) })} /></Field>
              <Field label="Minimum Order Quantity"><Input type="number" value={mapForm.moq} onChange={(e) => setMapForm({ ...mapForm, moq: Number(e.target.value) })} /></Field>
              <Field label="Standard Purchase Cost"><Input type="number" step="0.01" value={mapForm.standardCost} onChange={(e) => setMapForm({ ...mapForm, standardCost: Number(e.target.value) })} /></Field>
              <Field label="Supplier Discount %"><Input type="number" step="0.1" value={mapForm.discountPct} onChange={(e) => setMapForm({ ...mapForm, discountPct: Number(e.target.value) })} /></Field>
              <Field label="Delivery Terms"><Input value={mapForm.deliveryTerms} onChange={(e) => setMapForm({ ...mapForm, deliveryTerms: e.target.value })} /></Field>
              <Field label="Payment Terms"><Input value={mapForm.paymentTerms} onChange={(e) => setMapForm({ ...mapForm, paymentTerms: e.target.value })} /></Field>
              <Field label="Agreement Start"><Input type="date" value={mapForm.agreementStart} onChange={(e) => setMapForm({ ...mapForm, agreementStart: e.target.value })} /></Field>
              <Field label="Agreement End"><Input type="date" value={mapForm.agreementEnd} onChange={(e) => setMapForm({ ...mapForm, agreementEnd: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={mapForm.authorizedDistributor} onCheckedChange={(v) => setMapForm({ ...mapForm, authorizedDistributor: v })} /> Authorized distributor
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={mapForm.certificateRequired} onCheckedChange={(v) => setMapForm({ ...mapForm, certificateRequired: v })} /> Quality certificate required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={mapForm.preferred} onCheckedChange={(v) => setMapForm({ ...mapForm, preferred: v })} /> Preferred supplier
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMapForm(null)}>Cancel</Button>
            <Button onClick={saveMapping}>Save Mapping</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}