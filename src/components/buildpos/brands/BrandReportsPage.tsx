/** BRD §80.17 — brand, customer and supplier reports. */
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { cols } from "@/lib/buildpos/grid";
import { BRAND_SALES, available, useBrandStore } from "@/lib/catalog/brand-store";
import { money } from "@/components/buildpos/brands/shared";

export function BrandReportsPage() {
  const store = useBrandStore();
  const [tab, setTab] = useState("Customer & Sales");

  const bySupplier = useMemo(() => {
    const map = new Map<string, { brands: Set<string>; categories: Set<string>; skus: number; lead: number[]; fill: number[] }>();
    for (const m of store.mappings) {
      const e = map.get(m.supplier) ?? { brands: new Set(), categories: new Set(), skus: 0, lead: [], fill: [] };
      e.brands.add(m.brand); e.categories.add(m.category); e.lead.push(m.leadTimeDays);
      map.set(m.supplier, e);
    }
    for (const o of store.offers) {
      const e = map.get(o.supplier);
      if (e) { e.skus += 1; e.fill.push(o.fillRatePct); }
    }
    return [...map.entries()].map(([supplier, e]) => ({
      supplier, brands: [...e.brands], categories: [...e.categories], skus: e.skus,
      lead: e.lead.length ? (e.lead.reduce((a, b) => a + b, 0) / e.lead.length).toFixed(1) : "—",
      fill: e.fill.length ? Math.round(e.fill.reduce((a, b) => a + b, 0) / e.fill.length) : 0,
    }));
  }, [store.mappings, store.offers]);

  const substitutions = store.audit.filter((e) => e.event === "ALTERNATIVE_PRODUCT_SELECTED");
  const brandSelections = store.audit.filter((e) => e.event === "CUSTOMER_BRAND_SELECTED");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-xl font-semibold">Brand & Supplier Reports</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Brand performance, customer preference and supplier procurement analytics.</p>
      </header>

      <div className={`grid gap-3 ${cols(4)}`}>
        {BRAND_SALES.map((b) => (
          <div key={b.brand} className="rounded-2xl border border-black/5 bg-white p-4">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{b.brand}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{money(b.sales)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{b.units.toLocaleString()} bars · {b.share}% share</p>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          {["Customer & Sales", "Supplier & Procurement", "Certificates"].map((t) => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="Customer & Sales" className="mt-4 space-y-4">
          <SectionCard title="Sales by category and brand">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Category", "Brand", "Sales", "Units", "Share", "SKUs", "Available"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {BRAND_SALES.map((b) => {
                    const skus = store.skus.filter((s) => s.brand === b.brand);
                    return (
                      <TableRow key={b.brand}>
                        <TableCell className="whitespace-nowrap">Steel &amp; Reinforcement</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{b.brand}</TableCell>
                        <TableCell className="whitespace-nowrap">{money(b.sales)}</TableCell>
                        <TableCell>{b.units.toLocaleString()}</TableCell>
                        <TableCell>{b.share}%</TableCell>
                        <TableCell>{skus.length}</TableCell>
                        <TableCell>{skus.reduce((t, s) => t + available(s), 0)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <SectionCard title="Customer preferred brand report">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Customer", "Project Restricted", "Approved Brands", "Preferred Brands", "Preferred Grade", "Previous Purchases"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {store.preferences.map((p) => (
                    <TableRow key={p.customer}>
                      <TableCell className="whitespace-nowrap font-medium">{p.customer}</TableCell>
                      <TableCell>{p.projectRestricted ? <Pill tone="warning">Restricted</Pill> : "—"}</TableCell>
                      <TableCell className="text-xs">{p.approvedBrands.join(", ") || "Any"}</TableCell>
                      <TableCell className="text-xs">{Object.entries(p.preferredBrands).map(([c, b]) => `${c}: ${b}`).join(" · ") || "—"}</TableCell>
                      <TableCell>{p.preferredGrade ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{p.history.join(", ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <SectionCard title="Brand comparison conversion & product substitution"
            desc={`${brandSelections.length} brand selections · ${substitutions.length} alternative acceptances recorded.`}>
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Event", "Customer", "Brand", "SKU", "Reason", "User"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {[...brandSelections, ...substitutions].length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No brand selections recorded yet — use Customer View to select a brand.</TableCell></TableRow>)}
                  {[...brandSelections, ...substitutions].map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-xs font-medium">{e.event}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.customer ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.brand ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{e.sku ?? "—"}</TableCell>
                      <TableCell className="text-xs">{e.reason ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.user}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Supplier & Procurement" className="mt-4 space-y-4">
          <SectionCard title="Supplier brands, categories, lead time and fill rate">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Supplier", "Categories", "Brands", "Products", "Avg Lead Time", "Fill Rate"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {bySupplier.map((s) => (
                    <TableRow key={s.supplier}>
                      <TableCell className="whitespace-nowrap font-medium">{s.supplier}</TableCell>
                      <TableCell className="text-xs">{s.categories.join(", ")}</TableCell>
                      <TableCell className="text-xs">{s.brands.join(", ")}</TableCell>
                      <TableCell>{s.skus}</TableCell>
                      <TableCell>{s.lead} d</TableCell>
                      <TableCell><Pill tone={s.fill >= 95 ? "success" : s.fill >= 90 ? "info" : "warning"}>{s.fill}%</Pill></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <SectionCard title="Purchase cost by brand & supplier availability">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Brand", "SKU", "Supplier", "Purchase Cost", "MOQ", "Lead Time", "Available", "Preferred"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {store.offers.map((o) => {
                    const s = store.skus.find((x) => x.sku === o.sku);
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap font-medium">{s?.brand ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{o.sku}</TableCell>
                        <TableCell className="whitespace-nowrap">{o.supplier}</TableCell>
                        <TableCell className="whitespace-nowrap">{money(o.purchaseCost)}</TableCell>
                        <TableCell>{o.moq}</TableCell>
                        <TableCell>{o.leadTimeDays} d</TableCell>
                        <TableCell>{o.availableQty.toLocaleString()}</TableCell>
                        <TableCell>{o.preferred ? <Pill tone="success">Preferred</Pill> : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <SectionCard title="Price change submissions">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Reference", "Supplier", "SKU", "Current", "Proposed", "Change", "Status"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {store.priceSubmissions.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.id}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.supplier}</TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell>{money(p.currentCost)}</TableCell>
                      <TableCell>{money(p.proposedCost)}</TableCell>
                      <TableCell>{(((p.proposedCost - p.currentCost) / p.currentCost) * 100).toFixed(1)}%</TableCell>
                      <TableCell><Pill tone={p.status === "Approved" ? "success" : p.status === "Rejected" ? "critical" : "info"}>{p.status}</Pill></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Certificates" className="mt-4">
          <SectionCard title="Supplier certificate expiry">
            <div className="ui-table-scroll">
              <Table>
                <TableHeader><TableRow>{["Supplier", "SKU", "Certificate Expiry", "Status"].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {store.offers.filter((o) => o.certificateExpiry).map((o) => {
                    const days = Math.round((new Date(o.certificateExpiry!).getTime() - Date.now()) / 86400000);
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap">{o.supplier}</TableCell>
                        <TableCell className="font-mono text-xs">{o.sku}</TableCell>
                        <TableCell>{o.certificateExpiry}</TableCell>
                        <TableCell><Pill tone={days < 0 ? "critical" : days < 60 ? "warning" : "success"}>{days < 0 ? "Expired" : `${days} days remaining`}</Pill></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}