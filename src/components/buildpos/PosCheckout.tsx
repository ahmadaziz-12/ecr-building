import { useMemo, useState } from "react";
import {
  Barcode,
  CreditCard,
  Minus,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Pause,
  Percent,
  Printer,
  Banknote,
  Wallet,
  Smartphone,
  Building2,
  Gift,
  RotateCcw,
  FileText,
  Package,
  Layers,
  PaintBucket,
  Hammer,
  Wrench,
  Zap,
  Square,
  ScanLine,
  Blocks,
  Cable,
  Cog,
  Droplet,
  Pipette,
  Brush,
  Grid3x3,
  Component,
} from "lucide-react";

const categories = [
  { name: "All", icon: Layers },
  { name: "Cement", icon: Blocks },
  { name: "Steel", icon: Component },
  { name: "Tiles", icon: Square },
  { name: "Paint", icon: PaintBucket },
  { name: "Plumbing", icon: Wrench },
  { name: "Electrical", icon: Zap },
  { name: "Tools", icon: Hammer },
];

type IconType = typeof Package;

const productIcon: Record<string, IconType> = {
  "CEM-OPC-50KG": Blocks,
  "CEM-WHT-40KG": Blocks,
  "STEEL-RBR-12MM": Component,
  "STEEL-RBR-16MM": Component,
  "TILE-GRY-60X60": Grid3x3,
  "TILE-MRB-80X80": Grid3x3,
  "PAINT-WHT-20L": PaintBucket,
  "PAINT-BEIGE-4L": Brush,
  "PVC-PIPE-2IN": Pipette,
  "PVC-ELB-2IN": Wrench,
  "ELEC-CBL-2.5MM": Cable,
  "ELEC-SW-1G": Zap,
  "TOOL-DRL-18V": Cog,
  "TOOL-HMR-500": Hammer,
  "GLASS-6MM-CLR": Square,
  "SEAL-SILC-300": Droplet,
};

const products = [
  { sku: "CEM-OPC-50KG", name: "OPC Cement 50KG", cat: "Cement", uom: "Bag", price: 22.5, stock: 42, tone: "warning" },
  { sku: "CEM-WHT-40KG", name: "White Cement 40KG", cat: "Cement", uom: "Bag", price: 38.0, stock: 24, tone: "success" },
  { sku: "STEEL-RBR-12MM", name: "Steel Rebar 12MM", cat: "Steel", uom: "Bundle", price: 1950, stock: 22, tone: "warning" },
  { sku: "STEEL-RBR-16MM", name: "Steel Rebar 16MM", cat: "Steel", uom: "Bundle", price: 2680, stock: 18, tone: "success" },
  { sku: "TILE-GRY-60X60", name: "Grey Tile 60x60", cat: "Tiles", uom: "Box", price: 44.0, stock: 12, tone: "critical" },
  { sku: "TILE-MRB-80X80", name: "Marble Tile 80x80", cat: "Tiles", uom: "Box", price: 120, stock: 34, tone: "success" },
  { sku: "PAINT-WHT-20L", name: "White Paint 20L", cat: "Paint", uom: "Can", price: 220, stock: 8, tone: "critical" },
  { sku: "PAINT-BEIGE-4L", name: "Beige Paint 4L", cat: "Paint", uom: "Can", price: 68, stock: 42, tone: "success" },
  { sku: "PVC-PIPE-2IN", name: "PVC Pipe 2 Inch", cat: "Plumbing", uom: "Piece", price: 32, stock: 34, tone: "warning" },
  { sku: "PVC-ELB-2IN", name: "PVC Elbow 2 Inch", cat: "Plumbing", uom: "Piece", price: 6, stock: 220, tone: "success" },
  { sku: "ELEC-CBL-2.5MM", name: "Cable 2.5MM (m)", cat: "Electrical", uom: "Meter", price: 4.2, stock: 90, tone: "warning" },
  { sku: "ELEC-SW-1G", name: "Wall Switch 1G", cat: "Electrical", uom: "Piece", price: 18, stock: 120, tone: "success" },
  { sku: "TOOL-DRL-18V", name: "Cordless Drill 18V", cat: "Tools", uom: "Piece", price: 540, stock: 34, tone: "success" },
  { sku: "TOOL-HMR-500", name: "Claw Hammer 500g", cat: "Tools", uom: "Piece", price: 42, stock: 88, tone: "success" },
  { sku: "GLASS-6MM-CLR", name: "Clear Glass 6MM", cat: "Tiles", uom: "m²", price: 180, stock: 62, tone: "success" },
  { sku: "SEAL-SILC-300", name: "Silicone Sealant", cat: "Tools", uom: "Tube", price: 22, stock: 140, tone: "success" },
];

