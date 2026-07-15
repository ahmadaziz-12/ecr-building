import { useMemo, useState } from "react";
import {
  Barcode,
  CreditCard,
  Minus,
  Plus,
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
  Radar,
  CheckCircle2,
  ShoppingCart,
} from "lucide-react";
import { productImage } from "@/lib/buildpos/product-images";

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
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q),
    );
  }, [query]);

  function addToCart(p: (typeof products)[number]) {
    setCart((c) => {
      const line = c.find((l) => l.sku === p.sku);
      if (line) return c.map((l) => (l.sku === p.sku ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { sku: p.sku, name: p.name, uom: p.uom, price: p.price, qty: 1 }];
    });
    setLastAdded(p.sku);
    setQuery("");
    window.setTimeout(() => setLastAdded((cur) => (cur === p.sku ? null : cur)), 900);
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
  const discount = cart.length ? subtotal * 0.05 : 0;
  const taxable = subtotal - discount;
  const vat = taxable * 0.15;
  const total = taxable + vat;

  const money = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

  const idle = query === "" && cart.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
      {/* Left — scanner-first panel */}
      <div className="flex flex-col gap-3">
        {/* Scanner hero — the ONLY primary surface */}
        <div className="relative overflow-hidden rounded-3xl border border-brand/10 bg-gradient-to-br from-[oklch(0.22_0.08_285)] via-[oklch(0.18_0.06_285)] to-[oklch(0.12_0.05_285)] p-6 text-white shadow-[0_10px_40px_-12px_rgba(76,29,149,0.5)]">
          <div className="blueprint-grid-dark absolute inset-0 opacity-40" />
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-teal/20 blur-3xl" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-white/10 backdrop-blur ring-1 ring-white/15">
                <Radar className="h-5 w-5 text-white" />
                {idle && <span className="pos-radar absolute inset-0 rounded-xl ring-2 ring-white/50" />}
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">Point&nbsp;of&nbsp;Sale · Terminal T-04</p>
                <p className="font-display text-lg font-semibold">Scanner Ready</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium ring-1 ring-white/15">
              <span className={`h-1.5 w-1.5 rounded-full bg-success ${idle ? "pos-blink" : ""}`} />
              {idle ? "Awaiting scan" : "Active"}
            </div>
          </div>

          {/* Scanning viewport */}
          <div className="relative mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur">
            {idle && (
              <>
                <span className="pos-beam pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-brand-glow to-transparent shadow-[0_0_20px_var(--brand-glow)]" />
                <span className="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-brand-glow/70" />
                <span className="pointer-events-none absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-brand-glow/70" />
                <span className="pointer-events-none absolute left-3 bottom-3 h-4 w-4 border-l-2 border-b-2 border-brand-glow/70" />
                <span className="pointer-events-none absolute right-3 bottom-3 h-4 w-4 border-r-2 border-b-2 border-brand-glow/70" />
              </>
            )}

            <div className="relative flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/25 text-brand-glow">
                <Barcode className="h-5 w-5" />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scan barcode or search product / SKU…"
                className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-brand-glow focus:bg-white/10"
                autoFocus
              />
              {idle && (
                <span className="hidden sm:flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-glow">
                  <ScanLine className="h-3 w-3 pos-scan-pulse" />
                  Scanning
                </span>
              )}
            </div>

            {idle && (
              <div className="relative mt-4 grid grid-cols-3 gap-3 text-center text-[11px] text-white/60">
                <div className="rounded-lg bg-white/5 px-2 py-2 ring-1 ring-white/10">
                  <p className="font-display text-white text-sm">Cash · Mada · STC</p>
                  <p>Payment ready</p>
                </div>
                <div className="rounded-lg bg-white/5 px-2 py-2 ring-1 ring-white/10">
                  <p className="font-display text-white text-sm">ZATCA Phase 2</p>
                  <p>Cleared · online</p>
                </div>
                <div className="rounded-lg bg-white/5 px-2 py-2 ring-1 ring-white/10">
                  <p className="font-display text-white text-sm">Shift 03 · 06:12h</p>
                  <p>Yasser · cashier</p>
                </div>
              </div>
            )}
          </div>

          {idle && (
            <p className="relative mt-4 text-center text-[11px] uppercase tracking-[0.3em] text-white/40">
              Scan an item to open the ticket
            </p>
          )}
        </div>

        {/* Results appear UNDER the scanner only when searching */}
        {query !== "" && (
          <div className="pos-slide-up rounded-2xl border border-black/5 bg-white p-3 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {shown.length} match{shown.length === 1 ? "" : "es"} for "{query}"
              </p>
              <button onClick={() => setQuery("")} className="text-[11px] font-medium text-brand hover:underline">
                Clear
              </button>
            </div>
            {shown.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No product found. Try SKU or name.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                {shown.map((p, i) => {
                  const Icon = productIcon[p.sku] ?? Package;
                  const img = productImage[p.sku];
                  return (
                    <button
                      key={p.sku}
                      onClick={() => addToCart(p)}
                      style={{ animationDelay: `${i * 40}ms` }}
                      className="pos-slide-up group relative flex flex-col items-start overflow-hidden rounded-xl border border-black/5 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
                    >
                      <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass[p.tone]}`}>
                        {p.stock} {p.uom}
                      </span>
                      <div className="relative mb-2 grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-canvas to-concrete">
                        {img ? (
                          <img
                            src={img}
                            alt={p.name}
                            loading="lazy"
                            width={200}
                            height={200}
                            className="h-full w-full object-contain p-2 transition duration-300 group-hover:scale-110"
                          />
                        ) : (
                          <Icon className="h-8 w-8 text-brand" />
                        )}
                        <span className="pointer-events-none absolute inset-0 blueprint-grid opacity-30" />
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground line-clamp-2">{p.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{p.sku}</p>
                      <p className="mt-2 font-display text-lg font-bold text-foreground">
                        {p.price.toFixed(2)} <span className="text-xs font-medium text-muted-foreground">ر.س / {p.uom}</span>
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right — cart & payment */}
      <aside className="pos-slide-up flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_2px_10px_rgba(15,10,50,0.06)]">
        <div className="flex items-center justify-between border-b border-black/5 bg-canvas px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Current Sale</p>
            <p className="font-display text-base font-semibold text-foreground">
              Ticket #ORD-8096
              {cart.length > 0 && (
                <span className="pos-pop ml-2 inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                  <ShoppingCart className="h-3 w-3" /> {cart.reduce((s, l) => s + l.qty, 0)}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-1">
            <button className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5" title="Add customer">
              <UserPlus className="h-4 w-4" />
            </button>
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
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-canvas text-muted-foreground">
                <ShoppingCart className="h-5 w-5" />
              </span>
              <p className="text-sm text-muted-foreground">Cart is empty</p>
              <p className="text-[11px] text-muted-foreground/70">Scanned items will appear here.</p>
            </div>
          )}
          {cart.map((l) => (
            <div key={l.sku} className={`px-4 py-3 ${lastAdded === l.sku ? "pos-pop bg-brand/5" : "pos-slide-up"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-10 w-10 shrink-0 overflow-hidden place-items-center rounded-md bg-canvas ring-1 ring-black/5">
                    {(() => {
                      const img = productImage[l.sku];
                      if (img) return <img src={img} alt={l.name} loading="lazy" className="h-full w-full object-contain p-0.5" />;
                      const Icon = productIcon[l.sku] ?? Package;
                      return <Icon className="h-4 w-4 text-brand" />;
                    })()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {l.name}
                      {lastAdded === l.sku && (
                        <CheckCircle2 className="pos-pop ml-1 inline h-3.5 w-3.5 text-success" />
                      )}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">{l.sku} · {l.uom}</p>
                  </div>
                </div>
                <button
                  onClick={() => removeLine(l.sku)}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-critical/10 hover:text-critical"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center rounded-lg border border-black/10 overflow-hidden">
                  <button
                    onClick={() => updateQty(l.sku, -1)}
                    className="grid h-7 w-7 place-items-center text-muted-foreground transition hover:bg-brand/10 hover:text-brand active:scale-90"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-10 text-center text-sm font-semibold">{l.qty}</span>
                  <button
                    onClick={() => updateQty(l.sku, +1)}
                    className="grid h-7 w-7 place-items-center text-muted-foreground transition hover:bg-brand/10 hover:text-brand active:scale-90"
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
            <span key={total} className="pos-pop font-display text-2xl font-bold text-brand">{money(total)}</span>
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
                disabled={cart.length === 0}
                className="flex flex-col items-center gap-1 rounded-lg border border-black/5 bg-canvas p-2 text-[11px] font-medium text-foreground transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand/5 hover:text-brand disabled:opacity-40 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
              >
                <Icon className="h-4 w-4" />
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-black/5 p-3">
          <button
            disabled={cart.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm font-medium text-foreground transition hover:border-brand/40 hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            disabled={cart.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:bg-brand/90 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand"
          >
            Pay {money(total)}
          </button>
        </div>
      </aside>
    </div>
  );
}