import { useEffect, useMemo, useRef, useState } from "react";
import {
  Barcode,
  Minus,
  Plus,
  Trash2,
  UserPlus,
  X,
  Pause,
  Percent,
  Printer,
  FileText,
  RotateCcw,
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
  Loader2,
  Tag,
  User,
  ChevronRight,
  ReceiptText,
} from "lucide-react";
import { toast } from "sonner";
import { productImage } from "@/lib/buildpos/product-images";
import { useProducts } from "@/lib/api/catalog";
import { useTerminals, useBranches } from "@/lib/api/admin";
import {
  useCustomers, useCheckout, useHoldSale, useResumeSale, useParkedSales, useCreateCustomer,
  lookupCustomerByPhone, validateCoupon, type CustomerDto, type ValidateCouponResponse, type PaymentInput,
} from "@/lib/api/pos";
import { useAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { PaymentDialog } from "@/components/buildpos/pos/PaymentDialog";
import { PrinterSetupDialog } from "@/components/buildpos/pos/PrinterSetupDialog";
import { ReceiptDialog } from "@/components/buildpos/pos/ReceiptDialog";
import type { OrderDto } from "@/lib/api/pos";

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

function toneForStock(available: number): "success" | "warning" | "critical" {
  if (available <= 10) return "critical";
  if (available <= 40) return "warning";
  return "success";
}

const toneClass: Record<string, string> = {
  success: "bg-success/10 text-[oklch(0.35_0.1_155)]",
  warning: "bg-warning/20 text-[oklch(0.4_0.13_70)]",
  critical: "bg-critical/10 text-critical",
};

type CartLine = { productId: number; sku: string; name: string; uom: string; price: number; vatRate: number; qty: number };
type CustomFee = { label: string; amount: number };
const CONTRACTOR_DISCOUNT_PCT = 5;
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

export function PosCheckout() {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [lastOrderNo, setLastOrderNo] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<OrderDto | null>(null);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<OrderDto | null>(null);

  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);

  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [phone, setPhone] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<ValidateCouponResponse | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const [discountType, setDiscountType] = useState<"Percentage" | "Fixed" | "">("");
  const [discountValue, setDiscountValue] = useState("");

  const [feeLabel, setFeeLabel] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [customFees, setCustomFees] = useState<CustomFee[]>([]);
  const [showHeld, setShowHeld] = useState(false);

  const { user } = useAuth();
  const { data: terminals } = useTerminals();
  const { data: customers } = useCustomers();
  const { data: branches } = useBranches(user?.branchId === null);
  const checkout = useCheckout();
  const holdSale = useHoldSale();
  const resumeSale = useResumeSale();
  const createCustomer = useCreateCustomer();

  const effectiveBranchId = user?.branchId ?? selectedBranchId ?? branches?.[0]?.id ?? null;
  const { data: liveProducts } = useProducts(true, effectiveBranchId ?? undefined);
  useEffect(() => {
    if (user?.branchId === null && selectedBranchId === null && branches?.[0]) setSelectedBranchId(branches[0].id);
  }, [user?.branchId, selectedBranchId, branches]);

  const { data: heldSales } = useParkedSales(effectiveBranchId ?? undefined);
  const terminal = terminals?.find((t) => t.branchId === effectiveBranchId) ?? terminals?.[0];

  const products = useMemo(
    () =>
      (liveProducts ?? []).map((p) => ({
        productId: p.id, sku: p.sku, barcode: p.barcode, name: p.nameEn, cat: p.categoryName, uom: p.stockUom,
        price: p.sellingPrice, vatRate: p.vatRate, stock: p.totalAvailable, tone: toneForStock(p.totalAvailable),
      })),
    [liveProducts],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.cat.toLowerCase().includes(q) ||
        (p.barcode?.toLowerCase().includes(q) ?? false),
    );
  }, [query, products]);

  // Barcode scanners act as keyboards: they type the code then send Enter. A real POS should add
  // the item straight to the cart on that Enter, no manual click — this is what makes it "scan".
  function submitScan(raw: string) {
    const q = raw.trim().toLowerCase();
    if (!q) return;
    const match = products.find((p) => p.barcode?.toLowerCase() === q) ?? products.find((p) => p.sku.toLowerCase() === q);
    if (match) {
      addToCart(match);
    } else {
      toast.error(`No product found for "${raw}"`);
    }
  }

  function handleScanEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    submitScan(query);
  }

  const scanInputRef = useRef<HTMLInputElement>(null);

  // Scanners fire keystrokes at whatever element has focus. So the terminal should be scannable
  // from anywhere on the page, not just after clicking into the search bar — capture keystrokes
  // globally and route them into the scan buffer, unless the user is deliberately typing somewhere
  // else (another field, or a dialog is open on top).
  useEffect(() => {
    if (payOpen || receiptOrder) return;

    function isTypingElsewhere() {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === scanInputRef.current) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }

    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (isTypingElsewhere()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        e.preventDefault();
        submitScan(query);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setQuery((q) => q.slice(0, -1));
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        setQuery((q) => q + e.key);
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payOpen, receiptOrder, query, products]);

  function addToCart(p: (typeof products)[number]) {
    const currentQty = cart.find((l) => l.sku === p.sku)?.qty ?? 0;
    if (currentQty + 1 > p.stock) {
      toast.error(`Only ${p.stock} ${p.uom} available at this branch.`);
      return;
    }
    setCart((c) => {
      const line = c.find((l) => l.sku === p.sku);
      if (line) return c.map((l) => (l.sku === p.sku ? { ...l, qty: line.qty + 1 } : l));
      return [...c, { productId: p.productId, sku: p.sku, name: p.name, uom: p.uom, price: p.price, vatRate: p.vatRate, qty: 1 }];
    });
    setLastAdded(p.sku);
    setQuery("");
    window.setTimeout(() => setLastAdded((cur) => (cur === p.sku ? null : cur)), 900);
  }

  function updateQty(sku: string, delta: number) {
    const line = cart.find((l) => l.sku === sku);
    if (!line) return;
    const nextQty = line.qty + delta;
    if (nextQty <= 0) {
      setCart((c) => c.filter((l) => l.sku !== sku));
      return;
    }
    const available = products.find((p) => p.sku === sku)?.stock ?? Infinity;
    if (nextQty > available) {
      toast.error(`Only ${available} available at this branch.`);
      return;
    }
    setCart((c) => c.map((l) => (l.sku === sku ? { ...l, qty: nextQty } : l)));
  }
  function removeLine(sku: string) {
    setCart((c) => c.filter((l) => l.sku !== sku));
  }

  function resetSale() {
    setCart([]);
    setCustomer(null);
    setPhone("");
    setNotFound(false);
    setCouponCode("");
    setAppliedCoupon(null);
    setDiscountType("");
    setDiscountValue("");
    setCustomFees([]);
  }

  async function handleFindCustomer() {
    if (!phone.trim()) return;
    setLookingUp(true);
    setNotFound(false);
    try {
      const found = await lookupCustomerByPhone(phone.trim());
      if (found) {
        setCustomer(found);
      } else {
        setNotFound(true);
      }
    } finally {
      setLookingUp(false);
    }
  }

  async function handleCreateCustomer() {
    if (!newCustomerName.trim() || !phone.trim()) return;
    try {
      const created = await createCustomer.mutateAsync({ nameEn: newCustomerName.trim(), phone: phone.trim() });
      setCustomer(created);
      setNotFound(false);
      toast.success(`${created.nameEn} added`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create customer");
    }
  }

  async function handleApplyCoupon() {
    if (!couponCode.trim()) return;
    setApplyingCoupon(true);
    try {
      const result = await validateCoupon(couponCode.trim().toUpperCase());
      if (!result.valid) {
        toast.error(result.reason ?? "Invalid coupon");
        return;
      }
      setAppliedCoupon(result);
      toast.success(`Coupon ${result.code} applied`);
    } catch {
      toast.error("Could not validate coupon");
    } finally {
      setApplyingCoupon(false);
    }
  }

  function addCustomFee() {
    const amount = Number(feeAmount);
    if (!feeLabel.trim() || !amount || amount <= 0) return;
    setCustomFees((f) => [...f, { label: feeLabel.trim(), amount }]);
    setFeeLabel("");
    setFeeAmount("");
  }

  async function handleHold() {
    if (cart.length === 0 || !effectiveBranchId) return;
    try {
      await holdSale.mutateAsync({
        branchId: effectiveBranchId, terminalId: terminal?.id ?? null, customerId: customer?.id ?? null,
        notes: customer ? undefined : "Walk-in", lines: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
      });
      toast.success("Sale held", { description: "Resume it anytime from Held Sales." });
      resetSale();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not hold sale");
    }
  }

  function handleResume(holdId: number) {
    const held = heldSales?.find((h) => h.id === holdId);
    if (!held) return;
    const lines: CartLine[] = held.lines.map((l) => {
      const product = products.find((p) => p.productId === l.productId);
      return { productId: l.productId, sku: l.sku, name: l.productName, uom: product?.uom ?? "Piece", price: l.unitPrice, vatRate: product?.vatRate ?? 15, qty: l.qty };
    });
    setCart(lines);
    if (held.customerId) setCustomer(customers?.find((c) => c.id === held.customerId) ?? null);
    resumeSale.mutate(holdId);
    setShowHeld(false);
    toast.success(`${held.ticketNo} resumed`);
  }

  const isContractor = customer?.type === "Contractor";
  const contractorDiscountPct = isContractor ? CONTRACTOR_DISCOUNT_PCT : 0;
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const lineTotalsSum = cart.reduce((s, l) => s + l.price * l.qty * (1 - contractorDiscountPct / 100), 0);
  const contractorDiscount = subtotal - lineTotalsSum;

  const couponAmount = appliedCoupon?.valid
    ? appliedCoupon.discountType === "Percentage" ? (lineTotalsSum * appliedCoupon.value) / 100 : appliedCoupon.value
    : 0;
  const manualValue = Number(discountValue) || 0;
  const manualAmount = discountType === "Percentage" ? (lineTotalsSum * manualValue) / 100 : discountType === "Fixed" ? manualValue : 0;
  const orderDiscount = Math.min(lineTotalsSum, couponAmount + manualAmount);
  const discountRatio = lineTotalsSum === 0 ? 0 : orderDiscount / lineTotalsSum;

  const vat = cart.reduce((s, l) => s + l.price * l.qty * (1 - contractorDiscountPct / 100) * (1 - discountRatio) * (l.vatRate / 100), 0);
  const feesTotal = customFees.reduce((s, f) => s + f.amount, 0);
  const total = lineTotalsSum - orderDiscount + vat + feesTotal;

  const idle = query === "" && cart.length === 0;

  async function handleCharge(payments: PaymentInput[]) {
    if (!effectiveBranchId) throw new Error("No branch selected.");
    const order = await checkout.mutateAsync({
      branchId: effectiveBranchId,
      terminalId: terminal?.id ?? null,
      customerId: customer?.id ?? null,
      type: isContractor ? "Contractor" : "Retail",
      lines: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
      payments,
      couponCode: appliedCoupon?.code ?? null,
      manualDiscount: discountType && manualValue > 0 ? { type: discountType, value: manualValue } : null,
      customFees,
    });
    toast.success(`Payment accepted · ${order.orderNo}`, { description: money(order.grandTotal) });
    setLastOrderNo(order.orderNo);
    setReceiptOrder(order);
    setLastCompletedOrder(order);
    resetSale();
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
      {/* Left — scanner-first panel */}
      <div className="flex flex-col gap-3">
        {/* Top bar: branch + printer setup */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {user?.branchId === null && branches ? (
              <select
                value={effectiveBranchId ?? ""}
                onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                className="h-9 rounded-lg border border-black/10 bg-white px-2 text-xs font-medium text-foreground outline-none focus:border-brand"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.nameEn}</option>
                ))}
              </select>
            ) : (
              <span className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {terminal?.branchName ?? "Branch"}
              </span>
            )}
          </div>
          <PrinterSetupDialog terminalId={terminal?.id} />
        </div>

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
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">Point&nbsp;of&nbsp;Sale · {terminal?.code ?? "Terminal"}</p>
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
                ref={scanInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleScanEnter}
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
                  <p className="font-display text-white text-sm">{user?.name ?? "Cashier"}</p>
                  <p>{user?.role ?? "cashier"}</p>
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
              <div className="p-6 text-center text-sm text-muted-foreground">No product found. Try SKU, name or barcode.</div>
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

        {/* Held sales */}
        {heldSales && heldSales.length > 0 && (
          <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Held Sales ({heldSales.length})</p>
            </div>
            <div className="space-y-1.5">
              {heldSales.map((h) => (
                <button
                  key={h.id}
                  onClick={() => handleResume(h.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-black/5 bg-canvas px-3 py-2 text-left transition hover:border-brand/40 hover:bg-brand/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{h.ticketNo} · {h.customerName ?? "Walk-in"}</p>
                    <p className="text-[11px] text-muted-foreground">{h.lines.length} item{h.lines.length === 1 ? "" : "s"} · {h.notes ?? "No notes"}</p>
                  </div>
                  <span className="flex flex-none items-center gap-1 font-mono text-sm font-semibold text-foreground">
                    {money(h.total)} <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right — cart & payment */}
      <aside className="pos-slide-up flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_2px_10px_rgba(15,10,50,0.06)]">
        <div className="flex items-center justify-between border-b border-black/5 bg-canvas px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Current Sale</p>
            <p className="font-display text-base font-semibold text-foreground">
              {lastOrderNo ? `Last: ${lastOrderNo}` : "New Sale"}
              {cart.length > 0 && (
                <span className="pos-pop ml-2 inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                  <ShoppingCart className="h-3 w-3" /> {cart.reduce((s, l) => s + l.qty, 0)}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-1">
            {customer ? (
              <button
                onClick={() => setCustomer(null)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5"
                title="Detach customer"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            ) : null}
            <button
              onClick={handleHold}
              disabled={cart.length === 0 || holdSale.isPending}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5 disabled:opacity-40"
              title="Hold sale"
            >
              {holdSale.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            </button>
            <button
              onClick={() => toast.info("Quotations are coming soon.")}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5"
              title="New quotation"
            >
              <FileText className="h-4 w-4" />
            </button>
            <button
              onClick={() => toast.info("Process returns from Finance → Returns & Refunds.")}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5"
              title="Return"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Customer lookup / create / attached */}
        <div className="border-b border-black/5 px-4 py-2.5 text-xs">
          {customer ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-brand/5 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 text-foreground">
                <User className="h-3.5 w-3.5 text-brand" />
                <span className="font-medium">{customer.nameEn}</span>
                <span className="text-muted-foreground">· {customer.type} · {customer.phone}</span>
              </div>
              <button onClick={() => setCustomer(null)} className="text-muted-foreground hover:text-critical"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setNotFound(false); }}
                    onKeyDown={(e) => e.key === "Enter" && handleFindCustomer()}
                    placeholder="Customer phone (or leave blank for walk-in)"
                    className="h-8 w-full rounded-md border border-black/10 bg-white pl-8 pr-2 text-xs outline-none focus:border-brand"
                  />
                </div>
                <button
                  onClick={handleFindCustomer}
                  disabled={!phone.trim() || lookingUp}
                  className="h-8 rounded-md border border-black/10 bg-canvas px-2.5 text-xs font-medium hover:border-brand/40 disabled:opacity-40"
                >
                  {lookingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Find"}
                </button>
              </div>
              {notFound && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-2">
                  <p className="mb-1.5 text-[11px] font-medium text-[oklch(0.4_0.13_70)]">Not found — save as new customer?</p>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Customer name"
                      autoFocus
                      className="h-8 flex-1 rounded-md border border-black/10 bg-white px-2 text-xs outline-none focus:border-brand"
                    />
                    <button
                      onClick={handleCreateCustomer}
                      disabled={!newCustomerName.trim() || createCustomer.isPending}
                      className="h-8 rounded-md bg-brand px-2.5 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-40"
                    >
                      {createCustomer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                    </button>
                    <button onClick={() => setNotFound(false)} className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-black/5">Skip</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="max-h-[32vh] flex-1 divide-y divide-black/5 overflow-y-auto">
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

        {/* Coupon / discount / custom fee controls */}
        <div className="space-y-2 border-t border-black/5 bg-canvas px-4 py-2.5 text-xs">
          {appliedCoupon?.valid ? (
            <div className="flex items-center justify-between rounded-md bg-brand/10 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 font-medium text-brand"><Tag className="h-3.5 w-3.5" /> {appliedCoupon.code} — saves {money(couponAmount)}</span>
              <button onClick={() => setAppliedCoupon(null)} className="text-brand hover:text-critical"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Tag className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                  placeholder="Coupon code"
                  className="h-8 w-full rounded-md border border-black/10 bg-white pl-8 pr-2 text-xs uppercase outline-none focus:border-brand"
                />
              </div>
              <button
                onClick={handleApplyCoupon}
                disabled={!couponCode.trim() || applyingCoupon}
                className="h-8 rounded-md border border-black/10 bg-white px-2.5 text-xs font-medium hover:border-brand/40 disabled:opacity-40"
              >
                {applyingCoupon ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as typeof discountType)}
              className="h-8 rounded-md border border-black/10 bg-white px-1.5 text-xs outline-none focus:border-brand"
            >
              <option value="">Manual discount…</option>
              <option value="Percentage">% off</option>
              <option value="Fixed">SAR off</option>
            </select>
            <input
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              disabled={!discountType}
              placeholder="0"
              className="h-8 w-20 rounded-md border border-black/10 bg-white px-2 text-xs outline-none focus:border-brand disabled:opacity-40"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <input
              value={feeLabel}
              onChange={(e) => setFeeLabel(e.target.value)}
              placeholder="Custom fee (e.g. Delivery)"
              className="h-8 flex-1 rounded-md border border-black/10 bg-white px-2 text-xs outline-none focus:border-brand"
            />
            <input
              type="number"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
              placeholder="0.00"
              className="h-8 w-20 rounded-md border border-black/10 bg-white px-2 text-xs outline-none focus:border-brand"
            />
            <button onClick={addCustomFee} className="h-8 rounded-md border border-black/10 bg-white px-2.5 text-xs font-medium hover:border-brand/40">
              Add
            </button>
          </div>
          {customFees.map((f, i) => (
            <div key={i} className="flex items-center justify-between rounded-md bg-white px-2.5 py-1">
              <span className="text-foreground">{f.label}</span>
              <span className="flex items-center gap-1.5">
                {money(f.amount)}
                <button onClick={() => setCustomFees((fs) => fs.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-critical"><X className="h-3 w-3" /></button>
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 border-t border-black/5 bg-canvas px-4 py-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal ({cart.length} lines)</span>
            <span>{money(subtotal)}</span>
          </div>
          {contractorDiscountPct > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5" /> Contractor discount {contractorDiscountPct}%
              </span>
              <span>-{money(contractorDiscount)}</span>
            </div>
          )}
          {orderDiscount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Coupon / manual discount</span>
              <span>-{money(orderDiscount)}</span>
            </div>
          )}
          {feesTotal > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Fees</span>
              <span>{money(feesTotal)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>VAT</span>
            <span>{money(vat)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-black/10 pt-2">
            <span className="font-display text-base font-semibold text-foreground">Total</span>
            <span key={total} className="pos-pop font-display text-2xl font-bold text-brand">{money(Math.max(0, total))}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-black/5 p-3">
          <button
            disabled={!lastCompletedOrder}
            onClick={() => setReceiptOrder(lastCompletedOrder)}
            className="flex items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm font-medium text-foreground transition hover:border-brand/40 hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="h-4 w-4" /> Reprint
          </button>
          <button
            onClick={() => setPayOpen(true)}
            disabled={cart.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:bg-brand/90 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand"
          >
            <ReceiptText className="h-4 w-4" /> Charge {money(Math.max(0, total))}
          </button>
        </div>
      </aside>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} total={Math.max(0, total)} onCharge={handleCharge} />
      <ReceiptDialog order={receiptOrder} terminalId={terminal?.id ?? null} onClose={() => setReceiptOrder(null)} />
    </div>
  );
}
