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
  Truck,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { productImage } from "@/lib/buildpos/product-images";
import { useProducts, type ProductUomConversionDto } from "@/lib/api/catalog";
import { areaOf, factorToStock, sellableUoms, toStockQty, unitPriceFor } from "@/lib/buildpos/uom";
import { nextTierProgress, qualifiesForFreeDelivery, tierDiscountPct, type LoyaltyTierConfig } from "@/lib/buildpos/loyalty";
import { useBundles, type BundleDto } from "@/lib/api/bundles";
import { enqueueCheckout, isNetworkError, newClientRequestId, readQueue, replayQueue } from "@/lib/buildpos/offline-queue";
import { useCreateQuotation } from "@/lib/api/pos";
import { apiPost } from "@/lib/api/client";
import { useTerminals, useBranches } from "@/lib/api/admin";
import {
  useCustomers, useCheckout, useHoldSale, useResumeSale, useParkedSales, useCreateCustomer, useLoyaltyConfig,
  lookupCustomerByPhone, validateCoupon, type CustomerDto, type ValidateCouponResponse, type PaymentInput, type DeliveryDetailsInput,
} from "@/lib/api/pos";
import { useZonesApi, useDriversApi, useVehiclesApi } from "@/lib/api/delivery";
import { useAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { PaymentDialog } from "@/components/buildpos/pos/PaymentDialog";
import { PrinterSetupDialog } from "@/components/buildpos/pos/PrinterSetupDialog";
import { ReceiptDialog } from "@/components/buildpos/pos/ReceiptDialog";
import { RequestApprovalDialog } from "@/components/buildpos/pos/RequestApprovalDialog";
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

// BRD §2.3 UOM engine: `uom`/`price` are the SELLING unit the cashier picked (price = basePrice ×
// factorToStock); `basePrice` stays per stock UOM so switching units re-derives instead of
// compounding. Cut-to-size lines (isCutToSize) carry the entered dimensions and qty = computed m².
type CartLine = {
  productId: number; sku: string; name: string; uom: string; price: number; vatRate: number; qty: number;
  stockUom: string; basePrice: number; factorToStock: number; conversions: ProductUomConversionDto[];
  isCutToSize: boolean; lengthM?: number; widthM?: number;
  // BRD §3.5: cashier flags this line for delivery instead of counter pickup — a sale can mix
  // flagged and unflagged lines (partial delivery).
  requiresDelivery?: boolean;
};
type CustomFee = { label: string; amount: number };
// Module 8 (BRD §5.2): a bundle in the cart — kept as one grouped entry (the server expands it into
// constituent order lines at checkout). vatPerUnit = Σ constituent bundle-share price × its own VAT
// rate, so the client total matches the server's per-item VAT math.
type BundleCartEntry = { bundleId: number; code: string; name: string; qty: number; bundlePrice: number; individualTotal: number; vatPerUnit: number };
const CONTRACTOR_DISCOUNT_PCT = 5;
// BRD §10.2 default: auto-lock after 3 minutes of inactivity (Module 15).
const IDLE_LOCK_MS = 3 * 60 * 1000;
// sessionStorage key the Cashier Workspace uses to hand a parked-sale id to this screen for resume.
export const RESUME_HOLD_KEY = "buildpos.resume-hold-id";
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

export function PosCheckout() {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [bundleCart, setBundleCart] = useState<BundleCartEntry[]>([]);
  // Module 11: optional B2B PO reference + project code, carried to the tax invoice.
  const [poReference, setPoReference] = useState("");
  const [orderProjectCode, setOrderProjectCode] = useState("");
  // Module 15: idle auto-lock state.
  const [locked, setLocked] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [lastOrderNo, setLastOrderNo] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payInitialTab, setPayInitialTab] = useState<"cash" | "points">("cash");
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
  // Id of an Approved ApprovalRequest (Type=Discount) covering the current manual discount — required
  // by the backend whenever the discount exceeds the cashier's own BRD §10.1 authorization ceiling.
  // Cleared whenever the discount type/value changes, since a stale approval no longer matches.
  const [discountApprovalId, setDiscountApprovalId] = useState<number | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  // Same pattern as the discount ceiling above, for BRD §4.2 B2B credit-limit enforcement.
  const [creditApprovalId, setCreditApprovalId] = useState<number | null>(null);
  const [creditApprovalDialogOpen, setCreditApprovalDialogOpen] = useState(false);

  const [feeLabel, setFeeLabel] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [customFees, setCustomFees] = useState<CustomFee[]>([]);

  // BRD §3.5: one shared delivery detail set for every delivery-flagged line in this cart.
  const [deliveryAddressType, setDeliveryAddressType] = useState<"Customer Address" | "Project Site" | "Different Address" | "Branch Pickup">("Customer Address");
  const [deliveryContactName, setDeliveryContactName] = useState("");
  const [deliveryContactMobile, setDeliveryContactMobile] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryDistrict, setDeliveryDistrict] = useState("");
  const [deliveryStreet, setDeliveryStreet] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("09:00");
  const [deliveryPriority, setDeliveryPriority] = useState<"Urgent" | "High" | "Standard" | "Low">("Standard");
  const [deliveryZoneId, setDeliveryZoneId] = useState<number | null>(null);
  const [deliveryDriverId, setDeliveryDriverId] = useState<number | null>(null);
  const [deliveryVehicleId, setDeliveryVehicleId] = useState<number | null>(null);

  const { user } = useAuth();
  const { data: terminals } = useTerminals();
  const { data: customers } = useCustomers();
  const { data: branches } = useBranches(user?.branchId === null);
  const { data: deliveryZones } = useZonesApi();
  const { data: deliveryDrivers } = useDriversApi();
  const { data: deliveryVehicles } = useVehiclesApi();
  const checkout = useCheckout();
  const holdSale = useHoldSale();
  const resumeSale = useResumeSale();
  const createCustomer = useCreateCustomer();
  const createQuotation = useCreateQuotation();

  const effectiveBranchId = user?.branchId ?? selectedBranchId ?? branches?.[0]?.id ?? null;
  const { data: liveProducts } = useProducts(true, effectiveBranchId ?? undefined);
  useEffect(() => {
    if (user?.branchId === null && selectedBranchId === null && branches?.[0]) setSelectedBranchId(branches[0].id);
  }, [user?.branchId, selectedBranchId, branches]);

  const { data: heldSales } = useParkedSales(effectiveBranchId ?? undefined);
  const { data: bundles } = useBundles();
  const activeBundles = useMemo(() => (bundles ?? []).filter((b) => b.status === "Active"), [bundles]);
  // Only ever bind a terminal that belongs to the effective branch — falling back to ANY terminal
  // would attribute sales (and drawer cash) to another branch's till, and the server hard-rejects a
  // branch/terminal mismatch at checkout. No terminal in this branch → checkout proceeds untilled.
  const terminal = terminals?.find((t) => t.branchId === effectiveBranchId);

  const products = useMemo(
    () =>
      (liveProducts ?? []).map((p) => ({
        productId: p.id, sku: p.sku, barcode: p.barcode, name: p.nameEn, cat: p.categoryName, uom: p.stockUom,
        price: p.sellingPrice, vatRate: p.vatRate, stock: p.totalAvailable, tone: toneForStock(p.totalAvailable),
        conversions: p.uomConversions ?? [], isCutToSize: p.isCutToSize ?? false,
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
    // Any overlay that owns the keyboard (payment, receipt, idle lock, approval dialogs) must fully
    // disable scan capture — otherwise keystrokes/scans leak into the hidden query buffer (items
    // could even be added behind the LOCKED screen, and a PIN typed while the field is unfocused
    // would be swallowed as a search).
    if (payOpen || receiptOrder || locked || approvalDialogOpen || creditApprovalDialogOpen) return;

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
  }, [payOpen, receiptOrder, locked, approvalDialogOpen, creditApprovalDialogOpen, query, products]);

  function addToCart(p: (typeof products)[number]) {
    const line = cart.find((l) => l.sku === p.sku);
    // A cut-to-size line's qty IS its computed area — the server derives it from the dimensions and
    // ignores the sent qty, so "scan it again" must never bump the area (the client total would
    // drift from the server total and the payment would be rejected). One line per cut product;
    // the cashier sizes it via the dimension inputs.
    if (line?.isCutToSize) {
      setLastAdded(p.sku);
      toast.info(`${p.name} is already in the cart — adjust its dimensions on the line.`);
      return;
    }
    // Stock is tracked in stock UOM — a line sold by the Pallet consumes factor × qty of it, so the
    // availability check must compare stock-UOM demand, not raw line quantities (BRD §2.3 item 7).
    const currentStockDemand = line ? toStockQty(line.qty, line.factorToStock) : 0;
    const addedStockDemand = line ? line.factorToStock : 1;
    if (currentStockDemand + addedStockDemand > p.stock) {
      toast.error(`Only ${p.stock} ${p.uom} available at this branch.`);
      return;
    }
    setCart((c) => {
      const existing = c.find((l) => l.sku === p.sku);
      if (existing) return c.map((l) => (l.sku === p.sku ? { ...l, qty: existing.qty + 1 } : l));
      // Cut-to-size products start at 1m × 1m — the cashier edits the real dimensions on the line.
      const isCut = p.isCutToSize;
      return [...c, {
        productId: p.productId, sku: p.sku, name: p.name, uom: p.uom, price: p.price, vatRate: p.vatRate,
        qty: 1, stockUom: p.uom, basePrice: p.price, factorToStock: 1, conversions: p.conversions,
        isCutToSize: isCut, lengthM: isCut ? 1 : undefined, widthM: isCut ? 1 : undefined,
      }];
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
    if (toStockQty(nextQty, line.factorToStock) > available) {
      toast.error(`Only ${available} ${line.stockUom} available at this branch.`);
      return;
    }
    setCart((c) => c.map((l) => (l.sku === sku ? { ...l, qty: nextQty } : l)));
  }

  // BRD §2.3 item 4: the cashier picks the selling UOM from a dropdown next to the quantity —
  // switching re-derives price from basePrice × factor (never compounds off the previous price) and
  // re-checks that the new stock-UOM demand still fits availability.
  function changeUom(sku: string, nextUom: string) {
    const line = cart.find((l) => l.sku === sku);
    if (!line) return;
    const factor = factorToStock(nextUom, line.stockUom, line.conversions);
    if (factor === null) {
      toast.error(`No conversion configured for ${nextUom}.`);
      return;
    }
    const available = products.find((p) => p.sku === sku)?.stock ?? Infinity;
    if (toStockQty(line.qty, factor) > available) {
      toast.error(`Only ${available} ${line.stockUom} available — ${line.qty} ${nextUom} needs ${toStockQty(line.qty, factor)}.`);
      return;
    }
    setCart((c) => c.map((l) => (l.sku === sku
      ? { ...l, uom: nextUom, factorToStock: factor, price: unitPriceFor(l.basePrice, factor) }
      : l)));
  }

  // BRD §2.3 items 5-6: dimension entry for cut-to-size lines — qty becomes the computed area, priced
  // per stock-UOM m². Zero/invalid input keeps the last valid dimensions rather than zeroing the line.
  function changeDimension(sku: string, side: "lengthM" | "widthM", raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    // The computed area is stock demand in the stock UOM (m²) — validate it against branch
    // availability exactly like every other qty change, or the cashier only finds out when the
    // server rejects the whole checkout (BRD §2.3 item 7).
    const line = cart.find((l) => l.sku === sku && l.isCutToSize);
    if (line) {
      const nextArea = areaOf(side === "lengthM" ? value : (line.lengthM ?? 0), side === "widthM" ? value : (line.widthM ?? 0));
      const available = products.find((p) => p.sku === sku)?.stock ?? Infinity;
      if (nextArea > available) {
        toast.error(`Only ${available} ${line.stockUom} available at this branch — ${nextArea.toFixed(2)} needed.`);
        return;
      }
    }
    setCart((c) => c.map((l) => {
      if (l.sku !== sku || !l.isCutToSize) return l;
      const next = { ...l, [side]: value } as CartLine;
      const area = areaOf(next.lengthM ?? 0, next.widthM ?? 0);
      return { ...next, qty: area > 0 ? area : l.qty };
    }));
  }

  function removeLine(sku: string) {
    setCart((c) => c.filter((l) => l.sku !== sku));
  }

  // BRD §3.5: toggling a line's delivery flag never removes it from the cart — the customer still
  // pays for it here, only the fulfillment method changes (counter pickup vs. shipped).
  function toggleDelivery(sku: string) {
    setCart((c) => c.map((l) => (l.sku === sku ? { ...l, requiresDelivery: !l.requiresDelivery } : l)));
  }

  // Module 8 (BRD §5.2/§5.3): out-of-stock constituents make the whole bundle unavailable; adding a
  // bundle checks every constituent's branch stock for the WHOLE quantity about to be in the cart.
  function bundleAvailability(b: BundleDto, qtyWanted: number): string | null {
    for (const line of b.lines) {
      const product = products.find((p) => p.productId === line.productId);
      const available = product?.stock ?? 0;
      if (line.qty * qtyWanted > available) {
        return `${line.productName} out of stock`;
      }
    }
    return null;
  }

  function addBundle(b: BundleDto) {
    const existing = bundleCart.find((e) => e.bundleId === b.id);
    const nextQty = (existing?.qty ?? 0) + 1;
    const blocked = bundleAvailability(b, nextQty);
    if (blocked) {
      toast.error(`Unavailable — ${blocked}.`);
      return;
    }
    setBundleCart((entries) => {
      if (existing) return entries.map((e) => (e.bundleId === b.id ? { ...e, qty: e.qty + 1 } : e));
      const priceFactor = b.individualTotal > 0 ? b.bundlePrice / b.individualTotal : 1;
      const vatPerUnit = b.lines.reduce((s, l) => s + l.qty * l.sellingPrice * priceFactor * (l.vatRate / 100), 0);
      return [...entries, { bundleId: b.id, code: b.code, name: b.nameEn, qty: 1, bundlePrice: b.bundlePrice, individualTotal: b.individualTotal, vatPerUnit }];
    });
    toast.success(`${b.nameEn} added`, { description: `Saves ${(b.individualTotal - b.bundlePrice).toFixed(2)} ر.س vs individual prices.` });
  }

  function updateBundleQty(bundleId: number, delta: number) {
    const entry = bundleCart.find((e) => e.bundleId === bundleId);
    if (!entry) return;
    const nextQty = entry.qty + delta;
    if (nextQty <= 0) {
      setBundleCart((entries) => entries.filter((e) => e.bundleId !== bundleId));
      return;
    }
    const bundle = bundles?.find((b) => b.id === bundleId);
    if (delta > 0 && bundle) {
      const blocked = bundleAvailability(bundle, nextQty);
      if (blocked) {
        toast.error(`Unavailable — ${blocked}.`);
        return;
      }
    }
    setBundleCart((entries) => entries.map((e) => (e.bundleId === bundleId ? { ...e, qty: nextQty } : e)));
  }

  function resetSale() {
    setCart([]);
    setBundleCart([]);
    setPoReference("");
    setOrderProjectCode("");
    setCustomer(null);
    setPhone("");
    setNotFound(false);
    setCouponCode("");
    setAppliedCoupon(null);
    setDiscountType("");
    setDiscountValue("");
    setCustomFees([]);
    setDeliveryContactName("");
    setDeliveryContactMobile("");
    setDeliveryCity("");
    setDeliveryDistrict("");
    setDeliveryStreet("");
    setDeliveryInstructions("");
    setDeliveryDate("");
    setDeliveryZoneId(null);
    setDeliveryDriverId(null);
    setDeliveryVehicleId(null);
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
    if (bundleCart.length > 0) {
      toast.error("Held sales don't support bundles yet — complete or remove the bundle first.");
      return;
    }
    try {
      await holdSale.mutateAsync({
        branchId: effectiveBranchId, terminalId: terminal?.id ?? null, customerId: customer?.id ?? null,
        notes: customer ? undefined : "Walk-in",
        // Parked sales don't persist a selling UOM, so hold in stock UOM (2 Pallet → 100 Bag) — the
        // resumed cart reopens at the same total value, just expressed in stock units.
        lines: cart.map((l) => ({ productId: l.productId, qty: toStockQty(l.qty, l.factorToStock) })),
      });
      toast.success("Sale held", { description: "Resume it anytime from Held Sales." });
      resetSale();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not hold sale");
    }
  }

  async function handleResume(holdId: number) {
    const held = heldSales?.find((h) => h.id === holdId);
    if (!held) return;
    // Release the hold FIRST and wait for the result — two terminals racing to resume the same
    // ticket must not both win. The loser's DELETE 404s; only the winner loads the cart, so the
    // same parked goods can never be checked out twice from two registers at once.
    try {
      await resumeSale.mutateAsync(holdId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Could not resume ${held.ticketNo} — it may have already been resumed elsewhere.`);
      return;
    }

    // A resumed ticket must open on a CLEAN register — any coupon/discount/fees/customer left over
    // from the interrupted sale would silently reprice the held ticket. resetSale() first; the held
    // ticket then contributes exactly its own lines and customer.
    resetSale();
    // Parked lines don't persist a selling UOM (they predate the UOM engine), so a resumed sale
    // always re-opens in stock UOM at the stock-UOM price — the cashier can re-pick a unit after.
    const lines: CartLine[] = held.lines.map((l) => {
      const product = products.find((p) => p.productId === l.productId);
      return {
        productId: l.productId, sku: l.sku, name: l.productName, uom: product?.uom ?? "Piece",
        price: l.unitPrice, vatRate: product?.vatRate ?? 15, qty: l.qty,
        stockUom: product?.uom ?? "Piece", basePrice: l.unitPrice, factorToStock: 1,
        conversions: product?.conversions ?? [], isCutToSize: product?.isCutToSize ?? false,
      };
    });
    setCart(lines);
    if (held.customerId) setCustomer(customers?.find((c) => c.id === held.customerId) ?? null);
    toast.success(`${held.ticketNo} resumed`);
  }

  // BRD §4.3.1-§4.3.3: earn/redeem economics AND the tier ladder — Settings-configurable (Finance >
  // Loyalty Program), fetched once here so every tier calc below (discount/multiplier/free-delivery/
  // next-tier-progress) and the redeem-points panel use the SAME live values, not stale hardcoded ones.
  const { data: loyaltyConfig } = useLoyaltyConfig(Boolean(customer?.loyaltyEnrolled));
  const tierConfig: LoyaltyTierConfig | undefined = loyaltyConfig;

  const isContractor = customer?.type === "Contractor";
  // Module 7 (BRD §4.3.2): per-line discount is the LARGER of contractor trade % and the customer's
  // loyalty tier % — mirrors OrdersController.Checkout exactly, so the display total matches the charge.
  const loyaltyTierPct = tierDiscountPct(customer?.loyaltyTier, customer?.loyaltyEnrolled, tierConfig);
  const contractorDiscountPct = Math.max(isContractor ? CONTRACTOR_DISCOUNT_PCT : 0, loyaltyTierPct);

  // BRD §4.3.3: the points balance + SAR equivalent must be visible at checkout, not just inside
  // the Charge dialog — a cashier deciding whether to offer redemption needs it up front.
  const loyaltyBalanceSar = customer && loyaltyConfig ? customer.loyaltyPoints / loyaltyConfig.pointsPerSarRedeemed : 0;
  const canRedeemPoints = Boolean(customer?.loyaltyEnrolled) && loyaltyConfig !== undefined && customer!.loyaltyPoints >= loyaltyConfig.minRedeemPoints;

  // Module 8 (BRD §5.2): bundle cart entries — priced at the bundle price with per-constituent VAT;
  // the individual-vs-bundle difference is a visible discount. No further % discount on bundle lines.
  const bundleTaxable = bundleCart.reduce((s, b) => s + b.bundlePrice * b.qty, 0);
  const bundleSavings = bundleCart.reduce((s, b) => s + Math.max(0, b.individualTotal - b.bundlePrice) * b.qty, 0);

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0) + bundleCart.reduce((s, b) => s + b.individualTotal * b.qty, 0);
  const lineTotalsSum = cart.reduce((s, l) => s + l.price * l.qty * (1 - contractorDiscountPct / 100), 0) + bundleTaxable;
  const contractorDiscount = subtotal - lineTotalsSum;

  const couponAmount = appliedCoupon?.valid
    ? appliedCoupon.discountType === "Percentage" ? (lineTotalsSum * appliedCoupon.value) / 100 : appliedCoupon.value
    : 0;
  const manualValue = Number(discountValue) || 0;
  const manualAmount = discountType === "Percentage" ? (lineTotalsSum * manualValue) / 100 : discountType === "Fixed" ? manualValue : 0;
  const orderDiscount = Math.min(lineTotalsSum, couponAmount + manualAmount);
  const discountRatio = lineTotalsSum === 0 ? 0 : orderDiscount / lineTotalsSum;

  // BRD §6.2 discount authorization tiers (mirrors the server-side check in OrdersController.Checkout):
  // Fixed-amount discounts always need Supervisor tier (ceiling ≥15% or unlimited); percentage
  // discounts are gated by the cashier's own DiscountCeilingPercent. Shown here so the cashier sees
  // *before* attempting to pay, not just after the server rejects it.
  const discountCeiling = user?.posCeilings.discountCeilingPercent ?? null;
  const discountNeedsApproval =
    discountType === "Fixed" && manualValue > 0
      ? !(discountCeiling === null || discountCeiling >= 15)
      : discountType === "Percentage" && manualValue > 0 && discountCeiling !== null && manualValue > discountCeiling;
  // "Ready" only means a request has been submitted, not that a supervisor has approved it yet — the
  // POS has no live channel to that, so the honest state is "requested, retry Charge once approved"
  // rather than claiming certainty. The server is still the source of truth at checkout time.
  const discountApprovalRequested = discountNeedsApproval && discountApprovalId !== null;

  // A previously-granted approval only covers the discount it was requested for — if the cashier
  // changes the type/value afterward, the old approval id must not silently carry over.
  useEffect(() => {
    setDiscountApprovalId(null);
  }, [discountType, discountValue]);

  const vat = cart.reduce((s, l) => s + l.price * l.qty * (1 - contractorDiscountPct / 100) * (1 - discountRatio) * (l.vatRate / 100), 0)
    + bundleCart.reduce((s, b) => s + b.vatPerUnit * b.qty * (1 - discountRatio), 0);
  // Module 7 (BRD §4.3.2): Silver+ loyalty customers get delivery fees waived on orders over SAR 500
  // — must mirror the server's waiver exactly or the payment total won't match at checkout.
  const taxableTotal = lineTotalsSum - orderDiscount;
  const freeDelivery = qualifiesForFreeDelivery(customer?.loyaltyTier, customer?.loyaltyEnrolled, taxableTotal, tierConfig);

  const hasDeliveryLines = cart.some((l) => l.requiresDelivery);
  const selectedDeliveryZone = deliveryZones?.find((z) => z.id === deliveryZoneId) ?? null;
  // BRD §3.5 "calculated ... automatically": picking a zone auto-derives the delivery fee — the
  // cashier can still add/edit a manual "Delivery" custom fee below instead if no zone applies.
  const autoDeliveryFee = hasDeliveryLines && selectedDeliveryZone && selectedDeliveryZone.fee > 0
    ? { label: `Delivery Fee (${selectedDeliveryZone.name})`, amount: selectedDeliveryZone.fee }
    : null;
  const deliveryDetailsComplete = !hasDeliveryLines
    || Boolean(deliveryContactName.trim() && deliveryContactMobile.trim() && deliveryCity.trim() && deliveryDate);

  const allFees = autoDeliveryFee ? [...customFees, autoDeliveryFee] : customFees;
  const feesTotal = allFees.reduce((s, f) => s + (freeDelivery && /delivery/i.test(f.label) ? 0 : f.amount), 0);
  const total = taxableTotal + vat + feesTotal;

  // BRD §4.2 credit limit — informational until the cashier actually picks Account Credit in
  // PaymentDialog (the backend only enforces this when that payment method is used), but shown eagerly
  // here so a B2B customer's exposure is visible while building the cart, not just at payment time.
  const isB2B = customer?.type === "Contractor" || customer?.type === "B2B";
  const availableCredit = customer ? customer.creditLimit - customer.outstanding : 0;
  const creditNeedsApproval = isB2B && total > availableCredit;

  useEffect(() => {
    setCreditApprovalId(null);
  }, [customer?.id]);

  // Convenience prefill only — never overwrites a value the cashier already typed.
  useEffect(() => {
    if (!customer) return;
    setDeliveryContactName((v) => v || customer.nameEn);
    setDeliveryContactMobile((v) => v || customer.phone || "");
    setDeliveryCity((v) => v || customer.city || "");
    setDeliveryDistrict((v) => v || customer.district || "");
  }, [customer]);

  const idle = query === "" && cart.length === 0 && bundleCart.length === 0;
  const cartIsEmpty = cart.length === 0 && bundleCart.length === 0;

  // Customer auto-suggest: name/phone substring match against the already-loaded customer list —
  // shown live under the find box (2+ characters, max 6 matches).
  const customerSuggestions = useMemo(() => {
    const term = phone.trim().toLowerCase();
    if (term.length < 2 || customer) return [];
    return (customers ?? [])
      .filter((c) => c.nameEn.toLowerCase().includes(term)
        || (c.nameAr ?? "").toLowerCase().includes(term)
        || (c.phone ?? "").includes(term))
      .slice(0, 6);
  }, [phone, customers, customer]);

  async function handleCharge(payments: PaymentInput[]) {
    if (!effectiveBranchId) throw new Error("No branch selected.");
    if (!deliveryDetailsComplete) {
      throw new Error("Delivery contact name, mobile, city and promised date are required for the flagged line(s).");
    }
    const delivery: DeliveryDetailsInput | null = hasDeliveryLines ? {
      addressType: deliveryAddressType, contactName: deliveryContactName.trim(), contactMobile: deliveryContactMobile.trim(),
      city: deliveryCity.trim(), district: deliveryDistrict.trim() || null, street: deliveryStreet.trim() || null,
      landmark: null, instructions: deliveryInstructions.trim() || null,
      promisedDate: deliveryDate, promisedTime: deliveryTime, timeSlot: null, priority: deliveryPriority,
      driverId: deliveryDriverId, vehicleId: deliveryVehicleId, zoneId: deliveryZoneId, weightTons: null,
    } : null;
    const request = {
      branchId: effectiveBranchId,
      terminalId: terminal?.id ?? null,
      customerId: customer?.id ?? null,
      type: isContractor ? "Contractor" : "Retail",
      lines: cart.map((l) => l.isCutToSize && l.lengthM && l.widthM
        ? { productId: l.productId, qty: 0, lengthM: l.lengthM, widthM: l.widthM, requiresDelivery: l.requiresDelivery }
        : { productId: l.productId, qty: l.qty, uom: l.uom, requiresDelivery: l.requiresDelivery }),
      payments,
      couponCode: appliedCoupon?.code ?? null,
      manualDiscount: discountType && manualValue > 0 ? { type: discountType, value: manualValue } : null,
      customFees: allFees,
      bundles: bundleCart.map((b) => ({ bundleId: b.bundleId, qty: b.qty })),
      poReference: poReference.trim() || null,
      projectCode: orderProjectCode.trim() || null,
      discountApprovalRequestId: discountNeedsApproval ? discountApprovalId : null,
      creditOverrideApprovalRequestId: creditNeedsApproval ? creditApprovalId : null,
      // Module 10: every checkout carries an idempotency key so an offline replay (or a retry after
      // a dropped response) can never double-sell.
      clientRequestId: newClientRequestId(),
      delivery,
    };
    try {
      const order = await checkout.mutateAsync(request);
      toast.success(`Payment accepted · ${order.orderNo}`, { description: money(order.grandTotal) });
      setLastOrderNo(order.orderNo);
      setReceiptOrder(order);
      setLastCompletedOrder(order);
      resetSale();
    } catch (err) {
      // Module 10 (BRD §13): a NETWORK failure queues the sale locally and clears the register —
      // the queue replays automatically when connectivity returns. Server rejections re-throw so
      // PaymentDialog shows the real error.
      if (!isNetworkError(err)) throw err;
      enqueueCheckout(request);
      toast.warning("Offline — sale saved locally", {
        description: `${money(total)} queued (${readQueue().length} pending). It will sync automatically when the connection returns.`,
      });
      resetSale();
    }
  }

  // Module 10: replay the offline queue when connectivity returns, once on mount (in case the app
  // reloaded while transactions were still queued), and on a periodic timer — the browser's `online`
  // event only fires when the OS network comes back, never when just the API server does (a backend
  // restart leaves queued sales stranded until reload without the timer).
  useEffect(() => {
    let draining = false;
    async function drain() {
      if (draining || readQueue().length === 0) return;
      draining = true;
      try {
        const { synced, failed } = await replayQueue();
        if (synced.length > 0) {
          toast.success(`${synced.length} offline sale(s) synced`, { description: synced.map((o) => o.orderNo).join(", ") });
        }
        for (const f of failed) {
          toast.error(`Offline sale could not be synced`, { description: f.error });
        }
      } finally {
        draining = false;
      }
    }
    void drain();
    const retryTimer = window.setInterval(() => void drain(), 60_000);
    window.addEventListener("online", drain);
    return () => {
      window.clearInterval(retryTimer);
      window.removeEventListener("online", drain);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handoff from the Cashier Workspace's "Resume Sale": it stashes the hold id and navigates here,
  // so the ticket is loaded into a real cart (resuming releases the hold server-side — doing that
  // anywhere without loading the lines would destroy the ticket's contents).
  useEffect(() => {
    const raw = sessionStorage.getItem(RESUME_HOLD_KEY);
    if (!raw || !heldSales) return;
    const holdId = Number(raw);
    if (heldSales.some((h) => h.id === holdId)) {
      sessionStorage.removeItem(RESUME_HOLD_KEY);
      handleResume(holdId);
    } else if (heldSales.length > 0 || raw) {
      // Held list is loaded but the ticket isn't in it (already resumed elsewhere / other branch).
      sessionStorage.removeItem(RESUME_HOLD_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldSales]);

  // Module 16 (BRD §3.4): convert the ACTIVE CART into a quotation — project code and customer
  // reference are mandatory, so a small prompt collects them before submitting.
  async function handleCreateQuotation() {
    if (!effectiveBranchId || cartIsEmpty) return;
    if (cart.length === 0 && bundleCart.length > 0) {
      toast.error("Quotations don't support bundles yet — complete or remove the bundle first.");
      return;
    }
    const projectCode = window.prompt("Project code (required):")?.trim();
    if (!projectCode) return;
    const customerReference = window.prompt("Customer reference (required):")?.trim();
    if (!customerReference) return;
    try {
      const quotation = await createQuotation.mutateAsync({
        branchId: effectiveBranchId,
        customerId: customer?.id ?? null,
        lines: cart.map((l) => ({ productId: l.productId, qty: toStockQty(l.qty, l.factorToStock) })),
        projectCode,
        customerReference,
      });
      toast.success(`${quotation.quoteNo} created`, { description: `Valid until ${new Date(quotation.validUntil).toLocaleDateString()} · no stock reserved.` });
      resetSale();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the quotation.");
    }
  }

  // Module 15 (BRD §10.2): idle auto-lock — after 3 minutes without input the POS locks and the
  // cashier re-enters their PIN. The cart is untouched; only the screen is gated.
  useEffect(() => {
    let timer = window.setTimeout(() => setLocked(true), IDLE_LOCK_MS);
    function reset() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setLocked(true), IDLE_LOCK_MS);
    }
    const events = ["mousemove", "keydown", "mousedown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  async function handleUnlock() {
    try {
      await apiPost("/api/auth/verify-pin", { pin: unlockPin });
      setLocked(false);
      setUnlockPin("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Incorrect PIN.");
    }
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

          </div>

          {idle && (
            <p className="relative mt-4 text-center text-[11px] uppercase tracking-[0.3em] text-white/40">
              Scan an item to open the ticket
            </p>
          )}
        </div>

        {/* Bundles & Packages (BRD §5.3): active bundles browseable without searching; a bundle with
            any out-of-stock constituent is greyed out with the blocking item named. Scanning/searching
            a constituent SKU also surfaces its bundle here as a suggestion (BRD §5.2). */}
        {activeBundles.length > 0 && (
          <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bundles &amp; Packages</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {activeBundles
                .filter((b) => query === ""
                  || b.nameEn.toLowerCase().includes(query.toLowerCase())
                  || b.code.toLowerCase().includes(query.toLowerCase())
                  || b.lines.some((l) => l.sku.toLowerCase() === query.trim().toLowerCase()))
                .map((b) => {
                  const blocked = bundleAvailability(b, (bundleCart.find((e) => e.bundleId === b.id)?.qty ?? 0) + 1);
                  const savings = Math.max(0, b.individualTotal - b.bundlePrice);
                  const savingsPct = b.individualTotal > 0 ? Math.round((savings / b.individualTotal) * 100) : 0;
                  return (
                    <button
                      key={b.id}
                      onClick={() => addBundle(b)}
                      disabled={blocked !== null}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${blocked ? "cursor-not-allowed border-black/5 opacity-50" : "border-black/5 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"}`}
                    >
                      <p className="text-sm font-semibold text-foreground">📦 {b.nameEn}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{b.lines.map((l) => `${l.qty}× ${l.sku}`).join(" + ")}</p>
                      {blocked ? (
                        <p className="mt-1 text-[10px] font-semibold text-critical">Unavailable — {blocked}</p>
                      ) : (
                        <p className="mt-1 text-xs">
                          <span className="text-muted-foreground line-through">{b.individualTotal.toFixed(2)}</span>{" "}
                          <span className="font-mono font-semibold text-brand">{b.bundlePrice.toFixed(2)} ر.س</span>{" "}
                          <span className="rounded bg-success/10 px-1 py-0.5 text-[10px] font-semibold text-success">Save {savingsPct}%</span>
                        </p>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

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
                  <span className="flex flex-none items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">{money(h.total)}</span>
                    <span className="flex items-center gap-1 rounded-md bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">
                      <Play className="h-3 w-3" /> Resume
                    </span>
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
          <div className="flex gap-1.5">
            {customer ? (
              <button
                onClick={() => setCustomer(null)}
                className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground"
                title="Detach customer"
              >
                <UserPlus className="h-3.5 w-3.5" /> Detach
              </button>
            ) : null}
            <button
              onClick={handleHold}
              disabled={cartIsEmpty || holdSale.isPending}
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              title="Hold sale"
            >
              {holdSale.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />} Hold
            </button>
            <button
              onClick={handleCreateQuotation}
              disabled={cartIsEmpty || createQuotation.isPending}
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              title="Convert cart to quotation"
            >
              {createQuotation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Quote
            </button>
            <button
              onClick={() => toast.info("Process returns from Finance → Returns & Refunds.")}
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground"
              title="Return"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Return
            </button>
          </div>
        </div>

        {/* Customer lookup / create / attached */}
        <div className="border-b border-black/5 px-4 py-2.5 text-xs">
          {customer ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 rounded-lg bg-brand/5 px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 text-foreground">
                  <User className="h-3.5 w-3.5 text-brand" />
                  <span className="font-medium">{customer.nameEn}</span>
                  <span className="text-muted-foreground">· {customer.type} · {customer.phone}</span>
                </div>
                <button onClick={() => setCustomer(null)} className="text-muted-foreground hover:text-critical"><X className="h-3.5 w-3.5" /></button>
              </div>
              {(customer.type === "Contractor" || customer.type === "B2B") && (
                <div className="flex items-center justify-between rounded-lg bg-canvas px-2.5 py-1 text-[11px] text-muted-foreground">
                  <span>Credit: {money(customer.creditLimit - customer.outstanding)} available of {money(customer.creditLimit)}</span>
                  {creditNeedsApproval && (
                    <button onClick={() => setCreditApprovalDialogOpen(true)} className="font-medium text-warning hover:underline">
                      {creditApprovalId ? `Requested #${creditApprovalId}` : "Request approval"}
                    </button>
                  )}
                </div>
              )}
              {/* Module 7 (BRD §4.3.2): tier badge + automatic benefit summary, visible while building
                  the cart — the discount applies with no cashier action. */}
              {customer.loyaltyEnrolled && (
                <div className="flex items-center justify-between rounded-lg bg-canvas px-2.5 py-1 text-[11px] text-muted-foreground">
                  <span>
                    ★ {customer.loyaltyTier}
                    {loyaltyTierPct > 0 && ` · ${loyaltyTierPct}% tier discount`}
                    {freeDelivery && " · free delivery"}
                  </span>
                  {nextTierProgress(customer.loyaltyLifetimeSpend, tierConfig) && (
                    <span>{money(nextTierProgress(customer.loyaltyLifetimeSpend, tierConfig)!.remaining)} to {nextTierProgress(customer.loyaltyLifetimeSpend, tierConfig)!.nextTier}</span>
                  )}
                </div>
              )}
              {/* BRD §4.3.3: points balance + SAR equivalent must be visible at checkout, with a
                  direct shortcut into the Charge dialog's Points tab — not just discoverable once
                  the cashier is already inside Charge. */}
              {customer.loyaltyEnrolled && (
                <div className="flex items-center justify-between rounded-lg bg-canvas px-2.5 py-1 text-[11px]">
                  <span className="text-muted-foreground">
                    {customer.loyaltyPoints.toLocaleString("en-US")} pts{loyaltyConfig ? ` (≈ ${money(loyaltyBalanceSar)})` : ""}
                    {loyaltyConfig && !canRedeemPoints && customer.loyaltyPoints < loyaltyConfig.minRedeemPoints && (
                      <span> · needs {loyaltyConfig.minRedeemPoints.toLocaleString("en-US")}+ to redeem</span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={!canRedeemPoints || cartIsEmpty}
                    onClick={() => { setPayInitialTab("points"); setPayOpen(true); }}
                    title={
                      cartIsEmpty
                        ? "Add an item to the cart first"
                        : loyaltyConfig && !canRedeemPoints
                          ? `Minimum redemption is ${loyaltyConfig.minRedeemPoints.toLocaleString("en-US")} points`
                          : undefined
                    }
                    className="font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                  >
                    Redeem Points
                  </button>
                </div>
              )}
              {/* Module 20 (BRD §4.3.4): warn the cashier when the customer's points lapse next month. */}
              {customer.pointsExpiringSoon && (customer.loyaltyPoints ?? 0) > 0 && (
                <p className="rounded-lg bg-warning/15 px-2.5 py-1 text-[11px] font-medium text-warning-foreground">
                  ⚠ {customer.loyaltyPoints} points expire next month unless the customer makes a purchase.
                </p>
              )}
              {/* Module 11 (BRD §4.2): B2B PO reference + project code, carried onto the tax invoice. */}
              {isB2B && (
                <div className="flex gap-1.5">
                  <input
                    value={poReference} onChange={(e) => setPoReference(e.target.value)} placeholder="PO reference"
                    className="h-7 w-1/2 rounded-md border border-black/10 bg-white px-2 text-[11px] outline-none focus:border-brand"
                  />
                  <input
                    value={orderProjectCode} onChange={(e) => setOrderProjectCode(e.target.value)} placeholder="Project code"
                    className="h-7 w-1/2 rounded-md border border-black/10 bg-white px-2 text-[11px] outline-none focus:border-brand"
                  />
                </div>
              )}
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
                    placeholder="Customer name or phone (blank = walk-in)"
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
              {/* Auto-suggest as the cashier types — matches name or phone against the loaded customer
                  list, no exact phone + Find needed. */}
              {customerSuggestions.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
                  {customerSuggestions.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setCustomer(c); setPhone(""); setNotFound(false); }}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs hover:bg-brand/5"
                    >
                      <span className="truncate font-medium text-foreground">{c.nameEn}</span>
                      <span className="ml-2 flex-none text-[10px] text-muted-foreground">
                        {c.type}{c.phone ? ` · ${c.phone}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
          {cartIsEmpty && (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-canvas text-muted-foreground">
                <ShoppingCart className="h-5 w-5" />
              </span>
              <p className="text-sm text-muted-foreground">Cart is empty</p>
              <p className="text-[11px] text-muted-foreground/70">Scanned items will appear here.</p>
            </div>
          )}
          {/* Module 8 (BRD §5.2): bundles ride the cart as grouped entries — the server expands them
              into constituent lines at checkout, so the receipt itemizes every component. */}
          {bundleCart.map((b) => (
            <div key={`bundle-${b.bundleId}`} className="bg-brand/5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">📦 {b.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {b.code} · saves {money((b.individualTotal - b.bundlePrice) * b.qty)} vs individual
                  </p>
                </div>
                <button
                  onClick={() => setBundleCart((entries) => entries.filter((e) => e.bundleId !== b.bundleId))}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-critical/10 hover:text-critical"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center rounded-lg border border-black/10 overflow-hidden">
                  <button
                    onClick={() => updateBundleQty(b.bundleId, -1)}
                    className="grid h-7 w-7 place-items-center text-muted-foreground transition hover:bg-brand/10 hover:text-brand active:scale-90"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-10 text-center text-sm font-semibold">{b.qty}</span>
                  <button
                    onClick={() => updateBundleQty(b.bundleId, +1)}
                    className="grid h-7 w-7 place-items-center text-muted-foreground transition hover:bg-brand/10 hover:text-brand active:scale-90"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="font-mono text-sm font-semibold text-foreground">{money(b.bundlePrice * b.qty)}</p>
              </div>
            </div>
          ))}
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
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => toggleDelivery(l.sku)}
                    title="Deliver this line instead of counter pickup"
                    aria-pressed={Boolean(l.requiresDelivery)}
                    className={`grid h-7 w-7 place-items-center rounded-md transition ${
                      l.requiresDelivery ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-brand/10 hover:text-brand"
                    }`}
                  >
                    <Truck className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeLine(l.sku)}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-critical/10 hover:text-critical"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {l.requiresDelivery && (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-brand"><Truck className="h-3 w-3" /> Delivery</p>
              )}
              {l.isCutToSize ? (
                // BRD §2.3 items 5-6: cut-to-size lines take length × width instead of a plain qty —
                // the computed area (m²) becomes the billed quantity at the per-m² price.
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-xs">
                    <input
                      type="number" min="0.01" step="0.01" value={l.lengthM ?? ""} aria-label={`${l.sku} length (m)`}
                      onChange={(e) => changeDimension(l.sku, "lengthM", e.target.value)}
                      className="h-7 w-16 rounded-md border border-black/10 bg-white px-1.5 text-center font-mono outline-none focus:border-brand"
                    />
                    <span className="text-muted-foreground">×</span>
                    <input
                      type="number" min="0.01" step="0.01" value={l.widthM ?? ""} aria-label={`${l.sku} width (m)`}
                      onChange={(e) => changeDimension(l.sku, "widthM", e.target.value)}
                      className="h-7 w-16 rounded-md border border-black/10 bg-white px-1.5 text-center font-mono outline-none focus:border-brand"
                    />
                    <span className="ml-1 font-medium text-muted-foreground">m = {l.qty} {l.stockUom}</span>
                  </div>
                  <p className="font-mono text-sm font-semibold text-foreground">
                    {money(l.price * l.qty)}
                  </p>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
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
                    {/* BRD §2.3 item 4: selling-UOM dropdown adjacent to the quantity field. Only
                        rendered when the product actually has configured conversions. */}
                    {l.conversions.length > 0 && (
                      <select
                        value={l.uom} aria-label={`${l.sku} unit of measure`}
                        onChange={(e) => changeUom(l.sku, e.target.value)}
                        className="h-7 rounded-md border border-black/10 bg-white px-1.5 text-xs font-medium outline-none focus:border-brand"
                      >
                        {sellableUoms(l.stockUom, l.conversions).map((o) => (
                          <option key={o.uom} value={o.uom}>{o.uom}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <p className="font-mono text-sm font-semibold text-foreground">
                    {money(l.price * l.qty)}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* BRD §3.5: delivery details — captured once per checkout for every delivery-flagged line. */}
        {hasDeliveryLines && (
          <div className="space-y-2 border-t border-black/5 bg-brand/5 px-4 py-2.5 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-brand"><Truck className="h-3.5 w-3.5" /> Delivery details</p>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={deliveryAddressType}
                onChange={(e) => setDeliveryAddressType(e.target.value as typeof deliveryAddressType)}
                className="h-8 rounded-md border border-black/10 bg-white px-1.5 outline-none focus:border-brand"
              >
                <option value="Customer Address">Customer Address</option>
                <option value="Project Site">Project Site</option>
                <option value="Different Address">Different Address</option>
                <option value="Branch Pickup">Branch Pickup</option>
              </select>
              <select
                value={deliveryPriority}
                onChange={(e) => setDeliveryPriority(e.target.value as typeof deliveryPriority)}
                className="h-8 rounded-md border border-black/10 bg-white px-1.5 outline-none focus:border-brand"
              >
                <option value="Standard">Standard priority</option>
                <option value="High">High priority</option>
                <option value="Urgent">Urgent priority</option>
                <option value="Low">Low priority</option>
              </select>
              <input
                value={deliveryContactName} onChange={(e) => setDeliveryContactName(e.target.value)} placeholder="Contact name *"
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                value={deliveryContactMobile} onChange={(e) => setDeliveryContactMobile(e.target.value)} placeholder="Contact mobile *"
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} placeholder="City *"
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                value={deliveryDistrict} onChange={(e) => setDeliveryDistrict(e.target.value)} placeholder="District"
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                value={deliveryStreet} onChange={(e) => setDeliveryStreet(e.target.value)} placeholder="Street"
                className="col-span-2 h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)}
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)}
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <select
                value={deliveryZoneId ?? ""}
                onChange={(e) => setDeliveryZoneId(e.target.value ? Number(e.target.value) : null)}
                className="h-8 rounded-md border border-black/10 bg-white px-1.5 outline-none focus:border-brand"
              >
                <option value="">Delivery zone (fee)…</option>
                {(deliveryZones ?? []).map((z) => (
                  <option key={z.id} value={z.id}>{z.name} — {z.fee.toFixed(0)} ر.س</option>
                ))}
              </select>
              <select
                value={deliveryDriverId ?? ""}
                onChange={(e) => setDeliveryDriverId(e.target.value ? Number(e.target.value) : null)}
                className="h-8 rounded-md border border-black/10 bg-white px-1.5 outline-none focus:border-brand"
              >
                <option value="">Driver (optional)…</option>
                {(deliveryDrivers ?? []).filter((d) => d.available).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select
                value={deliveryVehicleId ?? ""}
                onChange={(e) => setDeliveryVehicleId(e.target.value ? Number(e.target.value) : null)}
                className="col-span-2 h-8 rounded-md border border-black/10 bg-white px-1.5 outline-none focus:border-brand"
              >
                <option value="">Vehicle (optional)…</option>
                {(deliveryVehicles ?? []).filter((v) => v.status === "Available").map((v) => (
                  <option key={v.id} value={v.id}>{v.registration} — {v.type}</option>
                ))}
              </select>
              <textarea
                value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} placeholder="Delivery instructions"
                rows={2} className="col-span-2 rounded-md border border-black/10 bg-white px-2 py-1.5 outline-none focus:border-brand"
              />
            </div>
            {autoDeliveryFee && (
              <p className="text-muted-foreground">Delivery fee (auto): <span className="font-medium text-foreground">{money(autoDeliveryFee.amount)}</span></p>
            )}
            {!deliveryDetailsComplete && (
              <p className="text-warning">Contact name, mobile, city and promised date are required to charge.</p>
            )}
          </div>
        )}

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

          {discountNeedsApproval && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-warning">
              <span>
                {discountApprovalRequested
                  ? `Approval requested (#${discountApprovalId}) — ask a supervisor, then Charge again.`
                  : discountType === "Fixed"
                    ? "Fixed-amount discounts need supervisor approval."
                    : `Above your ${discountCeiling}% limit — needs supervisor approval.`}
              </span>
              {!discountApprovalRequested && (
                <button
                  onClick={() => setApprovalDialogOpen(true)}
                  className="shrink-0 rounded-md border border-current px-2 py-0.5 text-[11px] font-medium hover:opacity-80"
                >
                  Request Approval
                </button>
              )}
            </div>
          )}

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
            onClick={() => { setPayInitialTab("cash"); setPayOpen(true); }}
            disabled={cartIsEmpty || !deliveryDetailsComplete}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:bg-brand/90 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand"
          >
            <ReceiptText className="h-4 w-4" /> Charge {money(Math.max(0, total))}
          </button>
        </div>
      </aside>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        total={Math.max(0, total)}
        onCharge={handleCharge}
        customer={customer}
        initialTab={payInitialTab}
      />
      <ReceiptDialog order={receiptOrder} terminalId={terminal?.id ?? null} onClose={() => setReceiptOrder(null)} />
      <RequestApprovalDialog
        open={approvalDialogOpen}
        onOpenChange={setApprovalDialogOpen}
        branchId={effectiveBranchId ?? null}
        defaultType="Discount"
        defaultAmount={manualAmount ? manualAmount.toFixed(2) : ""}
        defaultReason={
          discountType === "Fixed"
            ? `Fixed SAR ${manualValue.toFixed(2)} discount on this sale`
            : `${manualValue}% discount requested — above my ${discountCeiling}% limit`
        }
        onCreated={(approval) => setDiscountApprovalId(approval.id)}
      />
      <RequestApprovalDialog
        open={creditApprovalDialogOpen}
        onOpenChange={setCreditApprovalDialogOpen}
        branchId={effectiveBranchId ?? null}
        defaultType="CreditOverride"
        defaultAmount={total ? total.toFixed(2) : ""}
        defaultReason={customer ? `${customer.nameEn}'s order would exceed their ${money(customer.creditLimit)} credit limit` : ""}
        onCreated={(approval) => setCreditApprovalId(approval.id)}
      />

      {/* Module 15 (BRD §10.2): idle auto-lock overlay — the register stays exactly as it was; the
          cashier re-enters their PIN to resume. */}
      {locked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="w-80 rounded-2xl bg-white p-6 text-center shadow-2xl">
            <p className="text-lg font-semibold text-foreground">Register locked</p>
            <p className="mt-1 text-xs text-muted-foreground">Locked after 3 minutes of inactivity. Enter your PIN to resume — the cart is untouched.</p>
            <input
              type="password"
              value={unlockPin}
              onChange={(e) => setUnlockPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              placeholder="PIN"
              autoFocus
              className="mt-4 h-11 w-full rounded-lg border border-black/10 bg-white px-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-brand"
            />
            <button
              onClick={handleUnlock}
              disabled={!unlockPin.trim()}
              className="mt-3 w-full rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              Unlock
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