const toneClass: Record<string, string> = {
  success: "bg-success/10 text-[oklch(0.35_0.1_155)]",
  warning: "bg-warning/20 text-[oklch(0.4_0.13_70)]",
  critical: "bg-critical/10 text-critical",
};

type CartLine = { sku: string; name: string; uom: string; price: number; qty: number };

export function PosCheckout() {
  const [activeCat, setActiveCat] = useState("All");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([
    { sku: "CEM-OPC-50KG", name: "OPC Cement 50KG", uom: "Bag", price: 22.5, qty: 20 },
    { sku: "STEEL-RBR-12MM", name: "Steel Rebar 12MM", uom: "Bundle", price: 1950, qty: 2 },
    { sku: "PAINT-BEIGE-4L", name: "Beige Paint 4L", uom: "Can", price: 68, qty: 4 },
  ]);

  const shown = useMemo(
    () =>
      products.filter(
        (p) =>
          (activeCat === "All" || p.cat === activeCat) &&
          (query === "" ||
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.sku.toLowerCase().includes(query.toLowerCase()))
      ),
    [activeCat, query]
  );

  function addToCart(p: (typeof products)[number]) {
    setCart((c) => {
      const line = c.find((l) => l.sku === p.sku);
      if (line) return c.map((l) => (l.sku === p.sku ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { sku: p.sku, name: p.name, uom: p.uom, price: p.price, qty: 1 }];
    });
  }

  function updateQty(sku: string, delta: number) {
    setCart((c) =>
      c.flatMap((l) => (l.sku === sku ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]) : [l]))
    );
  }
  function removeLine(sku: string) {
    setCart((c) => c.filter((l) => l.sku !== sku));
  }

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const discount = subtotal * 0.05;
  const taxable = subtotal - discount;
  const vat = taxable * 0.15;
  const total = taxable + vat;

  const money = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
      {/* Left — product panel */}
      <div className="flex flex-col gap-3">
        {/* Search */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/5 bg-white p-2 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
          <div className="relative flex-1 min-w-[240px]">
            {/* Scanning device animation — only surface here */}
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <div className="relative grid h-6 w-6 place-items-center rounded-md bg-brand/10 text-brand overflow-hidden">
                <Barcode className="h-3.5 w-3.5" />
                {query === "" && (
                  <span className="pos-scan-line pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-brand shadow-[0_0_6px_var(--brand)]" />
                )}
              </div>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scan barcode or search product / SKU…"
              className="h-11 w-full rounded-xl border border-black/10 bg-canvas pl-12 pr-3 text-sm outline-none focus:border-brand"
              autoFocus
            />
            {query === "" && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand/70">
                <ScanLine className="h-3 w-3 pos-scan-pulse" />
                Scanning…
              </span>
            )}
          </div>
          <button className="flex h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium hover:border-brand/40 hover:text-brand">
            <UserPlus className="h-4 w-4" /> Add Customer
          </button>
          <button className="flex h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium hover:border-brand/40 hover:text-brand">
            <Search className="h-4 w-4" /> Stock Check
          </button>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-black/5 bg-white p-2 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
          {categories.map((c) => {
            const Icon = c.icon;
            const active = activeCat === c.name;
            return (
              <button
                key={c.name}
                onClick={() => setActiveCat(c.name)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "text-foreground hover:bg-canvas hover:text-brand"
                }`}
              >
                <Icon className="h-4 w-4" /> {c.name}
              </button>
            );
          })}
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {shown.map((p) => {
            const Icon = productIcon[p.sku] ?? Package;
            return (
            <button
              key={p.sku}
              onClick={() => addToCart(p)}
              className="group relative flex flex-col items-start rounded-xl border border-black/5 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
            >
              <span
                className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass[p.tone]}`}
              >
                {p.stock} {p.uom}
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-brand-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-2 text-sm font-medium text-foreground line-clamp-2">{p.name}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{p.sku}</p>
              <p className="mt-2 font-display text-lg font-bold text-foreground">
                {p.price.toFixed(2)} <span className="text-xs font-medium text-muted-foreground">ر.س / {p.uom}</span>
              </p>
            </button>
            );
          })}
        </div>
      </div>

      {/* Right — cart & payment */}
      <aside className="flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_2px_10px_rgba(15,10,50,0.06)]">
        <div className="flex items-center justify-between border-b border-black/5 bg-canvas px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Current Sale</p>
            <p className="font-display text-base font-semibold text-foreground">Ticket #ORD-8096</p>
          </div>
          <div className="flex gap-1">
            <button className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5" title="Park sale">
              <Pause className="h-4 w-4" />
            </button>
            <button className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5" title="New quotation">
              <FileText className="h-4 w-4" />
            </button>
            <button className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5" title="Return">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-black/5 px-4 py-2 text-xs">
          <p className="text-muted-foreground">Customer</p>
          <p className="font-medium text-foreground">Al Noor Contracting · Contractor · Credit 500,000 ر.س</p>
        </div>

        <div className="max-h-[42vh] flex-1 divide-y divide-black/5 overflow-y-auto">
          {cart.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Scan or tap a product to start.</div>
          )}
          {cart.map((l) => (
            <div key={l.sku} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{l.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{l.sku} · {l.uom}</p>
                </div>
                <button
                  onClick={() => removeLine(l.sku)}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-critical/10 hover:text-critical"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center rounded-lg border border-black/10">
                  <button
                    onClick={() => updateQty(l.sku, -1)}
                    className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-brand"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-10 text-center text-sm font-semibold">{l.qty}</span>
                  <button
                    onClick={() => updateQty(l.sku, +1)}
                    className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-brand"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {money(l.price * l.qty)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 border-t border-black/5 bg-canvas px-4 py-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal ({cart.length} lines)</span>
            <span>{money(subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span className="flex items-center gap-1">
              <Percent className="h-3.5 w-3.5" /> Contractor discount 5%
            </span>
            <span>-{money(discount)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>VAT 15%</span>
            <span>{money(vat)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-black/10 pt-2">
            <span className="font-display text-base font-semibold text-foreground">Total</span>
            <span className="font-display text-2xl font-bold text-brand">{money(total)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 border-t border-black/5 p-2">
          {[
            { label: "Cash", icon: Banknote },
            { label: "Mada", icon: CreditCard },
            { label: "Apple Pay", icon: Smartphone },
            { label: "STC Pay", icon: Wallet },
            { label: "Transfer", icon: Building2 },
            { label: "Loyalty", icon: Gift },
          ].map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.label}
                className="flex flex-col items-center gap-1 rounded-lg border border-black/5 bg-canvas p-2 text-[11px] font-medium text-foreground transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
              >
                <Icon className="h-4 w-4" />
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-black/5 p-3">
          <button className="flex items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm font-medium text-foreground hover:border-brand/40 hover:text-brand">
            <Printer className="h-4 w-4" /> Print
          </button>
          <button className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm hover:bg-brand/90">
            Pay {money(total)}
          </button>
        </div>
      </aside>
    </div>
  );
}