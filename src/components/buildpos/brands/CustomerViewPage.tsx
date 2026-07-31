/** BRD §80.4–§80.9 & §80.14–§80.15 — assisted in-store customer product discovery. */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { GitCompare, Grid3X3, List, Search, ShoppingCart, Star, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { cols } from "@/lib/buildpos/grid";
import { useAuth } from "@/lib/api/auth";
import {
  ATTRIBUTE_FILTERS, BRANCH_LIST, CATEGORY_TREE, alternativesFor, available,
  otherBranchStock, stockStatus, useBrandStore, type CatalogSku,
} from "@/lib/catalog/brand-store";
import { brandImage, money, stockTone } from "@/components/buildpos/brands/shared";

type View = "Cards" | "Compare" | "List";

export function CustomerViewPage() {
  const { user } = useAuth();
  const userName = user?.name ?? "Cashier";
  const store = useBrandStore();

  const [category, setCategory] = useState(Object.keys(CATEGORY_TREE)[0]);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [brandFilter, setBrandFilter] = useState<string>("All brands");
  const [branch, setBranch] = useState(BRANCH_LIST[0]);
  const [customer, setCustomer] = useState(store.preferences[0].customer);
  const [view, setView] = useState<View>("Cards");
  const [q, setQ] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [cart, setCart] = useState<{ sku: CatalogSku; qty: number; uom: string }[]>([]);
  const [uomBySku, setUomBySku] = useState<Record<string, string>>({});
  const [qtyBySku, setQtyBySku] = useState<Record<string, number>>({});

  const pref = store.preferences.find((p) => p.customer === customer)!;
  const preferredBrand = pref.preferredBrands[category];

  const matching = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = store.skus.filter((s) => s.category === category && s.status === "Active");
    if (subcategory) list = list.filter((s) => s.subcategory === subcategory);
    for (const [k, v] of Object.entries(attrs)) if (v) list = list.filter((s) => s.attributes[k] === v);
    if (brandFilter !== "All brands") list = list.filter((s) => s.brand === brandFilter);
    if (term) {
      const tokens = term.split(/\s+/);
      list = list.filter((s) => tokens.every((t) =>
        `${s.sku} ${s.brand} ${s.nameEn} ${s.nameAr ?? ""} ${s.category} ${s.subcategory} ${Object.values(s.attributes).join(" ")}`
          .toLowerCase().includes(t)));
    }
    // §80.9 — customer-preferred brands first, then in-stock, then price.
    return [...list].sort((a, b) =>
      Number(b.brand === preferredBrand) - Number(a.brand === preferredBrand) ||
      Number(available(b, branch) > 0) - Number(available(a, branch) > 0) ||
      a.retailPrice - b.retailPrice);
  }, [store.skus, category, subcategory, attrs, brandFilter, q, preferredBrand, branch]);

  const searchSummary = useMemo(() => {
    const brands = new Set(matching.map((s) => s.brand));
    return {
      brands: brands.size,
      products: matching.length,
      here: matching.filter((s) => available(s, branch) > 0).length,
      elsewhere: matching.filter((s) => available(s, branch) <= 0 && available(s) > 0).length,
      out: matching.filter((s) => available(s) <= 0).length,
    };
  }, [matching, branch]);

  const badges = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!matching.length) return map;
    const inStock = matching.filter((s) => available(s, branch) > 0);
    const cheapest = [...matching].sort((a, b) => a.retailPrice - b.retailPrice)[0];
    const bestValue = [...inStock].sort((a, b) => a.retailPrice - b.retailPrice)[0];
    for (const s of matching) {
      const b: string[] = [];
      const brand = store.brands.find((x) => x.nameEn === s.brand);
      if (brand?.preferred) b.push("Preferred");
      if (s.brand === preferredBrand) b.push("Customer Preferred");
      if (cheapest?.sku === s.sku) b.push("Lowest Price");
      if (bestValue?.sku === s.sku && cheapest?.sku !== s.sku) b.push("Best Value");
      if (s.deliveryNote.toLowerCase().includes("today")) b.push("Fastest Delivery");
      const st = stockStatus(s, branch);
      if (st === "Low Stock") b.push("Low Stock");
      if (st === "Out of Stock") b.push("Out of Stock");
      if (pref.preferredGrade && s.attributes.Grade && s.attributes.Grade !== pref.preferredGrade) b.push("Alternative Grade");
      map[s.sku] = b;
    }
    return map;
  }, [matching, branch, store.brands, preferredBrand, pref.preferredGrade]);

  const compared = matching.filter((s) => compare.includes(s.sku)).slice(0, 4);

  function toggleCompare(sku: string) {
    setCompare((c) => c.includes(sku) ? c.filter((x) => x !== sku)
      : c.length >= 4 ? (toast.error("You can compare up to four products."), c) : [...c, sku]);
  }

  function addToCart(s: CatalogSku, viaAlternative?: string) {
    if (pref.projectRestricted && pref.approvedBrands.length && !pref.approvedBrands.includes(s.brand)) {
      toast.error(`${customer} is project-restricted — ${s.brand} needs manager approval before it can be sold.`);
      return;
    }
    if (pref.preferredGrade && s.attributes.Grade && s.attributes.Grade !== pref.preferredGrade) {
      toast.warning("Different Grade — Customer Confirmation Required");
    }
    const uom = uomBySku[s.sku] ?? s.stockUom;
    const qty = qtyBySku[s.sku] ?? 1;
    setCart((c) => [...c, { sku: s, qty, uom }]);
    store.selectBrandForCustomer(customer, s, userName, viaAlternative);
    toast.success(`${qty} ${uom} · ${s.brand} ${s.nameEn} added to cart.`);
  }

  function lineTotal(s: CatalogSku, qty: number, uom: string) {
    const factor = s.conversions[uom] ?? 1;
    const unit = uom === s.bulkUom && s.bulkPrice ? s.bulkPrice / factor : s.retailPrice;
    return unit * factor * qty;
  }

  const cartTotal = cart.reduce((t, l) => t + lineTotal(l.sku, l.qty, l.uom), 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold">Customer View — Brand Discovery</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Assisted in-store browsing by category → brand → specification. Supplier cost, margin and contract terms are never shown here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={customer} onValueChange={setCustomer}>
            <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{store.preferences.map((p) => <SelectItem key={p.customer} value={p.customer}>{p.customer}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{BRANCH_LIST.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex rounded-lg border border-black/10 p-0.5">
            {(["Cards", "Compare", "List"] as View[]).map((v) => (
              <Button key={v} size="sm" variant={view === v ? "default" : "ghost"} className="h-7" onClick={() => setView(v)}>
                {v === "Cards" ? <Grid3X3 className="mr-1 size-3.5" /> : v === "Compare" ? <GitCompare className="mr-1 size-3.5" /> : <List className="mr-1 size-3.5" />}
                {v}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {pref.projectRestricted && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <strong>{customer}</strong> is project-restricted. Approved brands: {pref.approvedBrands.join(", ")} · Approved grade: {pref.preferredGrade}. {pref.reason}
        </div>
      )}

      <SectionCard title="Find a material" desc="Search a general term such as “Steel 12MM” — categories, subcategories, brands and variants are all matched.">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Steel 12MM, cement, rebar grade 60…" />
          </div>
          <div className={`ui-card-grid ${cols(5)}`}>
            {[["Brands found", searchSummary.brands], ["Matching products", searchSummary.products],
              ["At this branch", searchSummary.here], ["Other branch only", searchSummary.elsewhere],
              ["Out of stock", searchSummary.out]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-black/5 bg-white px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</p>
                <p className="font-display text-lg font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.keys(CATEGORY_TREE).map((c) => (
              <Button key={c} size="sm" variant={category === c ? "default" : "outline"} className="h-7"
                onClick={() => { setCategory(c); setSubcategory(null); setAttrs({}); setBrandFilter("All brands"); setCompare([]); }}>{c}</Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_TREE[category].map((sc) => (
              <button key={sc} onClick={() => setSubcategory(subcategory === sc ? null : sc)}
                className={`rounded-full border px-3 py-1 text-xs ${subcategory === sc ? "border-brand bg-brand text-white" : "border-black/10 bg-white"}`}>{sc}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            {Object.entries(ATTRIBUTE_FILTERS[category] ?? {}).map(([name, values]) => (
              <div key={name} className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {values.map((v) => (
                    <button key={v} onClick={() => setAttrs((a) => ({ ...a, [name]: a[name] === v ? "" : v }))}
                      className={`rounded-md border px-2 py-1 text-xs ${attrs[name] === v ? "border-brand bg-brand/10 text-brand" : "border-black/10 bg-white"}`}>{v}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Brand</p>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All brands">All brands</SelectItem>
                  {store.brands.filter((b) => b.categories.includes(category)).map((b) => (
                    <SelectItem key={b.id} value={b.nameEn}>{b.nameEn}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </SectionCard>

      {view === "Cards" && (
        <div className={`ui-card-grid ${cols(4)}`}>
          {matching.map((s) => {
            const st = stockStatus(s, branch);
            const qty = qtyBySku[s.sku] ?? 1;
            const uom = uomBySku[s.sku] ?? s.stockUom;
            return (
              <div key={s.sku} className="flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white">
                <div className="aspect-[4/3] w-full overflow-hidden bg-black/5">
                  {s.imageKey && brandImage[s.imageKey] && (
                    <img src={brandImage[s.imageKey]} alt={`${s.brand} ${s.nameEn}`} loading="lazy" className="size-full object-cover" />)}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex flex-wrap gap-1">
                    {(badges[s.sku] ?? []).map((b) => (
                      <Pill key={b} tone={b === "Out of Stock" ? "critical" : b === "Low Stock" || b === "Alternative Grade" ? "warning" : b === "Preferred" || b === "Customer Preferred" ? "success" : "info"}>{b}</Pill>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-brand">{s.brand}</p>
                    <p className="font-medium leading-tight">{s.nameEn}</p>
                    {s.nameAr && <p dir="rtl" className="text-xs text-muted-foreground">{s.nameAr}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">{Object.entries(s.attributes).map(([k, v]) => `${k} ${v}`).join(" · ")} · {s.weightKg} KG</p>
                  <p className="font-display text-lg font-semibold">{money(s.retailPrice)} <span className="text-xs font-normal text-muted-foreground">per {s.stockUom} · incl. VAT {money(s.retailPrice * (1 + s.vatRate / 100))}</span></p>
                  {s.bulkPrice && <p className="text-xs text-muted-foreground">{s.bulkUom} price {money(s.bulkPrice)} (1 {s.bulkUom} = {s.conversions[s.bulkUom!]} {s.stockUom})</p>}
                  <div className="flex items-center justify-between text-xs">
                    <Pill tone={stockTone(st)}>{st} · {available(s, branch)} {s.stockUom}</Pill>
                    <span className="inline-flex items-center gap-1 text-muted-foreground"><Truck className="size-3" />{s.deliveryNote}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Warranty: {s.warranty} · {s.returnPolicy} · Loyalty {s.loyaltyClass}</p>
                  {st === "Out of Stock" && (
                    <div className="rounded-lg bg-warning/10 p-2 text-[11px]">
                      <p className="font-semibold">Other branch stock: {otherBranchStock(s, branch).join(" · ") || "None"}</p>
                      <p className="mt-1">Suggested alternatives:</p>
                      {alternativesFor(s, store.skus, branch).slice(0, 3).map((a) => (
                        <button key={a.sku.sku} className="mt-1 block w-full rounded border border-black/10 bg-white px-2 py-1 text-left"
                          onClick={() => addToCart(a.sku, a.sameGrade ? "Same-specification alternative accepted" : "Different Grade — Customer Confirmation Required")}>
                          {a.sku.brand} · {money(a.sku.retailPrice)} · {a.availableQty} available {a.sameGrade ? "" : "· Different Grade — Customer Confirmation Required"}
                        </button>
                      ))}
                      <Button size="sm" variant="outline" className="mt-2 h-7 w-full"
                        onClick={() => toast.success(`Branch transfer requested for ${s.sku} from ${otherBranchStock(s, branch)[0] ?? "another branch"}.`)}>
                        Request Stock Transfer
                      </Button>
                    </div>
                  )}
                  <div className="mt-auto flex gap-2 pt-2">
                    <Input type="number" min={1} value={qty} className="h-8 w-16"
                      onChange={(e) => setQtyBySku((m) => ({ ...m, [s.sku]: Number(e.target.value) }))} />
                    <Select value={uom} onValueChange={(v) => setUomBySku((m) => ({ ...m, [s.sku]: v }))}>
                      <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>{s.sellUoms.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 flex-1" disabled={st === "Out of Stock"} onClick={() => addToCart(s)}>
                      <ShoppingCart className="mr-1 size-3.5" /> Add
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => toggleCompare(s.sku)}>
                      {compare.includes(s.sku) ? "Remove from compare" : "Compare"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7"
                      onClick={() => { store.setCustomerPreference(customer, s.category, s.brand, userName); toast.success(`${s.brand} saved as preferred ${s.category} brand for ${customer}.`); }}>
                      <Star className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "List" && (
        <SectionCard title="Matching products">
          <div className="ui-table-scroll">
            <Table>
              <TableHeader><TableRow>
                {["Brand", "Product", "Specification", "UOM", "Retail", "Incl. VAT", "Stock", "Branch", "Delivery", "Loyalty", ""].map((h) => (
                  <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>))}
              </TableRow></TableHeader>
              <TableBody>
                {matching.map((s) => (
                  <TableRow key={s.sku}>
                    <TableCell className="whitespace-nowrap font-medium">{s.brand}</TableCell>
                    <TableCell className="whitespace-nowrap">{s.nameEn}</TableCell>
                    <TableCell className="text-xs">{Object.entries(s.attributes).map(([k, v]) => `${k} ${v}`).join(" · ")}</TableCell>
                    <TableCell>{s.stockUom}</TableCell>
                    <TableCell className="whitespace-nowrap">{money(s.retailPrice)}</TableCell>
                    <TableCell className="whitespace-nowrap">{money(s.retailPrice * (1 + s.vatRate / 100))}</TableCell>
                    <TableCell><Pill tone={stockTone(stockStatus(s, branch))}>{available(s, branch)}</Pill></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{branch}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{s.deliveryNote}</TableCell>
                    <TableCell>{s.loyaltyClass}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => addToCart(s)} disabled={available(s, branch) <= 0}>Add</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}

      {view === "Compare" && (
        <SectionCard title="Brand comparison" desc="Select up to four products in Cards view, or compare the first four matches below.">
          <div className="ui-table-scroll">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="whitespace-nowrap">Attribute</TableHead>
                {(compared.length ? compared : matching.slice(0, 4)).map((s) => (
                  <TableHead key={s.sku} className="whitespace-nowrap">{s.brand}</TableHead>))}
              </TableRow></TableHeader>
              <TableBody>
                {([
                  ["Product", (s: CatalogSku) => s.nameEn],
                  ["Grade", (s: CatalogSku) => s.attributes.Grade ?? s.attributes.Type ?? "—"],
                  ["Diameter / Bag", (s: CatalogSku) => s.attributes.Diameter ?? s.attributes["Bag Weight"] ?? "—"],
                  ["Length", (s: CatalogSku) => s.attributes.Length ?? "—"],
                  ["Weight", (s: CatalogSku) => `${s.weightKg} KG`],
                  ["Retail Price", (s: CatalogSku) => money(s.retailPrice)],
                  ["Trade Price", (s: CatalogSku) => money(s.tradePrice)],
                  ["Bulk Price", (s: CatalogSku) => (s.bulkPrice ? `${money(s.bulkPrice)} / ${s.bulkUom}` : "—")],
                  ["Available Stock", (s: CatalogSku) => `${available(s, branch)} ${s.stockUom}`],
                  ["Other Branch Stock", (s: CatalogSku) => otherBranchStock(s, branch).join(" · ") || "—"],
                  ["Delivery Time", (s: CatalogSku) => s.deliveryNote],
                  ["Country of Origin", (s: CatalogSku) => store.brands.find((b) => b.nameEn === s.brand)?.country ?? "—"],
                  ["Quality Certificate", (s: CatalogSku) => store.brands.find((b) => b.nameEn === s.brand)?.certification ?? "—"],
                  ["Return Eligibility", (s: CatalogSku) => s.returnPolicy],
                  ["Loyalty Points", (s: CatalogSku) => s.loyaltyClass],
                ] as [string, (s: CatalogSku) => string][]).map(([label, get]) => (
                  <TableRow key={label}>
                    <TableCell className="whitespace-nowrap font-medium">{label}</TableCell>
                    {(compared.length ? compared : matching.slice(0, 4)).map((s) => (
                      <TableCell key={s.sku} className="text-sm">{get(s)}</TableCell>))}
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Badges</TableCell>
                  {(compared.length ? compared : matching.slice(0, 4)).map((s) => (
                    <TableCell key={s.sku}>
                      <div className="flex flex-wrap gap-1">
                        {(badges[s.sku] ?? []).map((b) => <Pill key={b} tone={b === "Out of Stock" ? "critical" : b === "Low Stock" || b === "Alternative Grade" ? "warning" : "info"}>{b}</Pill>)}
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Add to Cart</TableCell>
                  {(compared.length ? compared : matching.slice(0, 4)).map((s) => (
                    <TableCell key={s.sku}>
                      <Button size="sm" disabled={available(s, branch) <= 0} onClick={() => addToCart(s)}>Select {s.brand}</Button>
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Cart & customer actions" desc={`Customer: ${customer}${preferredBrand ? ` · Preferred ${category} brand: ${preferredBrand}` : ""}`}>
        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lines yet. Select a brand from the discovery view above.</p>
        ) : (
          <div className="space-y-2">
            {cart.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/5 px-3 py-2 text-sm">
                <span><strong>{l.sku.brand}</strong> {l.sku.nameEn} — {l.qty} {l.uom}</span>
                <span className="text-muted-foreground">{money(lineTotal(l.sku, l.qty, l.uom))} + VAT</span>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-sm">
              <span className="font-display text-lg font-semibold">Total incl. VAT {money(cartTotal * 1.15)}</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => toast.success("Delivery requested for this basket.")}>Request Delivery</Button>
                <Button size="sm" variant="outline" onClick={() => toast.success("Quotation created from this basket.")}>Add to Quotation</Button>
                <Button size="sm" onClick={() => { toast.success("Sale sent to POS Checkout."); setCart([]); }}>Send to Checkout</Button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}