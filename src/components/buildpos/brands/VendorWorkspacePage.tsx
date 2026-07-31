/** BRD §80.10–§80.12 — restricted supplier-facing workspace. */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileUp, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { cols } from "@/lib/buildpos/grid";
import { useAuth } from "@/lib/api/auth";
import { CATEGORY_TREE, SUPPLIERS, useBrandStore, type VendorProposal } from "@/lib/catalog/brand-store";
import { fmtTs, money } from "@/components/buildpos/brands/shared";

const TABS = ["Vendor Dashboard", "My Brands", "My Products", "Purchase Orders", "Product Proposals", "Price Submissions", "Documents", "Activity Logs"];

export function VendorWorkspacePage() {
  const { user } = useAuth();
  const userName = user?.name ?? "Vendor User";
  const store = useBrandStore();
  const [vendor, setVendor] = useState(SUPPLIERS[0]);
  const [tab, setTab] = useState(TABS[0]);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [priceFor, setPriceFor] = useState<string | null>(null);
  const [priceValue, setPriceValue] = useState("");
  const [priceReason, setPriceReason] = useState("");
  const [poDialog, setPoDialog] = useState<string | null>(null);
  const [poQty, setPoQty] = useState("");
  const [poDate, setPoDate] = useState("");

  const myMappings = store.mappings.filter((m) => m.supplier === vendor);
  const myBrands = Array.from(new Set(myMappings.map((m) => m.brand)));
  const myCategories = Array.from(new Set(myMappings.map((m) => m.category)));
  const myOffers = store.offers.filter((o) => o.supplier === vendor);
  const myPos = store.purchaseOrders.filter((p) => p.supplier === vendor);
  const myProposals = store.proposals.filter((p) => p.supplier === vendor);
  const myPrices = store.priceSubmissions.filter((p) => p.supplier === vendor);
  const myAudit = store.audit.filter((e) => e.supplier === vendor);

  const kpis = useMemo(() => {
    const outOfStock = myOffers.filter((o) => o.availableQty <= 0).length;
    const fill = myOffers.length ? Math.round(myOffers.reduce((t, o) => t + o.fillRatePct, 0) / myOffers.length) : 0;
    const lead = myMappings.length ? (myMappings.reduce((t, m) => t + m.leadTimeDays, 0) / myMappings.length).toFixed(1) : "0";
    return [
      ["Active Brands", String(myBrands.length)],
      ["Active Products", String(myOffers.length)],
      ["Open Purchase Orders", String(myPos.filter((p) => p.status !== "Delivered").length)],
      ["POs Awaiting Confirmation", String(myPos.filter((p) => p.status === "Awaiting Confirmation").length)],
      ["Products Out of Stock", String(outOfStock)],
      ["Price Changes Pending", String(myPrices.filter((p) => p.status === "Submitted").length)],
      ["Current Fill Rate", `${fill}%`],
      ["Average Lead Time", `${lead} Days`],
    ] as [string, string][];
  }, [myBrands.length, myOffers, myPos, myPrices, myMappings]);

  const [draft, setDraft] = useState<Omit<VendorProposal, "id" | "createdAt" | "status">>({
    supplier: vendor, category: "Steel & Reinforcement", subcategory: "Rebar", brand: "",
    supplierProductCode: "", nameEn: "", nameAr: "", specification: "", purchaseUom: "Bundle",
    sellUomRecommendation: "Bar", standardCost: 0, moq: 10, leadTimeDays: 3, availableQty: 0,
    country: "Saudi Arabia", vatRate: 15, notes: "", hasImage: false, hasDatasheet: false, hasCertificate: false,
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold">Vendor Workspace</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Supplier-facing operational view. A vendor sees only its own brands, offers, orders and documents — never other suppliers' costs or customer data.
          </p>
        </div>
        <Select value={vendor} onValueChange={(v) => { setVendor(v); setDraft((d) => ({ ...d, supplier: v })); }}>
          <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
          <SelectContent>{SUPPLIERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </header>

      <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-xs">
        <ShieldAlert className="size-4 text-brand" />
        Acting as <strong>{vendor}</strong> · Categories: {myCategories.join(", ") || "—"} · Vendors cannot activate SKUs or prices — internal approval is required.
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">{TABS.map((t) => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}</TabsList>

        <TabsContent value="Vendor Dashboard" className="mt-4">
          <div className={`ui-card-grid ${cols(4)}`}>
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-black/5 bg-white p-4">
                <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</p>
                <p className="mt-1 font-display text-2xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="My Brands" className="mt-4">
          <SectionCard title="Assigned brands & categories">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Brand", "Category", "Subcategory", "Distributor", "Lead Time", "MOQ", "Payment Terms", "Agreement", "Preferred"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {myMappings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap font-medium">{m.brand}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.category}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.subcategory}</TableCell>
                      <TableCell>{m.authorizedDistributor ? "Authorized" : "Approved Reseller"}</TableCell>
                      <TableCell>{m.leadTimeDays} d</TableCell>
                      <TableCell>{m.moq}</TableCell>
                      <TableCell className="whitespace-nowrap">{m.paymentTerms}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{m.agreementStart} → {m.agreementEnd}</TableCell>
                      <TableCell>{m.preferred ? <Pill tone="success">Preferred</Pill> : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="My Products" className="mt-4">
          <SectionCard title="My products" desc="Your own offers only — competitor costs are never shown."
            action={<Button size="sm" onClick={() => setProposalOpen(true)}><Plus className="mr-1.5 size-4" /> Propose New Product</Button>}>
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Supplier Code", "BuildPOS SKU", "Product", "Brand", "Category", "Specification", "Purchase UOM", "Standard Cost", "Available", "MOQ", "Lead Time", "Certificate", "Status", "Actions"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {myOffers.map((o) => {
                    const s = store.skus.find((x) => x.sku === o.sku);
                    const map = myMappings.find((m) => m.brand === s?.brand);
                    const certExpired = o.certificateExpiry ? new Date(o.certificateExpiry) < new Date() : false;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">{map?.supplierProductCode ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{o.sku}</TableCell>
                        <TableCell className="whitespace-nowrap">{s?.nameEn}</TableCell>
                        <TableCell className="whitespace-nowrap">{s?.brand}</TableCell>
                        <TableCell className="whitespace-nowrap">{s?.category}</TableCell>
                        <TableCell className="text-xs">{s ? Object.entries(s.attributes).map(([k, v]) => `${k} ${v}`).join(" · ") : "—"}</TableCell>
                        <TableCell>{map?.purchaseUom ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{money(o.purchaseCost)}</TableCell>
                        <TableCell>{o.availableQty}</TableCell>
                        <TableCell>{o.moq}</TableCell>
                        <TableCell>{o.leadTimeDays} d</TableCell>
                        <TableCell>{o.certificateExpiry ? <Pill tone={certExpired ? "critical" : "success"}>{certExpired ? "Expired" : o.certificateExpiry}</Pill> : "—"}</TableCell>
                        <TableCell><Pill tone={o.availableQty > 0 ? "success" : "warning"}>{o.availableQty > 0 ? "Available" : "Temporarily Unavailable"}</Pill></TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Button variant="ghost" size="sm" onClick={() => { const q = Number(prompt("Available quantity", String(o.availableQty)) ?? o.availableQty); store.saveOffer({ ...o, availableQty: q }, userName); toast.success("Availability updated."); }}>Update Availability</Button>
                          <Button variant="ghost" size="sm" onClick={() => { setPriceFor(o.sku); setPriceValue(String(o.purchaseCost)); setPriceReason(""); }}>Submit Price Change</Button>
                          <Button variant="ghost" size="sm" onClick={() => toast.success(`Quality certificate uploaded for ${o.sku}.`)}><FileUp className="size-4" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Purchase Orders" className="mt-4">
          <SectionCard title="Purchase orders & delivery commitments">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["PO", "Brand", "SKU", "Qty", "UOM", "Cost", "Confirmed", "Expected Delivery", "Delivery Note", "Status", "Actions"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {myPos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.id}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.brand}</TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell>{p.qty}</TableCell>
                      <TableCell>{p.uom}</TableCell>
                      <TableCell className="whitespace-nowrap">{money(p.cost)}</TableCell>
                      <TableCell>{p.confirmedQty ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.expectedDelivery ?? "—"}</TableCell>
                      <TableCell>{p.deliveryNoteRef ?? "—"}</TableCell>
                      <TableCell><Pill tone={p.status === "Delivered" ? "success" : p.status === "Awaiting Confirmation" ? "warning" : "info"}>{p.status}</Pill></TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button variant="ghost" size="sm" onClick={() => { setPoDialog(p.id); setPoQty(String(p.qty)); setPoDate(""); }}>Confirm</Button>
                        <Button variant="ghost" size="sm" onClick={() => { const ref = prompt("Delivery note reference", "DN-") ?? ""; if (ref) { store.attachDeliveryNote(p.id, ref, userName); toast.success("Delivery note uploaded."); } }}>Upload Delivery Note</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Product Proposals" className="mt-4">
          <SectionCard title="New product proposals" desc="Draft → Submitted → Under Review → Approved → SKU Creation Required → Active."
            action={<Button size="sm" onClick={() => setProposalOpen(true)}><Plus className="mr-1.5 size-4" /> Propose New Product</Button>}>
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Proposal", "Product", "Brand", "Category", "Specification", "Cost", "MOQ", "Lead Time", "Documents", "Status", "Submitted"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {myProposals.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.id}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.nameEn}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.brand}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.category}</TableCell>
                      <TableCell className="text-xs">{p.specification}</TableCell>
                      <TableCell className="whitespace-nowrap">{money(p.standardCost)}</TableCell>
                      <TableCell>{p.moq}</TableCell>
                      <TableCell>{p.leadTimeDays} d</TableCell>
                      <TableCell className="text-xs">{[p.hasImage && "Image", p.hasDatasheet && "Datasheet", p.hasCertificate && "Certificate"].filter(Boolean).join(", ") || "None"}</TableCell>
                      <TableCell><Pill tone={p.status === "Approved" || p.status === "Active" ? "success" : p.status === "Rejected" ? "critical" : "info"}>{p.status}</Pill></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{fmtTs(p.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Price Submissions" className="mt-4">
          <SectionCard title="Price list submissions" desc="Submitted prices stay inactive until an internal user approves them.">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Reference", "SKU", "Current", "Proposed", "Effective", "Reason", "Status", "Submitted"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {myPrices.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.id}</TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell>{money(p.currentCost)}</TableCell>
                      <TableCell>{money(p.proposedCost)}</TableCell>
                      <TableCell>{p.effectiveFrom}</TableCell>
                      <TableCell className="text-xs">{p.reason}</TableCell>
                      <TableCell><Pill tone={p.status === "Approved" ? "success" : p.status === "Rejected" ? "critical" : "info"}>{p.status}</Pill></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{fmtTs(p.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Documents" className="mt-4">
          <SectionCard title="Documents & certificates">
            <div className={`ui-card-grid ${cols(3)}`}>
              {["Commercial Registration", "VAT Certificate", "Quality Certificates", "Delivery Notes", "Invoices", "Credit Notes"].map((d) => (
                <div key={d} className="rounded-xl border border-black/5 bg-white p-4">
                  <p className="font-medium">{d}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Visible to {vendor} only.</p>
                  <Button size="sm" variant="outline" className="mt-3 h-7" onClick={() => toast.success(`${d} uploaded for ${vendor}.`)}>
                    <FileUp className="mr-1 size-3.5" /> Upload
                  </Button>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Activity Logs" className="mt-4">
          <SectionCard title="Vendor activity logs">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Event ID", "Event", "Brand", "SKU", "Old", "New", "User", "Date"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {myAudit.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No vendor activity yet.</TableCell></TableRow>}
                  {myAudit.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">{e.id}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-medium">{e.event}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.brand ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.sku ?? "—"}</TableCell>
                      <TableCell className="text-xs">{e.oldValue ?? "—"}</TableCell>
                      <TableCell className="text-xs">{e.newValue ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.user}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{fmtTs(e.ts)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Propose new product */}
      <Dialog open={proposalOpen} onOpenChange={setProposalOpen}>
        <DialogContent className="max-h-[min(88vh,60rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Propose New Product — {vendor}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Category">
              <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v, subcategory: CATEGORY_TREE[v]?.[0] ?? "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(CATEGORY_TREE).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Subcategory">
              <Select value={draft.subcategory} onValueChange={(v) => setDraft({ ...draft, subcategory: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(CATEGORY_TREE[draft.category] ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Brand">
              <Select value={draft.brand} onValueChange={(v) => setDraft({ ...draft, brand: v })}>
                <SelectTrigger><SelectValue placeholder="Select an assigned brand" /></SelectTrigger>
                <SelectContent>{myBrands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Supplier Product Code"><Input value={draft.supplierProductCode} onChange={(e) => setDraft({ ...draft, supplierProductCode: e.target.value })} /></F>
            <F label="Product Name (English)"><Input value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} /></F>
            <F label="Product Name (Arabic)"><Input dir="rtl" value={draft.nameAr ?? ""} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} /></F>
            <F label="Specification" className="sm:col-span-2"><Input value={draft.specification} onChange={(e) => setDraft({ ...draft, specification: e.target.value })} /></F>
            <F label="Purchase UOM"><Input value={draft.purchaseUom} onChange={(e) => setDraft({ ...draft, purchaseUom: e.target.value })} /></F>
            <F label="Selling UOM Recommendation"><Input value={draft.sellUomRecommendation} onChange={(e) => setDraft({ ...draft, sellUomRecommendation: e.target.value })} /></F>
            <F label="Standard Purchase Cost"><Input type="number" step="0.01" value={draft.standardCost} onChange={(e) => setDraft({ ...draft, standardCost: Number(e.target.value) })} /></F>
            <F label="Minimum Order Quantity"><Input type="number" value={draft.moq} onChange={(e) => setDraft({ ...draft, moq: Number(e.target.value) })} /></F>
            <F label="Lead Time (days)"><Input type="number" value={draft.leadTimeDays} onChange={(e) => setDraft({ ...draft, leadTimeDays: Number(e.target.value) })} /></F>
            <F label="Available Quantity"><Input type="number" value={draft.availableQty} onChange={(e) => setDraft({ ...draft, availableQty: Number(e.target.value) })} /></F>
            <F label="Country of Origin"><Input value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} /></F>
            <F label="VAT Rate %"><Input type="number" value={draft.vatRate} onChange={(e) => setDraft({ ...draft, vatRate: Number(e.target.value) })} /></F>
            <F label="Notes" className="sm:col-span-2"><Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></F>
            <label className="flex items-center gap-2 text-sm"><Switch checked={draft.hasImage} onCheckedChange={(v) => setDraft({ ...draft, hasImage: v })} /> Product image attached</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={draft.hasDatasheet} onCheckedChange={(v) => setDraft({ ...draft, hasDatasheet: v })} /> Technical data sheet</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={draft.hasCertificate} onCheckedChange={(v) => setDraft({ ...draft, hasCertificate: v })} /> Quality certificate</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposalOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!draft.nameEn.trim() || !draft.brand) { toast.error("Product name and an assigned brand are required."); return; }
              store.submitProposal({ ...draft, supplier: vendor }, userName);
              toast.success("Proposal submitted for internal review. Vendors cannot activate SKUs directly.");
              setProposalOpen(false);
            }}>Submit Proposal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price change */}
      <Dialog open={!!priceFor} onOpenChange={(o) => !o && setPriceFor(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader><DialogTitle>Submit Price Change — {priceFor}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <F label="Proposed Purchase Cost"><Input type="number" step="0.01" value={priceValue} onChange={(e) => setPriceValue(e.target.value)} /></F>
            <F label="Reason"><Input value={priceReason} onChange={(e) => setPriceReason(e.target.value)} placeholder="Billet cost increase" /></F>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceFor(null)}>Cancel</Button>
            <Button onClick={() => {
              const offer = myOffers.find((o) => o.sku === priceFor);
              if (!offer) return;
              store.submitPriceChange({
                supplier: vendor, sku: offer.sku, currentCost: offer.purchaseCost,
                proposedCost: Number(priceValue), effectiveFrom: new Date().toISOString().slice(0, 10),
                reason: priceReason || "Supplier submission",
              }, userName);
              toast.success("Price change submitted — pending internal approval.");
              setPriceFor(null);
            }}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PO confirmation */}
      <Dialog open={!!poDialog} onOpenChange={(o) => !o && setPoDialog(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader><DialogTitle>Confirm Purchase Order {poDialog}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <F label="Confirmed Quantity (partial fulfilment allowed)"><Input type="number" value={poQty} onChange={(e) => setPoQty(e.target.value)} /></F>
            <F label="Expected Delivery Date"><Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} /></F>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPoDialog(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!poDate) { toast.error("Enter an expected delivery date."); return; }
              store.confirmPo(poDialog!, Number(poQty), poDate, userName);
              toast.success("Purchase order confirmed.");
              setPoDialog(null);
            }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function F({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className}`}><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}