/** BRD §80.13 / §80.16 — internal supplier offer comparison and brand-aware PO creation. */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { useAuth } from "@/lib/api/auth";
import { CATEGORY_TREE, useBrandStore } from "@/lib/catalog/brand-store";
import { money } from "@/components/buildpos/brands/shared";

export function SupplierOfferComparisonPage() {
  const { user } = useAuth();
  const userName = user?.name ?? "Procurement Manager";
  const store = useBrandStore();
  const [category, setCategory] = useState(Object.keys(CATEGORY_TREE)[0]);
  const [brand, setBrand] = useState<string>("All brands");
  const [sku, setSku] = useState<string>("");
  const [qty, setQty] = useState("120");

  const skus = useMemo(
    () => store.skus.filter((s) => s.category === category && (brand === "All brands" || s.brand === brand)),
    [store.skus, category, brand],
  );
  const activeSku = skus.find((s) => s.sku === sku) ?? skus[0];
  const offers = store.offers.filter((o) => o.sku === activeSku?.sku && o.status === "Active");

  const marks = useMemo(() => {
    const m: Record<string, string[]> = {};
    if (!offers.length) return m;
    const lowest = [...offers].sort((a, b) => a.purchaseCost - b.purchaseCost)[0];
    const fastest = [...offers].sort((a, b) => a.leadTimeDays - b.leadTimeDays)[0];
    const bestFill = [...offers].sort((a, b) => b.fillRatePct - a.fillRatePct)[0];
    const lowestMoq = [...offers].sort((a, b) => a.moq - b.moq)[0];
    for (const o of offers) {
      const b: string[] = [];
      if (o.id === lowest.id) b.push("Lowest Cost");
      if (o.id === fastest.id) b.push("Fastest Delivery");
      if (o.preferred) b.push("Preferred Supplier");
      if (o.id === bestFill.id) b.push("Best Fill Rate");
      if (o.id === lowestMoq.id) b.push("Lowest Minimum Order");
      m[o.id] = b;
    }
    return m;
  }, [offers]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-xl font-semibold">Supplier Offer Comparison</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Internal only — Procurement, Inventory and Finance. Purchase cost and supplier terms are never exposed to the customer view.
        </p>
      </header>

      <SectionCard title="Select product" desc="Purchase orders may only use active supplier–brand–product relationships.">
        <div className="flex flex-wrap gap-3">
          <Select value={category} onValueChange={(v) => { setCategory(v); setBrand("All brands"); setSku(""); }}>
            <SelectTrigger className="h-9 w-60"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.keys(CATEGORY_TREE).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={brand} onValueChange={(v) => { setBrand(v); setSku(""); }}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All brands">All brands</SelectItem>
              {store.brands.filter((b) => b.categories.includes(category)).map((b) => <SelectItem key={b.id} value={b.nameEn}>{b.nameEn}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={activeSku?.sku ?? ""} onValueChange={setSku}>
            <SelectTrigger className="h-9 w-80"><SelectValue placeholder="Select SKU" /></SelectTrigger>
            <SelectContent>{skus.map((s) => <SelectItem key={s.sku} value={s.sku}>{s.brand} — {s.nameEn} ({s.sku})</SelectItem>)}</SelectContent>
          </Select>
          <Input className="h-9 w-32" type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
        </div>
      </SectionCard>

      <SectionCard title={activeSku ? `Approved supplier offers — ${activeSku.brand} ${activeSku.nameEn}` : "Approved supplier offers"}>
        <div className="ui-table-scroll">
          <Table>
            <TableHeader><TableRow>
              {["Supplier", "Purchase Cost", "Minimum Order", "Lead Time", "Available", "Payment Terms", "Fill Rate", "Certificate", "Recommendation", "Actions"].map((h) => (
                <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>))}
            </TableRow></TableHeader>
            <TableBody>
              {offers.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground">No active supplier offers for this SKU.</TableCell></TableRow>}
              {offers.map((o) => {
                const expired = o.certificateExpiry ? new Date(o.certificateExpiry) < new Date() : false;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap font-medium">{o.supplier}</TableCell>
                    <TableCell className="whitespace-nowrap">{money(o.purchaseCost)}</TableCell>
                    <TableCell>{o.moq}</TableCell>
                    <TableCell>{o.leadTimeDays} d</TableCell>
                    <TableCell>{o.availableQty.toLocaleString()}</TableCell>
                    <TableCell className="whitespace-nowrap">{o.paymentTerms}</TableCell>
                    <TableCell>{o.fillRatePct}%</TableCell>
                    <TableCell>{o.certificateExpiry ? <Pill tone={expired ? "critical" : "success"}>{expired ? "Expired" : o.certificateExpiry}</Pill> : "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(marks[o.id] ?? []).map((b) => <Pill key={b} tone={b === "Preferred Supplier" ? "success" : "info"}>{b}</Pill>)}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => store.setPreferredOffer(o.sku, o.id, userName)}>Mark Preferred</Button>
                      <Button size="sm" onClick={() => {
                        const q = Number(qty);
                        if (q < o.moq) { toast.error(`${o.supplier} requires a minimum order of ${o.moq}.`); return; }
                        store.saveOffer(o, userName);
                        store.log({
                          event: "SUPPLIER_OFFER_UPDATED", supplier: o.supplier, sku: o.sku, brand: activeSku?.brand,
                          user: userName, newValue: `PO drafted for ${q} @ ${money(o.purchaseCost)}`, severity: "info",
                        });
                        toast.success(`Purchase order drafted with ${o.supplier} for ${q} units.`);
                      }}>Create PO</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Price change submissions awaiting approval" desc="Vendor-submitted costs stay inactive until approved here.">
        <div className="ui-table-scroll">
          <Table>
            <TableHeader><TableRow>{["Reference", "Supplier", "SKU", "Current", "Proposed", "Effective", "Reason", "Status", ""].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {store.priceSubmissions.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell className="whitespace-nowrap">{p.supplier}</TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>{money(p.currentCost)}</TableCell>
                  <TableCell>{money(p.proposedCost)}</TableCell>
                  <TableCell>{p.effectiveFrom}</TableCell>
                  <TableCell className="text-xs">{p.reason}</TableCell>
                  <TableCell><Pill tone={p.status === "Approved" ? "success" : p.status === "Rejected" ? "critical" : "info"}>{p.status}</Pill></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {p.status === "Submitted" && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { store.decidePriceChange(p.id, true, userName); toast.success("Price change approved and applied to the supplier offer."); }}>Approve</Button>
                        <Button variant="ghost" size="sm" onClick={() => { store.decidePriceChange(p.id, false, userName); toast.success("Price change rejected."); }}>Reject</Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Vendor product proposals" desc="Only internal catalog users may approve a proposal and create the BuildPOS SKU.">
        <div className="ui-table-scroll">
          <Table>
            <TableHeader><TableRow>{["Proposal", "Supplier", "Brand", "Product", "Specification", "Cost", "Status", ""].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {store.proposals.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell className="whitespace-nowrap">{p.supplier}</TableCell>
                  <TableCell className="whitespace-nowrap">{p.brand}</TableCell>
                  <TableCell className="whitespace-nowrap">{p.nameEn}</TableCell>
                  <TableCell className="text-xs">{p.specification}</TableCell>
                  <TableCell>{money(p.standardCost)}</TableCell>
                  <TableCell><Pill tone={p.status === "Approved" || p.status === "Active" ? "success" : p.status === "Rejected" ? "critical" : "info"}>{p.status}</Pill></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => { store.advanceProposal(p.id, "Under Review", userName); toast.success("Proposal moved to review."); }}>Review</Button>
                    <Button variant="ghost" size="sm" onClick={() => { store.advanceProposal(p.id, "Approved", userName); toast.success("Proposal approved — SKU creation required."); }}>Approve</Button>
                    <Button variant="ghost" size="sm" onClick={() => { store.advanceProposal(p.id, "Rejected", userName); toast.success("Proposal rejected."); }}>Reject</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}