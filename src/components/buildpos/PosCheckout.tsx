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
  ChevronDown,
  Check,
  FolderTree,
  ReceiptText,
  Truck,
  StickyNote,
  PenLine,
  Play,
  MoreVertical,
  MonitorSmartphone,
  Copy,
  Gift,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { productImage } from "@/lib/buildpos/product-images";
import {
  categoryDisplayLabel,
  useCategories,
  useProducts,
  type CategoryDto,
  type ProductUomConversionDto,
  type CutToSizeUnit,
} from "@/lib/api/catalog";
import {
  areaOf,
  lengthOf,
  volumeOf,
  factorToStock,
  sellableUoms,
  toStockQty,
  unitPriceFor,
} from "@/lib/buildpos/uom";
import { groupProductTiles } from "@/lib/buildpos/variant-tiles";
import {
  nextTierProgress,
  qualifiesForFreeDelivery,
  tierDiscountPct,
  type LoyaltyTierConfig,
} from "@/lib/buildpos/loyalty";
import {
  resolveBuyXGetYSplit,
  resolveLineDiscountPct,
  resolvePalletSplit,
  resolvePromoPct,
  resolveQuantityPct,
  resolveTradeValuePct,
} from "@/lib/buildpos/pricing";
import { useBundles, useLogBundleSuggestionEvent, type BundleDto } from "@/lib/api/bundles";
import { bestBundleSuggestion, type BundleCompletion } from "@/lib/buildpos/bundle-suggestions";
import {
  enqueueCheckout,
  isNetworkError,
  newClientRequestId,
  readQueue,
  replayQueue,
} from "@/lib/buildpos/offline-queue";
import { useCreateQuotation } from "@/lib/api/pos";
import { apiPost } from "@/lib/api/client";
import { CurrencyText, SARIcon } from "@/lib/buildpos/currency";
import { useTerminals, useBranches, useDevices } from "@/lib/api/admin";
import { useScaleWeight } from "@/lib/scaleBridge";
import {
  usePosSessionBroadcaster,
  customerDisplayPath,
  type CustomerDisplayAmountLine,
  type CustomerDisplayLine,
  type CustomerDisplaySnapshot,
  type CustomerDisplayStatus,
} from "@/lib/buildpos/pos-session-hub";
import {
  useCustomers,
  useCheckout,
  useHoldSale,
  useResumeSale,
  useParkedSales,
  useCreateCustomer,
  useLoyaltyConfig,
  usePricingRules,
  useCashierShifts,
  lookupCustomerByPhone,
  validateCoupon,
  type CustomerDto,
  type ValidateCouponResponse,
  type PaymentInput,
  type DeliveryDetailsInput,
} from "@/lib/api/pos";
import { useZonesApi, useDriversApi, useVehiclesApi } from "@/lib/api/delivery";
import { useRemnants, type RemnantDto } from "@/lib/api/inventory";
import { useAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { BundleOverrideDialog } from "@/components/buildpos/pos/BundleOverrideDialog";
import { CheckoutRedeemDialog } from "@/components/buildpos/pos/CheckoutRedeemDialog";
import { OpenShiftDialog } from "@/components/buildpos/pos/OpenShiftDialog";
import { PaymentDialog } from "@/components/buildpos/pos/PaymentDialog";
import { PrinterSetupDialog } from "@/components/buildpos/pos/PrinterSetupDialog";
import { ScaleSetupDialog } from "@/components/buildpos/pos/ScaleSetupDialog";
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

// BRD §2.3 items 5-6: which dimensions matter — and how they combine into the billed qty — depends
// on the product's cut-to-size unit. Mirrors the backend's OrdersController.Checkout branch exactly.
function cutToSizeQty(
  unit: CutToSizeUnit,
  lengthM: number,
  widthM: number,
  heightM: number,
): number {
  if (unit === "Length") return lengthOf(lengthM);
  if (unit === "Volume") return volumeOf(lengthM, widthM, heightM);
  return areaOf(lengthM, widthM);
}

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
// compounding. Cut-to-size lines (isCutToSize) carry the entered dimensions — cutToSizeUnit picks
// which ones matter (Length: lengthM only; Area: length×width; Volume: length×width×height) — and
// qty = the computed length/area/volume.
type CartLine = {
  productId: number;
  sku: string;
  name: string;
  uom: string;
  price: number;
  vatRate: number;
  qty: number;
  stockUom: string;
  basePrice: number;
  factorToStock: number;
  conversions: ProductUomConversionDto[];
  isCutToSize: boolean;
  cutToSizeUnit: CutToSizeUnit;
  // Weighing Scale integration: qty comes from a live scale reading (captured via the button next to
  // the line, fed by useScaleWeight) instead of manual entry or cut-to-size dimensions — starts at 0
  // ("not weighed yet") and blocks checkout until captured (see hasUncapturedWeight).
  isSoldByWeight?: boolean;
  // Serial Number Tracking: one serial number per unit sold — entered inline on the line, must match
  // qty exactly before checkout (see hasMissingSerials).
  requiresSerialTracking?: boolean;
  serialNumbers?: string[];
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  // BRD §2.3 enhancement: the cashier optionally records the source piece/roll size this cut-to-size
  // line was cut from — omitted entirely (the default) behaves exactly as before: the exact measured
  // cut is deducted from stock, no remnant tracked. When set and larger than the measured cut,
  // remnantAction says whether the leftover goes back to sellable stock or is scrapped as waste.
  sourceQty?: number;
  remnantAction?: "Restock" | "Scrap";
  // Cut Optimization: set when sourceQty came from picking an existing tracked Remnant (an offcut
  // from a previous sale) instead of the cashier typing a source size — the cut then draws from that
  // specific piece instead of bulk stock. sourceQty/remnantAction still describe any leftover from
  // cutting it exactly as they would for a hand-typed source.
  consumeRemnantId?: number;
  // Real product photo (base64 data URL or absent) — falls back to the static demo map, then an icon.
  imageUrl?: string | null;
  // BRD §3.5: cashier flags this line for delivery instead of counter pickup — a sale can mix
  // flagged and unflagged lines (partial delivery).
  requiresDelivery?: boolean;
  // Per stock UOM (e.g. per Bundle/Bag) — matters for bundle/pallet items (rebar, cement) where the
  // physical load size is what the yard crew and delivery truck actually care about.
  weight: number;
  // BRD §2.3: cashier's free-text note for this specific line (distinct from the order-wide Notes).
  notes?: string;
  // BRD §2.3/§6.2: cashier-entered per-line discount %, gated by the same authorization ceiling as
  // the order-level manual discount (see discountNeedsApproval below) — doesn't stack with the
  // auto contractor/tier/quantity discount, mirrors OrdersController.Checkout's "larger of" rule.
  manualDiscountPct?: number;
  // BRD §7 (CR-039): an absolute per-line price override — replaces `price` entirely (no discount
  // stacks on top), gated by a DIFFERENT authorization ceiling (posCeilings.canOverrideItemPrice /
  // an ApprovalType.PriceOverride request), distinct from a discount.
  manualUnitPrice?: number;
};
type CustomFee = { label: string; amount: number };
// Module 8 (BRD §5.2): a bundle in the cart — kept as one grouped entry (the server expands it into
// constituent order lines at checkout). vatPerUnit = Σ constituent bundle-share price × its own VAT
// rate, so the client total matches the server's per-item VAT math.
type BundleCartEntry = {
  bundleId: number;
  code: string;
  name: string;
  qty: number;
  bundlePrice: number;
  individualTotal: number;
  vatPerUnit: number;
  // Phase 4 (BRD §5.7): set only when this bundle was added past a schedule/branch/customer-group
  // eligibility block via a supervisor override — verified server-side at checkout, not here.
  supervisorEmail?: string;
  supervisorPin?: string;
};
// BRD §10.2 default: auto-lock after 3 minutes of inactivity (Module 15).
const IDLE_LOCK_MS = 3 * 60 * 1000;
// Roles that can use POS Checkout without opening a formal shift first — everyone else (Cashier,
// Senior Cashier) is gated by shiftLocked below until Open Shift succeeds.
const SHIFT_EXEMPT_ROLES = new Set(["Supervisor", "Store Manager", "System Admin"]);
// sessionStorage key the Cashier Workspace uses to hand a parked-sale id to this screen for resume.
export const RESUME_HOLD_KEY = "buildpos.resume-hold-id";
const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";

export function PosCheckout() {
  const [query, setQuery] = useState("");
  // Selected category/subcategory chip in the product browser — null means "All". Picking a
  // parent category (e.g. "Electric") also matches every one of its subcategories' products.
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  // Product Variants: which grouped tile's variant picker (if any) is currently open — only one at
  // a time, same convention as categoryPickerOpen.
  const [openVariantGroupId, setOpenVariantGroupId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  // sku of the cart line whose note input is currently expanded — null collapses all of them.
  const [notesEditingSku, setNotesEditingSku] = useState<string | null>(null);
  // sku of the cart line whose price-override input is currently expanded — null collapses all.
  const [priceEditingSku, setPriceEditingSku] = useState<string | null>(null);
  // sku of the cart line whose full "Customise price" dialog is open — runtime pricing panel that
  // can express the change as a new unit price, a % or an amount off (see LinePriceDialog).
  const [pricingLineSku, setPricingLineSku] = useState<string | null>(null);
  // sku of the cart line whose per-line discount input is currently expanded — null collapses all.
  // Kept out of the always-visible qty row (same reasoning as notes/price override above) so a
  // rarely-used field doesn't crowd the row every cashier sees on every line.
  const [discountEditingSku, setDiscountEditingSku] = useState<string | null>(null);
  // Whether the coupon/manual-discount/custom-fee controls are expanded — most sales use none of
  // these, so they're tucked behind a single disclosure instead of three permanently-open form rows
  // between the cart and the totals. Auto-opens (below) once any of them is actually in use.
  const [discountsPanelOpen, setDiscountsPanelOpen] = useState(false);
  const [bundleCart, setBundleCart] = useState<BundleCartEntry[]>([]);
  // Phase 3 Bundle Suggestion Engine: bundle ids the cashier has explicitly said "no thanks" to for
  // THIS sale — cleared by resetSale so a fresh ticket can suggest again.
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<number[]>([]);
  // Phase 4 (BRD §5.7): the bundle currently prompting for a supervisor override (branch/customer-
  // group restriction), if any — BundleOverrideDialog captures email/PIN, verified server-side at
  // checkout (same pattern as VoidOrderDialog's authorizerEmail/authorizerPin).
  const [overrideBundle, setOverrideBundle] = useState<BundleDto | null>(null);
  // Module 11: optional B2B PO reference + project code, carried to the tax invoice.
  const [poReference, setPoReference] = useState("");
  const [orderProjectCode, setOrderProjectCode] = useState("");
  // Module 15: idle auto-lock state.
  const [locked, setLocked] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  // Module 15 extension: the no-open-shift overlay's own Open Shift dialog.
  const [openShiftDialogOpen, setOpenShiftDialogOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [lastOrderNo, setLastOrderNo] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  // BRD §4.3.3: redeemed as a cart-level tender BEFORE Charge (see CheckoutRedeemDialog) — SAR
  // amount, clamped against the live total/balance/max-% wherever it's actually used, so a cart edit
  // after redeeming never lets a stale figure exceed what's currently valid.
  const [pointsRedeemed, setPointsRedeemed] = useState(0);
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<OrderDto | null>(null);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<OrderDto | null>(null);
  // Customer display: while set (a short window after a successful charge), the reactive cart-sync
  // effect below backs off so the "Approved" thank-you push it made isn't immediately overwritten by
  // the post-reset (now empty) cart.
  const [thankYouUntil, setThankYouUntil] = useState<number | null>(null);

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
  // BRD §7 (CR-039): same pattern again for a per-line manual price override — distinct from a
  // discount (Role.CanOverrideItemPrice / ApprovalType.PriceOverride), gated separately.
  const [priceOverrideApprovalId, setPriceOverrideApprovalId] = useState<number | null>(null);
  const [priceOverrideApprovalDialogOpen, setPriceOverrideApprovalDialogOpen] = useState(false);

  const [feeLabel, setFeeLabel] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [customFees, setCustomFees] = useState<CustomFee[]>([]);

  // BRD §3.5: one shared delivery detail set for every delivery-flagged line in this cart.
  const [deliveryAddressType, setDeliveryAddressType] = useState<
    "Customer Address" | "Project Site" | "Different Address" | "Branch Pickup"
  >("Customer Address");
  const [deliveryContactName, setDeliveryContactName] = useState("");
  const [deliveryContactMobile, setDeliveryContactMobile] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryDistrict, setDeliveryDistrict] = useState("");
  const [deliveryStreet, setDeliveryStreet] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("09:00");
  const [deliveryPriority, setDeliveryPriority] = useState<"Urgent" | "High" | "Standard" | "Low">(
    "Standard",
  );
  const [deliveryZoneId, setDeliveryZoneId] = useState<number | null>(null);
  const [deliveryDriverId, setDeliveryDriverId] = useState<number | null>(null);
  const [deliveryVehicleId, setDeliveryVehicleId] = useState<number | null>(null);
  // Searchable "use a saved customer's address" combobox inside the delivery panel itself, so the
  // cashier doesn't have to scroll up to the header search to attach/change the sale's customer.
  const [deliveryCustomerSearch, setDeliveryCustomerSearch] = useState("");

  const { user, hasAccess } = useAuth();
  const { data: terminals } = useTerminals();
  // Module 15 (BRD §10.2) extension: which till this cashier is actually working right now — the
  // self-declared source of truth from Open Shift, not just the admin-set "assigned" terminal below.
  // No open shift for this user (on any terminal) means they haven't started their register yet, so
  // checkout stays fully locked (see shiftLocked/OpenShiftDialog further down) regardless of role.
  const { data: cashierShifts, isLoading: shiftsLoading } = useCashierShifts();
  const myOpenShift = cashierShifts?.find((s) => s.status === "Open" && s.cashierUserId === user?.id);
  const { data: customers } = useCustomers();
  const { data: branches } = useBranches(user?.branchId === null);
  const { data: deliveryZones } = useZonesApi();
  const { data: deliveryDrivers } = useDriversApi();
  const { data: deliveryVehicles } = useVehiclesApi();
  // BRD §5.1/§6.2: Finance > Pricing's Trade Tier / Quantity rules — read here too, not just at
  // checkout submission, so the cart total the cashier sees while building the sale already matches
  // what OrdersController.Checkout will actually charge (see contractorDiscountPct/lineDiscountPct below).
  const { data: pricingRules } = usePricingRules();
  const checkout = useCheckout();
  const holdSale = useHoldSale();
  const resumeSale = useResumeSale();
  const createCustomer = useCreateCustomer();
  const createQuotation = useCreateQuotation();

  const effectiveBranchId = user?.branchId ?? selectedBranchId ?? branches?.[0]?.id ?? null;
  // Polled so a sale rung up on another terminal at this branch (or a hold/quote reserving stock)
  // shows up in this cashier's available-qty without a manual reload.
  const { data: liveProducts } = useProducts(true, effectiveBranchId ?? undefined, 20_000);
  // Cut Optimization: available offcuts at this branch, so a cut-to-size line can offer "use this
  // remnant instead of cutting fresh stock?" — defaults to status=Available server-side.
  const { data: availableRemnants } = useRemnants(
    { branchId: effectiveBranchId ?? undefined },
    effectiveBranchId != null,
  );
  const { data: categories } = useCategories();
  const topLevelCategories = useMemo(
    () => (categories ?? []).filter((c) => c.parentId == null),
    [categories],
  );
  const childCategoriesOf = useMemo(() => {
    const map = new Map<number, CategoryDto[]>();
    for (const c of categories ?? []) {
      if (c.parentId == null) continue;
      const list = map.get(c.parentId) ?? [];
      list.push(c);
      map.set(c.parentId, list);
    }
    return map;
  }, [categories]);
  // A selected parent category (e.g. "Electric") must also match every one of its subcategories'
  // products, not just products filed directly under it — walk the whole descendant subtree.
  const categoryFilterIds = useMemo(() => {
    if (categoryFilter == null) return null;
    const ids = new Set<number>([categoryFilter]);
    const stack = [categoryFilter];
    while (stack.length) {
      const id = stack.pop()!;
      for (const child of childCategoriesOf.get(id) ?? []) {
        if (!ids.has(child.id)) {
          ids.add(child.id);
          stack.push(child.id);
        }
      }
    }
    return ids;
  }, [categoryFilter, childCategoriesOf]);
  const categoriesById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );
  const activeCategory =
    categoryFilter != null ? (categoriesById.get(categoryFilter) ?? null) : null;
  // Flattened depth-first walk of the whole category tree (any nesting depth, not just two levels)
  // so a single searchable dropdown can render it instead of one chip per category — the chip
  // layout fell apart once a catalog has hundreds of categories/subcategories.
  const categoryTree = useMemo(() => {
    const rows: { category: CategoryDto; depth: number }[] = [];
    const visit = (parentId: number | null, depth: number) => {
      for (const c of parentId == null
        ? topLevelCategories
        : (childCategoriesOf.get(parentId) ?? [])) {
        rows.push({ category: c, depth });
        visit(c.id, depth + 1);
      }
    };
    visit(null, 0);
    return rows;
  }, [topLevelCategories, childCategoriesOf]);
  // Full ancestor chain (e.g. "Electrical › Wiring › Cables"), since a category can be nested
  // arbitrarily deep and the cashier needs to see where they are, not just the leaf name.
  const categoryPath = (id: number) => {
    const chain: string[] = [];
    let cur = categoriesById.get(id);
    while (cur) {
      chain.unshift(cur.nameEn);
      cur = cur.parentId != null ? categoriesById.get(cur.parentId) : undefined;
    }
    return chain.join(" › ");
  };
  const activeCategoryName = activeCategory ? categoryPath(activeCategory.id) : "All";
  // Shown on each product tile so the cashier can visually confirm it's the right one when several
  // products share a name across categories (e.g. "Pipe" under both Electric and Plumbing).
  const categoryLabelFor = (categoryId: number) => {
    const c = categoriesById.get(categoryId);
    return c ? categoryDisplayLabel(c) : "";
  };
  useEffect(() => {
    if (user?.branchId === null && selectedBranchId === null && branches?.[0])
      setSelectedBranchId(branches[0].id);
  }, [user?.branchId, selectedBranchId, branches]);

  const { data: heldSales } = useParkedSales(effectiveBranchId ?? undefined);
  const { data: bundles } = useBundles();
  const logSuggestionEvent = useLogBundleSuggestionEvent();
  // Phase 4 (BRD §5.7): effectiveStatus, not the raw persisted status — a Draft/PendingApproval/
  // Scheduled/Expired/Disabled/Archived bundle must never appear sellable at POS even if its raw
  // Status column still says "Active" from before its schedule started or after it lapsed.
  const activeBundles = useMemo(
    () => (bundles ?? []).filter((b) => b.effectiveStatus === "Active"),
    [bundles],
  );
  // Phase 3 Bundle Suggestion Engine (BRD §5.5): the single best "you're close to a bundle deal"
  // nudge right now, if any. Restricted to factorToStock === 1 lines — BundleLine.Qty is a plain
  // stock-UOM count with no UOM conversion of its own, same "avoid fragile proportional-UOM math"
  // guard the Phase 2 pallet/BOGO split uses. Algorithm lives in bundle-suggestions.ts (unit-tested
  // there) so this is just wiring live cart/bundle state into it.
  const bundleSuggestion = useMemo(() => {
    const cartQtyFor = (productId: number) =>
      cart.find((l) => l.productId === productId && l.factorToStock === 1)?.qty ?? 0;
    return bestBundleSuggestion(activeBundles, cartQtyFor, {
      excludeBundleIds: bundleCart.map((e) => e.bundleId),
      dismissedIds: dismissedSuggestionIds,
    });
  }, [activeBundles, bundleCart, cart, dismissedSuggestionIds]);
  // Phase 5 (BRD §5.5/§5.8): log a "Shown" impression once per distinct bundle the nudge surfaces —
  // keyed off the bundle id (not the memo re-running) so re-renders while the SAME suggestion is up
  // don't spam the endpoint. shownSuggestionRef resets to null once the nudge clears (accepted,
  // dismissed, or the cart no longer qualifies) so the same bundle can be logged again later.
  const shownSuggestionRef = useRef<number | null>(null);
  useEffect(() => {
    const bundleId = bundleSuggestion?.bundle.id ?? null;
    if (bundleId !== null && shownSuggestionRef.current !== bundleId) {
      shownSuggestionRef.current = bundleId;
      logSuggestionEvent.mutate({ bundleId, eventType: "Shown", branchId: effectiveBranchId });
    } else if (bundleId === null) {
      shownSuggestionRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleSuggestion?.bundle.id]);
  // Only ever bind a terminal that belongs to the effective branch — falling back to ANY terminal
  // would attribute sales (and drawer cash) to another branch's till, and the server hard-rejects a
  // branch/terminal mismatch at checkout. No terminal in this branch → checkout proceeds untilled.
  // A branch with more than one physical register resolves, in order: (1) the till this cashier
  // actually opened a shift on today — the live, self-declared source of truth, since a cashier can
  // cover a different till than their long-term admin assignment; (2) the admin-set "assigned"
  // terminal (Network > Terminals > Assign Cashier) as a fallback before any shift is open; (3) any
  // terminal in the branch. Without this, every cashier at a multi-till branch would resolve to the
  // SAME terminal record (whichever the list returns first), colliding both order/drawer attribution
  // and the customer-display broadcast group (see PosSessionHub) between registers that are supposed
  // to be independent.
  // Every clause is ALSO re-checked against effectiveBranchId (not just the first match) — an HQ
  // role (System Admin/Store Manager/Supervisor, whose effectiveBranchId comes from the branch
  // switcher, not a fixed home branch) can have an open shift on one branch's till and then switch
  // the dropdown to a different branch; without this the shift's terminal stayed "stuck" pinned to
  // the old branch and the server rejected checkout with "Terminal does not belong to the specified
  // branch" the instant the branch was switched.
  const terminal =
    terminals?.find((t) => t.id === myOpenShift?.terminalId && t.branchId === effectiveBranchId) ??
    terminals?.find((t) => t.assignedCashierId === user?.id && t.branchId === effectiveBranchId) ??
    terminals?.find((t) => t.branchId === effectiveBranchId);
  const { pushSnapshot: pushDisplaySnapshot, connected: displayConnected } = usePosSessionBroadcaster(
    terminal?.id ?? null,
  );

  // Module 15 (BRD §10.2) extension: a Cashier/Senior Cashier must open a shift on a specific
  // register before ringing anything up — the till's cash float and sales attribution are theirs to
  // account for. Supervisor/Store Manager/System Admin use POS Checkout freely (covering a till,
  // testing, ad hoc sales) without that self-service step. Held off until the shifts query actually
  // resolves so a fresh page load doesn't flash the lock before it's known whether one exists.
  const shiftLocked = !shiftsLoading && !myOpenShift && !SHIFT_EXEMPT_ROLES.has(user?.role ?? "");

  // Weighing Scale integration: the scale's serial port is stored in the same Device.qzPrinterName
  // field a printer Device uses for its QZ printer name — repurposed here as a generic "QZ target
  // identifier" string (see ScaleSetupDialog). Only one scale is read at a time, shared by whichever
  // cart line currently needs a weight captured.
  const { data: devices } = useDevices(true);
  const scaleDevice = devices?.find((d) => d.type === "WeighingScale" && d.terminalId === terminal?.id);
  const scaleReading = useScaleWeight(scaleDevice?.qzPrinterName ?? null);

  // BRD §7 (CR-038): resolve the CURRENT customer's assigned price list against each product's own
  // Contractor/Wholesale/Project override — null on the product means "not configured," fall back
  // to sellingPrice (Retail), mirroring OrdersController.Checkout's resolution exactly so the cart
  // total the cashier sees matches what checkout will actually charge.
  const listPriceFor = (p: {
    sellingPrice: number;
    contractorPrice?: number | null;
    wholesalePrice?: number | null;
    projectPrice?: number | null;
  }) => {
    switch (customer?.priceListType) {
      case "Contractor":
        return p.contractorPrice ?? p.sellingPrice;
      case "Wholesale":
        return p.wholesalePrice ?? p.sellingPrice;
      case "Project":
        return p.projectPrice ?? p.sellingPrice;
      default:
        return p.sellingPrice;
    }
  };
  const products = useMemo(
    () =>
      (liveProducts ?? []).map((p) => ({
        productId: p.id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.nameEn,
        cat: p.categoryName,
        categoryId: p.categoryId,
        uom: p.stockUom,
        price: listPriceFor(p),
        vatRate: p.vatRate,
        stock: p.totalAvailable,
        tone: toneForStock(p.totalAvailable),
        conversions: p.uomConversions ?? [],
        isCutToSize: p.isCutToSize ?? false,
        cutToSizeUnit: p.cutToSizeUnit ?? "Area",
        minCutQty: p.minCutQty ?? null,
        isSoldByWeight: p.isSoldByWeight ?? false,
        requiresSerialTracking: p.requiresSerialTracking ?? false,
        weight: p.weight,
        imageUrl: p.imageUrl,
        // Carried through so lineDiscountPct can tell whether THIS line actually got a distinct list
        // price (and should suppress the legacy contractor trade % — see contractorDiscountPct below).
        hasDistinctListPrice: listPriceFor(p) !== p.sellingPrice,
        // Product Variants: siblings sharing this id collapse into one browsable tile (see
        // `tiles` below) instead of each showing as its own separate card.
        variantGroupId: p.variantGroupId ?? null,
        variantGroupName: p.variantGroupName ?? null,
        attributes: p.attributes ?? [],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveProducts, customer?.priceListType],
  );

  // A customer can be attached (or changed) AFTER items are already in the cart — re-sync existing
  // lines' price to the newly-resolved list price so the cart total never drifts from what checkout
  // will actually charge (which always resolves fresh from the customer on file at that moment).
  useEffect(() => {
    setCart((c) =>
      c.map((l) => {
        const prod = products.find((p) => p.sku === l.sku);
        if (!prod || prod.price === l.basePrice) return l;
        return { ...l, basePrice: prod.price, price: unitPriceFor(prod.price, l.factorToStock) };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.priceListType]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Browsing a category needs no typed text at all; typing with no category picked still searches
    // every product as before. Neither one active means the idle scanning state (nothing shown).
    if (!q && categoryFilterIds == null) return [];
    return products.filter(
      (p) =>
        (categoryFilterIds == null || categoryFilterIds.has(p.categoryId)) &&
        (q === "" ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.cat.toLowerCase().includes(q) ||
          (p.barcode?.toLowerCase().includes(q) ?? false)),
    );
  }, [query, products, categoryFilterIds]);

  // Product Variants: collapse every SKU that shares a VariantGroupId into one browsable tile —
  // a search/category match on ANY sibling surfaces the whole family (via the full `products` list,
  // not just `shown`), so switching which variant matched never hides the others from the picker.
  // Standalone products (no group) pass through untouched, in their original relative order.
  const tiles = useMemo(() => groupProductTiles(shown, products), [shown, products]);

  // Barcode scanners act as keyboards: they type the code then send Enter. A real POS should add
  // the item straight to the cart on that Enter, no manual click — this is what makes it "scan".
  function submitScan(raw: string) {
    const q = raw.trim().toLowerCase();
    if (!q) return;
    const match =
      products.find((p) => p.barcode?.toLowerCase() === q) ??
      products.find((p) => p.sku.toLowerCase() === q);
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
    if (payOpen || receiptOrder || locked || shiftLocked || approvalDialogOpen || creditApprovalDialogOpen) return;

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
  }, [
    payOpen,
    receiptOrder,
    locked,
    shiftLocked,
    approvalDialogOpen,
    creditApprovalDialogOpen,
    query,
    products,
  ]);

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
    // A sold-by-weight line's qty comes from the scale, not "scan it again" — same one-line-per-
    // product reasoning as cut-to-size above.
    if (line?.isSoldByWeight) {
      setLastAdded(p.sku);
      toast.info(`${p.name} is already in the cart — capture its weight on the line.`);
      return;
    }
    // A serial-tracked line's qty is however many serial numbers have been entered — "scan it again"
    // should add another unit needing its own serial, not just bump qty blindly past what's entered.
    if (line?.requiresSerialTracking) {
      setCart((c) => c.map((l) => (l.sku === p.sku ? { ...l, qty: l.qty + 1 } : l)));
      setLastAdded(p.sku);
      toast.info(`${p.name} qty increased — enter the additional serial number on the line.`);
      return;
    }
    // Stock is tracked in stock UOM — a line sold by the Pallet consumes factor × qty of it, so the
    // availability check must compare stock-UOM demand, not raw line quantities (BRD §2.3 item 7).
    const currentStockDemand = line ? toStockQty(line.qty, line.factorToStock) : 0;
    const addedStockDemand = line ? line.factorToStock : 1;
    if (!p.isSoldByWeight && currentStockDemand + addedStockDemand > p.stock) {
      toast.error(`Only ${p.stock} ${p.uom} available at this branch.`);
      return;
    }
    setCart((c) => {
      const existing = c.find((l) => l.sku === p.sku);
      if (existing) return c.map((l) => (l.sku === p.sku ? { ...l, qty: existing.qty + 1 } : l));
      // Cut-to-size products start at 1m on every dimension the mode needs — the cashier edits the
      // real measurements on the line.
      const isCut = p.isCutToSize;
      return [
        ...c,
        {
          productId: p.productId,
          sku: p.sku,
          name: p.name,
          uom: p.uom,
          price: p.price,
          vatRate: p.vatRate,
          // Sold-by-weight starts at 0 — "not weighed yet" — until the cashier captures a scale
          // reading on the line; every other product starts at 1 as before.
          qty: p.isSoldByWeight ? 0 : 1,
          stockUom: p.uom,
          basePrice: p.price,
          factorToStock: 1,
          conversions: p.conversions,
          isCutToSize: isCut,
          cutToSizeUnit: p.cutToSizeUnit,
          isSoldByWeight: p.isSoldByWeight,
          requiresSerialTracking: p.requiresSerialTracking,
          serialNumbers: p.requiresSerialTracking ? [] : undefined,
          lengthM: isCut ? 1 : undefined,
          widthM: isCut && p.cutToSizeUnit !== "Length" ? 1 : undefined,
          heightM: isCut && p.cutToSizeUnit === "Volume" ? 1 : undefined,
          weight: p.weight,
          imageUrl: p.imageUrl,
        },
      ];
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

  // Direct numeric entry alongside the +/- stepper (BRD §2.3 item 3: "easily modify item
  // quantities") — bulk quantities (e.g. 500 units) shouldn't require 500 clicks. Same stock guard
  // as the stepper; invalid/non-positive input is ignored rather than zeroing the line.
  function setQtyDirect(sku: string, raw: string) {
    const line = cart.find((l) => l.sku === sku);
    if (!line) return;
    const nextQty = Number(raw);
    if (!Number.isFinite(nextQty) || nextQty <= 0) return;
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
      toast.error(
        `Only ${available} ${line.stockUom} available — ${line.qty} ${nextUom} needs ${toStockQty(line.qty, factor)}.`,
      );
      return;
    }
    setCart((c) =>
      c.map((l) =>
        l.sku === sku
          ? { ...l, uom: nextUom, factorToStock: factor, price: unitPriceFor(l.basePrice, factor) }
          : l,
      ),
    );
  }

  // BRD §2.3 items 5-6: dimension entry for cut-to-size lines — qty becomes the computed
  // length/area/volume (per the product's cut-to-size unit), priced per stock UOM. Zero/invalid
  // input keeps the last valid dimensions rather than zeroing the line.
  function changeDimension(sku: string, side: "lengthM" | "widthM" | "heightM", raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    // The computed qty is stock demand in the stock UOM — validate it against branch availability
    // exactly like every other qty change, or the cashier only finds out when the server rejects
    // the whole checkout (BRD §2.3 item 7).
    const line = cart.find((l) => l.sku === sku && l.isCutToSize);
    if (line) {
      const nextQty = cutToSizeQty(
        line.cutToSizeUnit,
        side === "lengthM" ? value : (line.lengthM ?? 0),
        side === "widthM" ? value : (line.widthM ?? 0),
        side === "heightM" ? value : (line.heightM ?? 0),
      );
      // Cut Optimization: a remnant-sourced line draws from that specific piece, not bulk stock —
      // its own size (held in sourceQty once selected) is the real ceiling, not branch availability.
      const available = line.consumeRemnantId != null
        ? (line.sourceQty ?? 0)
        : (products.find((p) => p.sku === sku)?.stock ?? Infinity);
      if (nextQty > available) {
        toast.error(
          line.consumeRemnantId != null
            ? `That remnant is only ${available} ${line.stockUom} — ${nextQty.toFixed(2)} needed.`
            : `Only ${available} ${line.stockUom} available at this branch — ${nextQty.toFixed(2)} needed.`,
        );
        return;
      }
    }
    setCart((c) =>
      c.map((l) => {
        if (l.sku !== sku || !l.isCutToSize) return l;
        const next = { ...l, [side]: value } as CartLine;
        const qty = cutToSizeQty(
          l.cutToSizeUnit,
          next.lengthM ?? 0,
          next.widthM ?? 0,
          next.heightM ?? 0,
        );
        return { ...next, qty: qty > 0 ? qty : l.qty };
      }),
    );
  }

  function removeLine(sku: string) {
    setCart((c) => c.filter((l) => l.sku !== sku));
  }

  // BRD §2.3 enhancement: the cashier optionally records the source piece/roll size a cut-to-size
  // line was cut from — leaving it blank is a no-op (exactly today's behavior). Clearing sourceQty
  // also clears any remnantAction, since it's meaningless without a source to compare against.
  function setSourceQty(sku: string, raw: string) {
    const value = raw === "" ? undefined : Math.max(0, Number(raw) || 0);
    setCart((c) =>
      c.map((l) =>
        l.sku === sku
          ? {
              ...l,
              sourceQty: value,
              remnantAction: value === undefined ? undefined : l.remnantAction,
              // Hand-typing a source size overrides/deselects a previously-picked remnant.
              consumeRemnantId: undefined,
            }
          : l,
      ),
    );
  }

  function setRemnantAction(sku: string, action: "Restock" | "Scrap") {
    setCart((c) => c.map((l) => (l.sku === sku ? { ...l, remnantAction: action } : l)));
  }

  // Cut Optimization: pick an existing offcut to cut this line from instead of bulk stock — reuses
  // the sourceQty/remnantAction leftover machinery above by auto-filling sourceQty with the
  // remnant's own size (the cashier just confirms Restock/Scrap for whatever's still left over).
  // Passing null clears the selection and reverts to a plain bulk-stock cut.
  function selectRemnant(sku: string, remnant: RemnantDto | null) {
    setCart((c) =>
      c.map((l) =>
        l.sku === sku
          ? {
              ...l,
              consumeRemnantId: remnant?.id,
              sourceQty: remnant?.qty,
              remnantAction: remnant ? l.remnantAction : undefined,
            }
          : l,
      ),
    );
  }

  // BRD §2.3: per-line note the cashier attaches to a specific cart entry — pure client state until
  // checkout, when it's carried on the line's CartLineInput and persisted to OrderLine.Notes.
  function setLineNotes(sku: string, notes: string) {
    setCart((c) => c.map((l) => (l.sku === sku ? { ...l, notes } : l)));
  }

  // BRD §2.3/§6.2: cashier-entered per-line discount % — same authorization ceiling as the
  // order-level manual discount (see discountNeedsApproval), enforced again server-side.
  function setLineDiscountPct(sku: string, raw: string) {
    const value = raw === "" ? undefined : Math.max(0, Math.min(100, Number(raw) || 0));
    setCart((c) => c.map((l) => (l.sku === sku ? { ...l, manualDiscountPct: value } : l)));
  }

  // Serial Number Tracking: raw text (comma or newline separated) parsed into the array checkout
  // sends — actual availability (InStock, belongs to this product/branch) is validated server-side.
  function setLineSerialsText(sku: string, raw: string) {
    const serials = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    setCart((c) => c.map((l) => (l.sku === sku ? { ...l, serialNumbers: serials } : l)));
  }

  // BRD §7 (CR-039): an absolute per-line price override — a DIFFERENT authorization ceiling from
  // the discount above (posCeilings.canOverrideItemPrice / an ApprovalType.PriceOverride request).
  function setLineManualPrice(sku: string, raw: string) {
    const value = raw === "" ? undefined : Math.max(0, Number(raw) || 0);
    setCart((c) => c.map((l) => (l.sku === sku ? { ...l, manualUnitPrice: value } : l)));
  }

  // BRD §3.5: toggling a line's delivery flag never removes it from the cart — the customer still
  // pays for it here, only the fulfillment method changes (counter pickup vs. shipped).
  function toggleDelivery(sku: string) {
    setCart((c) =>
      c.map((l) => (l.sku === sku ? { ...l, requiresDelivery: !l.requiresDelivery } : l)),
    );
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

  // Phase 4 (BRD §5.7): branch/customer-group restrictions — distinct from stock availability above
  // because these two are overridable by a supervisor at add-time; stock is never overridable (there
  // is no unit to sell). Empty array on the bundle means "no restriction."
  function bundleEligibility(b: BundleDto): string | null {
    if (
      b.eligibleBranchIds.length > 0 &&
      effectiveBranchId != null &&
      !b.eligibleBranchIds.includes(effectiveBranchId)
    ) {
      return "not available at this branch";
    }
    if (
      b.eligibleCustomerTypes.length > 0 &&
      !(customer && b.eligibleCustomerTypes.includes(customer.type))
    ) {
      return "not available for this customer";
    }
    return null;
  }

  function addBundle(b: BundleDto, override?: { email: string; pin: string }) {
    const existing = bundleCart.find((e) => e.bundleId === b.id);
    const nextQty = (existing?.qty ?? 0) + 1;
    const blocked = bundleAvailability(b, nextQty);
    if (blocked) {
      toast.error(`Unavailable — ${blocked}.`);
      return;
    }
    if (bundleEligibility(b) && !override) {
      toast.error("This bundle needs a supervisor override to add here.");
      return;
    }
    setBundleCart((entries) => {
      if (existing) {
        return entries.map((e) =>
          e.bundleId === b.id
            ? {
                ...e,
                qty: e.qty + 1,
                supervisorEmail: override?.email ?? e.supervisorEmail,
                supervisorPin: override?.pin ?? e.supervisorPin,
              }
            : e,
        );
      }
      const priceFactor = b.individualTotal > 0 ? b.bundlePrice / b.individualTotal : 1;
      const vatPerUnit = b.lines.reduce(
        (s, l) => s + l.qty * l.sellingPrice * priceFactor * (l.vatRate / 100),
        0,
      );
      return [
        ...entries,
        {
          bundleId: b.id,
          code: b.code,
          name: b.nameEn,
          qty: 1,
          bundlePrice: b.bundlePrice,
          individualTotal: b.individualTotal,
          vatPerUnit,
          supervisorEmail: override?.email,
          supervisorPin: override?.pin,
        },
      ];
    });
    toast.success(`${b.nameEn} added`, {
      description: `Saves ${(b.individualTotal - b.bundlePrice).toFixed(2)} ر.س vs individual prices.`,
    });
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
    setBundleCart((entries) =>
      entries.map((e) => (e.bundleId === bundleId ? { ...e, qty: nextQty } : e)),
    );
  }

  // Phase 3 Bundle Suggestion Engine: accepting a suggestion either (a) converts already-scanned
  // constituents into the real bundle line — at 100% completion — or (b) tops up the missing
  // constituent(s) to reach 100%, which then re-renders bundleSuggestion as the (a) case for the
  // cashier's next click (chains the "80% → complete → add bundle" flow across two actions).
  function acceptBundleSuggestion(candidate: BundleCompletion) {
    const { bundle, missing } = candidate;
    if (missing.length === 0) {
      const blocked = bundleAvailability(bundle, 1);
      if (blocked) {
        toast.error(`Unavailable — ${blocked}.`);
        return;
      }
      setCart((c) =>
        bundle.lines
          .reduce(
            (acc, bl) =>
              acc.map((l) =>
                l.productId === bl.productId && l.factorToStock === 1
                  ? { ...l, qty: l.qty - bl.qty }
                  : l,
              ),
            c,
          )
          .filter((l) => l.qty > 0.0001),
      );
      addBundle(bundle);
      setDismissedSuggestionIds((ids) => ids.filter((id) => id !== bundle.id));
      logSuggestionEvent.mutate({
        bundleId: bundle.id,
        eventType: "Accepted",
        branchId: effectiveBranchId,
      });
      return;
    }
    for (const line of missing) {
      const product = products.find((p) => p.productId === line.productId);
      if (!product || line.qty > product.stock) {
        toast.error(
          `Only ${product?.stock ?? 0} ${product?.uom ?? ""} of ${line.productName} available.`,
        );
        return;
      }
    }
    setCart((c) => {
      let next = c;
      for (const line of missing) {
        const product = products.find((p) => p.productId === line.productId);
        if (!product) continue;
        const existing = next.find((l) => l.productId === line.productId && l.factorToStock === 1);
        next = existing
          ? next.map((l) => (l === existing ? { ...l, qty: line.qty } : l))
          : [
              ...next,
              {
                productId: product.productId,
                sku: product.sku,
                name: product.name,
                uom: product.uom,
                price: product.price,
                vatRate: product.vatRate,
                qty: line.qty,
                stockUom: product.uom,
                basePrice: product.price,
                factorToStock: 1,
                conversions: product.conversions,
                isCutToSize: false,
                cutToSizeUnit: product.cutToSizeUnit,
                weight: product.weight,
                imageUrl: product.imageUrl,
              },
            ];
      }
      return next;
    });
    toast.success(
      `Added ${missing.map((l) => l.productName).join(", ")} — ${bundle.nameEn} is now complete.`,
    );
  }

  function dismissBundleSuggestion(bundleId: number) {
    setDismissedSuggestionIds((ids) => [...ids, bundleId]);
    logSuggestionEvent.mutate({ bundleId, eventType: "Rejected", branchId: effectiveBranchId });
  }

  function resetSale() {
    setCart([]);
    setBundleCart([]);
    setDismissedSuggestionIds([]);
    setPoReference("");
    setOrderProjectCode("");
    setCustomer(null);
    setPhone("");
    setNotFound(false);
    setCouponCode("");
    setAppliedCoupon(null);
    setDiscountType("");
    setDiscountValue("");
    setPointsRedeemed(0);
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
    setDeliveryCustomerSearch("");
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
      const created = await createCustomer.mutateAsync({
        nameEn: newCustomerName.trim(),
        phone: phone.trim(),
      });
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
        branchId: effectiveBranchId,
        terminalId: terminal?.id ?? null,
        customerId: customer?.id ?? null,
        notes: customer ? undefined : "Walk-in",
        // Parked sales don't persist a selling UOM, so hold in stock UOM (2 Pallet → 100 Bag) — the
        // resumed cart reopens at the same total value, just expressed in stock units.
        lines: cart.map((l) => ({
          productId: l.productId,
          qty: toStockQty(l.qty, l.factorToStock),
        })),
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
      toast.error(
        err instanceof ApiError
          ? err.message
          : `Could not resume ${held.ticketNo} — it may have already been resumed elsewhere.`,
      );
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
        productId: l.productId,
        sku: l.sku,
        name: l.productName,
        uom: product?.uom ?? "Piece",
        price: l.unitPrice,
        vatRate: product?.vatRate ?? 15,
        qty: l.qty,
        stockUom: product?.uom ?? "Piece",
        basePrice: l.unitPrice,
        factorToStock: 1,
        conversions: product?.conversions ?? [],
        isCutToSize: product?.isCutToSize ?? false,
        cutToSizeUnit: product?.cutToSizeUnit ?? "Area",
        weight: product?.weight ?? 0,
        imageUrl: product?.imageUrl,
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

  // BRD §5.1/§6.2, mirroring OrdersController.Checkout: Active rules scoped to this branch (or
  // company-wide) and not past ValidUntil. Filtered here instead of trusting the API to pre-filter,
  // since usePricingRules() returns every rule (the Finance > Pricing grid needs Expired/Pending
  // ones too) and this cart preview must only ever apply what the server would actually apply.
  const activePricingRules = useMemo(() => {
    const now = Date.now();
    return (pricingRules ?? []).filter(
      (r) =>
        r.status === "Active" &&
        (r.branchId == null || r.branchId === effectiveBranchId) &&
        (r.validFrom == null || new Date(r.validFrom).getTime() <= now) &&
        (r.validUntil == null || new Date(r.validUntil).getTime() >= now),
    );
  }, [pricingRules, effectiveBranchId]);

  const isContractor = customer?.type === "Contractor";
  // The contractor rate comes only from an actual active Trade Tier pricing rule — same
  // branch-first-then-priority tiebreak the server uses. No rule configured means no automatic
  // contractor discount (a manager must create one on the Pricing page).
  const tradeTierRule = useMemo(() => {
    if (!isContractor) return null;
    return (
      activePricingRules
        .filter((r) => r.type === "Trade Tier")
        .sort(
          (a, b) =>
            Number(b.branchId != null) - Number(a.branchId != null) || b.priority - a.priority,
        )[0] ?? null
    );
  }, [activePricingRules, isContractor]);
  // Module 7 (BRD §4.3.2): per-line discount is the LARGER of contractor trade % and the customer's
  // loyalty tier % — mirrors OrdersController.Checkout exactly, so the display total matches the charge.
  const loyaltyTierPct = tierDiscountPct(
    customer?.loyaltyTier,
    customer?.loyaltyEnrolled,
    tierConfig,
  );
  const contractorDiscountPct = Math.max(tradeTierRule?.value ?? 0, loyaltyTierPct);

  // BRD §6.2 Quantity Discount: a per-SKU (or "any product" when Sku is null) quantity threshold —
  // matched case-insensitively since a rule's Sku is uppercased at creation but a product's own Sku
  // is stored exactly as entered in the catalog. Doesn't stack with the contractor/tier %; each line
  // gets whichever is larger, same rule OrdersController.Checkout applies server-side.
  const quantityRules = useMemo(
    () => activePricingRules.filter((r) => r.type === "Quantity" && r.minQuantity != null),
    [activePricingRules],
  );
  const quantityPctFor = (l: CartLine) =>
    resolveQuantityPct(quantityRules, l.sku, toStockQty(l.qty, l.factorToStock));
  // BRD §7 (CR-040): Promotional rules auto-apply within their date window — no coupon code needed.
  const promoRules = useMemo(
    () => activePricingRules.filter((r) => r.type === "Promotional"),
    [activePricingRules],
  );
  const promoPctFor = (l: CartLine) => resolvePromoPct(promoRules, l.sku);
  // BRD §7 (CR-038): once a line actually got a distinct Contractor/Wholesale/Project list price
  // (see products/listPriceFor above), the legacy automatic contractor trade % would double-dip on
  // top of an already-negotiated price — suppressed in that case, but loyalty-tier % still applies
  // (mirrors OrdersController.Checkout's effectiveDiscountPct exactly).
  const hasDistinctListPriceFor = (l: CartLine) =>
    products.find((p) => p.sku === l.sku)?.hasDistinctListPrice ?? false;
  // Shared with QuotationFormDialog.tsx/OrdersController.Checkout via resolveLineDiscountPct so all
  // three can never silently disagree on the same cart.
  const lineDiscountPct = (l: CartLine) => {
    // A manual price override (BRD §7 CR-039) replaces the price entirely — no discount stacks.
    if (l.manualUnitPrice != null) return 0;
    const baseDiscountPct = hasDistinctListPriceFor(l) ? loyaltyTierPct : contractorDiscountPct;
    return resolveLineDiscountPct(
      baseDiscountPct,
      quantityPctFor(l),
      promoPctFor(l),
      l.manualDiscountPct ?? 0,
    );
  };

  // Phase 2 (BRD §5.1): pallet-tier and Buy-X-Get-Y rules, previewed here the same way Quantity
  // rules already are above — scoped to plain stock-UOM lines (no cut-to-size dimensions, no
  // alternate selling UOM), matching OrdersController.Checkout's eligibility exactly.
  const palletRules = useMemo(
    () => activePricingRules.filter((r) => r.type === "Quantity" && r.palletQty != null),
    [activePricingRules],
  );
  const buyXGetYRules = useMemo(
    () =>
      activePricingRules.filter(
        (r) => r.type === "Buy X Get Y" && r.buyQty != null && r.freeQty != null,
      ),
    [activePricingRules],
  );
  const splitEligible = (l: CartLine) =>
    l.manualUnitPrice == null && l.lengthM == null && (!l.uom || l.uom === l.stockUom);
  const buyXGetYRuleFor = (l: CartLine) =>
    splitEligible(l)
      ? (buyXGetYRules
          .filter((r) => !r.sku || r.sku.toUpperCase() === l.sku.toUpperCase())
          .sort(
            (a, b) =>
              Number(b.branchId != null) - Number(a.branchId != null) || b.priority - a.priority,
          )[0] ?? null)
      : null;
  const palletRuleFor = (l: CartLine) =>
    splitEligible(l)
      ? (palletRules
          .filter((r) => !r.sku || r.sku.toUpperCase() === l.sku.toUpperCase())
          .sort(
            (a, b) =>
              Number(b.branchId != null) - Number(a.branchId != null) || b.priority - a.priority,
          )[0] ?? null)
      : null;
  // Trade Value (BRD §5.1): a Contractor whose cart crosses the rule's SAR threshold gets % off the
  // whole order — resolved against lineTotalsSum below once it's known.
  const tradeValueRules = useMemo(
    () => activePricingRules.filter((r) => r.type === "Trade Value" && r.minCartTotal != null),
    [activePricingRules],
  );
  // The actual per-unit price charged for this line — the manual override when set, else the
  // resolved list price (see products/listPriceFor above).
  const lineUnitPrice = (l: CartLine) => l.manualUnitPrice ?? l.price;

  // BRD §2.3 enhancement: mirrors OrdersController.Checkout's MinCutQty floor exactly — a cut
  // smaller than the product's configured minimum is BILLED at that minimum. Every money
  // calculation (line price, subtotal, VAT, total) must use this, not the raw measured l.qty, or
  // the cart shown here understates what Charge will actually ask for and the payment gets
  // rejected as "doesn't match order total". Stock deduction and displayed weight intentionally
  // keep using the real measured l.qty elsewhere — only the billed amount is floored.
  const billedQty = (l: CartLine): number => {
    if (!l.isCutToSize) return l.qty;
    const minCutQty = products.find((p) => p.sku === l.sku)?.minCutQty ?? null;
    return minCutQty != null && l.qty > 0 && l.qty < minCutQty ? minCutQty : l.qty;
  };

  // Phase 2: the actual charge for a line once Buy-X-Get-Y/pallet splits are accounted for — the
  // naive qty × unitPrice × (1 - discount%) undercounts what checkout will actually charge once a
  // rule frees or re-prices part of the quantity. subtotal (below) intentionally keeps using the
  // naive full-price total so the savings show up as a visible discount, same as bundle savings do.
  const lineChargeTotal = (l: CartLine): number => {
    const buyXGetYRule = buyXGetYRuleFor(l);
    if (buyXGetYRule) {
      const { paidUnits } = resolveBuyXGetYSplit(buyXGetYRule, toStockQty(l.qty, l.factorToStock));
      return paidUnits * lineUnitPrice(l) * (1 - lineDiscountPct(l) / 100);
    }
    const palletRule = palletRuleFor(l);
    if (palletRule) {
      const { palletUnits, remainderUnits } = resolvePalletSplit(
        palletRule,
        toStockQty(l.qty, l.factorToStock),
      );
      if (palletUnits > 0) {
        return (
          palletUnits * palletRule.value +
          remainderUnits * lineUnitPrice(l) * (1 - lineDiscountPct(l) / 100)
        );
      }
    }
    return lineUnitPrice(l) * billedQty(l) * (1 - lineDiscountPct(l) / 100);
  };

  // BRD §4.3.3: the points balance + SAR equivalent must be visible at checkout, not just inside
  // the Charge dialog — a cashier deciding whether to offer redemption needs it up front.
  const loyaltyBalanceSar =
    customer && loyaltyConfig ? customer.loyaltyPoints / loyaltyConfig.pointsPerSarRedeemed : 0;
  const canRedeemPoints =
    Boolean(customer?.loyaltyEnrolled) &&
    loyaltyConfig !== undefined &&
    customer!.loyaltyPoints >= loyaltyConfig.minRedeemPoints;

  // Module 8 (BRD §5.2): bundle cart entries — priced at the bundle price with per-constituent VAT;
  // the individual-vs-bundle difference is a visible discount. No further % discount on bundle lines.
  const bundleTaxable = bundleCart.reduce((s, b) => s + b.bundlePrice * b.qty, 0);
  const bundleSavings = bundleCart.reduce(
    (s, b) => s + Math.max(0, b.individualTotal - b.bundlePrice) * b.qty,
    0,
  );

  const subtotal =
    cart.reduce((s, l) => s + lineUnitPrice(l) * billedQty(l), 0) +
    bundleCart.reduce((s, b) => s + b.individualTotal * b.qty, 0);
  // Total kg across the cart — matters for bundle/pallet items (rebar, cement) where the physical
  // load size is what the yard crew and delivery truck actually care about, not just the SAR total.
  const totalCartWeight = cart.reduce(
    (s, l) => s + l.weight * toStockQty(l.qty, l.factorToStock),
    0,
  );
  const lineTotalsSum = cart.reduce((s, l) => s + lineChargeTotal(l), 0) + bundleTaxable;
  const contractorDiscount = subtotal - lineTotalsSum;
  // True whenever at least one line's discount came entirely from a Quantity rule rather than the
  // customer-level contractor/tier rate — drives which label the summary below shows.
  const hasQuantityRuleDiscount = cart.some((l) => quantityPctFor(l) > contractorDiscountPct);

  const couponAmount = appliedCoupon?.valid
    ? appliedCoupon.discountType === "Percentage"
      ? (lineTotalsSum * appliedCoupon.value) / 100
      : appliedCoupon.value
    : 0;
  const manualValue = Number(discountValue) || 0;
  const manualAmount =
    discountType === "Percentage"
      ? (lineTotalsSum * manualValue) / 100
      : discountType === "Fixed"
        ? manualValue
        : 0;
  // Phase 2 Trade Value: resolved against lineTotalsSum exactly like OrdersController.Checkout.
  const tradeValuePct = isContractor ? resolveTradeValuePct(tradeValueRules, lineTotalsSum) : 0;
  const tradeValueAmount = (lineTotalsSum * tradeValuePct) / 100;
  const orderDiscount = Math.min(lineTotalsSum, couponAmount + manualAmount + tradeValueAmount);
  const discountRatio = lineTotalsSum === 0 ? 0 : orderDiscount / lineTotalsSum;

  // BRD §6.2 discount authorization tiers (mirrors the server-side check in OrdersController.Checkout):
  // Fixed-amount discounts always need Supervisor tier (ceiling ≥15% or unlimited); percentage
  // discounts are gated by the cashier's own DiscountCeilingPercent. Shown here so the cashier sees
  // *before* attempting to pay, not just after the server rejects it.
  const discountCeiling = user?.posCeilings.discountCeilingPercent ?? null;
  const orderDiscountNeedsApproval =
    discountType === "Fixed" && manualValue > 0
      ? !(discountCeiling === null || discountCeiling >= 15)
      : discountType === "Percentage" &&
        manualValue > 0 &&
        discountCeiling !== null &&
        manualValue > discountCeiling;
  // A cashier-entered per-line discount (BRD §2.3) is gated the same way — mirrors
  // OrdersController.Checkout's maxLineManualPct check, so the banner below shows *before* the
  // server would reject the sale, not just after.
  const maxLineManualPct = cart.reduce((max, l) => Math.max(max, l.manualDiscountPct ?? 0), 0);
  const lineDiscountNeedsApproval =
    maxLineManualPct > 0 && discountCeiling !== null && maxLineManualPct > discountCeiling;
  const discountNeedsApproval = orderDiscountNeedsApproval || lineDiscountNeedsApproval;
  // "Ready" only means a request has been submitted, not that a supervisor has approved it yet — the
  // POS has no live channel to that, so the honest state is "requested, retry Charge once approved"
  // rather than claiming certainty. The server is still the source of truth at checkout time.
  const discountApprovalRequested = discountNeedsApproval && discountApprovalId !== null;

  // A previously-granted approval only covers the discount it was requested for — if the cashier
  // changes the type/value afterward, the old approval id must not silently carry over.
  useEffect(() => {
    setDiscountApprovalId(null);
  }, [discountType, discountValue]);

  // BRD §7 (CR-039): a per-line manual price override is a DIFFERENT authorization from a discount —
  // gated by posCeilings.canOverrideItemPrice, mirrors OrdersController.Checkout's own gate exactly.
  const canOverrideItemPrice = user?.posCeilings.canOverrideItemPrice ?? false;
  const hasPriceOverride = cart.some((l) => l.manualUnitPrice != null);
  const priceOverrideNeedsApproval = hasPriceOverride && !canOverrideItemPrice;
  const priceOverrideApprovalRequested =
    priceOverrideNeedsApproval && priceOverrideApprovalId !== null;

  // A previously-granted approval only covers the override(s) it was requested for — clear it once
  // any line's override value changes, same rule as the discount approval above.
  const priceOverrideSignature = cart.map((l) => `${l.sku}:${l.manualUnitPrice ?? ""}`).join("|");
  useEffect(() => {
    setPriceOverrideApprovalId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceOverrideSignature]);

  const vat =
    cart.reduce((s, l) => s + lineChargeTotal(l) * (1 - discountRatio) * (l.vatRate / 100), 0) +
    bundleCart.reduce((s, b) => s + b.vatPerUnit * b.qty * (1 - discountRatio), 0);
  // Module 7 (BRD §4.3.2): Silver+ loyalty customers get delivery fees waived on orders over SAR 500
  // — must mirror the server's waiver exactly or the payment total won't match at checkout.
  const taxableTotal = lineTotalsSum - orderDiscount;
  const freeDelivery = qualifiesForFreeDelivery(
    customer?.loyaltyTier,
    customer?.loyaltyEnrolled,
    taxableTotal,
    tierConfig,
  );

  const hasDeliveryLines = cart.some((l) => l.requiresDelivery);
  const selectedDeliveryZone = deliveryZones?.find((z) => z.id === deliveryZoneId) ?? null;
  // BRD §3.5 "calculated ... automatically": picking a zone auto-derives the delivery fee — the
  // cashier can still add/edit a manual "Delivery" custom fee below instead if no zone applies.
  const autoDeliveryFee =
    hasDeliveryLines && selectedDeliveryZone && selectedDeliveryZone.fee > 0
      ? { label: `Delivery Fee (${selectedDeliveryZone.name})`, amount: selectedDeliveryZone.fee }
      : null;
  const deliveryDetailsComplete =
    !hasDeliveryLines ||
    Boolean(
      deliveryContactName.trim() &&
      deliveryContactMobile.trim() &&
      deliveryCity.trim() &&
      deliveryDate,
    );

  // Whether the coupon/manual-discount/custom-fee disclosure should be treated as "in use" — drives
  // both the collapsed-state "active" badge and auto-expanding it once any of them actually applies,
  // so a discount already on the sale is never hidden behind a collapsed panel.
  const hasActiveCouponDiscountFees =
    Boolean(appliedCoupon?.valid) || Boolean(discountType && discountValue) || customFees.length > 0;
  const showDiscountsPanel = discountsPanelOpen || hasActiveCouponDiscountFees;

  const allFees = autoDeliveryFee ? [...customFees, autoDeliveryFee] : customFees;
  const feesTotal = allFees.reduce(
    (s, f) => s + (freeDelivery && /delivery/i.test(f.label) ? 0 : f.amount),
    0,
  );
  const total = taxableTotal + vat + feesTotal;

  // BRD §4.3.3: redeemed points as a cart-level tender — mirrors CheckoutRedeemDialog's own
  // min/max math exactly. Re-clamped against the LIVE total/balance every render (not just at the
  // moment the cashier redeemed) so a cart edit afterward — a removed line, a bigger discount —
  // never lets a stale redemption exceed what's currently valid; the difference is silently absorbed
  // back into Amount Due rather than surfacing a separate error banner.
  const maxRedeemSar =
    customer && loyaltyConfig
      ? Math.min(customer.loyaltyPoints / loyaltyConfig.pointsPerSarRedeemed, total * (loyaltyConfig.maxRedeemPctOfTotal / 100))
      : 0;
  const effectivePointsRedeemed = Math.max(0, Math.min(pointsRedeemed, maxRedeemSar, total));
  const amountDue = Math.max(0, total - effectivePointsRedeemed);

  // Customer display: the exact same breakdown rows the summary panel below renders (subtotal,
  // contractor/trade-value/coupon discounts, fees, VAT, total) — kept as one function so the live
  // push and the post-charge "Approved" snapshot never drift apart from each other.
  const buildDisplaySnapshot = (
    status: CustomerDisplayStatus,
    orderNo: string | null = null,
  ): CustomerDisplaySnapshot => {
    const discounts: CustomerDisplayAmountLine[] = [];
    if (contractorDiscount > 0) {
      discounts.push({
        label:
          contractorDiscountPct > 0 && !hasQuantityRuleDiscount
            ? `Contractor discount ${contractorDiscountPct}%`
            : "Pricing rule discount",
        amount: contractorDiscount,
      });
    }
    if (tradeValueAmount > 0) {
      discounts.push({ label: `Trade Value ${tradeValuePct}%`, amount: tradeValueAmount });
    }
    if (couponAmount + manualAmount > 0) {
      discounts.push({ label: "Coupon / manual discount", amount: couponAmount + manualAmount });
    }
    if (effectivePointsRedeemed > 0) {
      discounts.push({ label: "Points redeemed", amount: effectivePointsRedeemed });
    }
    // Prefixed "Fee — " so a cashier's free-text custom-fee label (e.g. "a", "Handling") reads as a
    // fee to the customer instead of an unexplained word next to a dollar amount.
    const fees = allFees
      .map((f) => ({ label: `Fee — ${f.label}`, amount: freeDelivery && /delivery/i.test(f.label) ? 0 : f.amount }))
      .filter((f) => f.amount > 0);
    const lines: CustomerDisplayLine[] = [
      ...cart.map((l) => ({ name: l.name, qty: l.qty, uom: l.uom, unitPrice: lineUnitPrice(l), lineTotal: lineChargeTotal(l) })),
      ...bundleCart.map((b) => ({ name: b.name, qty: b.qty, uom: "bundle", unitPrice: b.bundlePrice, lineTotal: b.bundlePrice * b.qty })),
    ];
    return {
      status,
      lines,
      subtotal,
      discounts,
      fees,
      vat,
      // The amount the customer is actually being charged — Total minus whatever points already
      // covered — not the pre-redemption order total.
      total: amountDue,
      customerName: customer?.nameEn ?? null,
      orderNo,
      customerLoyaltyTier: customer?.loyaltyEnrolled ? customer.loyaltyTier : null,
      customerLoyaltyPoints: customer?.loyaltyEnrolled ? customer.loyaltyPoints : null,
      customerLoyaltyPointsSarValue: customer?.loyaltyEnrolled && loyaltyConfig ? loyaltyBalanceSar : null,
    };
  };

  // Pushes the live cart to a paired customer display as it changes. Backs off while thankYouUntil
  // is in the future so it doesn't stomp the "Approved" snapshot handleCharge just pushed with the
  // now-empty post-reset cart. displayConnected is in the dependency list on purpose, not just cart
  // state: the SignalR join is async, so on a fresh page load/refresh this effect's first run fires
  // before the connection is actually up and the push is silently dropped — once `connected` flips
  // true a moment later, this re-runs and sends the display the current (real) state instead of
  // leaving it stuck on whatever it last showed before the refresh.
  useEffect(() => {
    if (thankYouUntil && Date.now() < thankYouUntil) return;
    const status: CustomerDisplayStatus = checkout.isPending
      ? "Processing"
      : cart.length + bundleCart.length === 0
        ? "Idle"
        : "Building";
    pushDisplaySnapshot(buildDisplaySnapshot(status));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cart,
    bundleCart,
    subtotal,
    vat,
    total,
    customer,
    checkout.isPending,
    thankYouUntil,
    pushDisplaySnapshot,
    displayConnected,
  ]);

  // BRD §4.2 credit limit — informational until the cashier actually picks Account Credit in
  // PaymentDialog (the backend only enforces this when that payment method is used), but shown eagerly
  // here so a B2B customer's exposure is visible while building the cart, not just at payment time.
  const isB2B = customer?.type === "Contractor" || customer?.type === "B2B";
  const availableCredit = customer ? customer.creditLimit - customer.outstanding : 0;
  const creditNeedsApproval = isB2B && total > availableCredit;

  useEffect(() => {
    setCreditApprovalId(null);
    // A redemption belongs to the customer it was redeemed against — switching customers mid-sale
    // must not silently carry a stale points-based discount over to whoever's attached now.
    setPointsRedeemed(0);
  }, [customer?.id]);

  // Convenience prefill only — never overwrites a value the cashier already typed.
  useEffect(() => {
    if (!customer) return;
    setDeliveryContactName((v) => v || customer.nameEn);
    setDeliveryContactMobile((v) => v || customer.phone || "");
    setDeliveryCity((v) => v || customer.city || "");
    setDeliveryDistrict((v) => v || customer.district || "");
    setDeliveryStreet((v) => v || customer.address || "");
  }, [customer]);

  const idle = query === "" && cart.length === 0 && bundleCart.length === 0;
  const cartIsEmpty = cart.length === 0 && bundleCart.length === 0;
  // Weighing Scale integration: a sold-by-weight line starts at qty 0 until the cashier captures a
  // reading (see the scale UI in the cart line render) — checkout must wait for that, same idea as
  // deliveryDetailsComplete gating on the delivery panel below.
  const hasUncapturedWeight = cart.some((l) => l.isSoldByWeight && l.qty <= 0);
  // Serial Number Tracking: exactly one serial per unit before checkout — mirrors the backend's own
  // count check in OrdersController.Checkout, surfaced here so the cashier sees it before Charge
  // rejects the sale.
  const hasMissingSerials = cart.some((l) => l.requiresSerialTracking && (l.serialNumbers ?? []).filter((s) => s.trim()).length !== l.qty);

  // Customer auto-suggest: name/phone substring match against the already-loaded customer list —
  // shown live under the find box (2+ characters, max 6 matches).
  const customerSuggestions = useMemo(() => {
    const term = phone.trim().toLowerCase();
    if (term.length < 2 || customer) return [];
    return (customers ?? [])
      .filter(
        (c) =>
          c.nameEn.toLowerCase().includes(term) ||
          (c.nameAr ?? "").toLowerCase().includes(term) ||
          (c.phone ?? "").includes(term),
      )
      .slice(0, 6);
  }, [phone, customers, customer]);

  // Same substring match as the header search, but for the in-panel "Customer Address" combobox —
  // lets the cashier find/attach a customer without leaving the delivery details block.
  const deliveryCustomerSuggestions = useMemo(() => {
    const term = deliveryCustomerSearch.trim().toLowerCase();
    if (term.length < 2) return [];
    return (customers ?? [])
      .filter(
        (c) =>
          c.nameEn.toLowerCase().includes(term) ||
          (c.nameAr ?? "").toLowerCase().includes(term) ||
          (c.phone ?? "").includes(term),
      )
      .slice(0, 6);
  }, [deliveryCustomerSearch, customers]);

  async function handleCharge(payments: PaymentInput[]) {
    if (!effectiveBranchId) throw new Error("No branch selected.");
    if (!deliveryDetailsComplete) {
      throw new Error(
        "Delivery contact name, mobile, city and promised date are required for the flagged line(s).",
      );
    }
    // BRD §2.3 enhancement: a cut-to-size line with a tracked source size and a leftover remnant
    // must say what happens to it before the sale can complete — same client-side pre-check pattern
    // as the delivery-details guard above (the server enforces this too either way).
    const unresolvedRemnant = cart.find(
      (l) =>
        l.sourceQty !== undefined &&
        Math.max(0, Math.round((l.sourceQty - l.qty) * 1000) / 1000) > 0 &&
        !l.remnantAction,
    );
    if (unresolvedRemnant) {
      throw new Error(
        `Choose Restock or Scrap for ${unresolvedRemnant.name}'s remnant before charging.`,
      );
    }
    const delivery: DeliveryDetailsInput | null = hasDeliveryLines
      ? {
          addressType: deliveryAddressType,
          contactName: deliveryContactName.trim(),
          contactMobile: deliveryContactMobile.trim(),
          city: deliveryCity.trim(),
          district: deliveryDistrict.trim() || null,
          street: deliveryStreet.trim() || null,
          landmark: null,
          instructions: deliveryInstructions.trim() || null,
          promisedDate: deliveryDate,
          promisedTime: deliveryTime,
          timeSlot: null,
          priority: deliveryPriority,
          driverId: deliveryDriverId,
          vehicleId: deliveryVehicleId,
          zoneId: deliveryZoneId,
          weightTons: null,
        }
      : null;
    const request = {
      branchId: effectiveBranchId,
      terminalId: terminal?.id ?? null,
      customerId: customer?.id ?? null,
      type: isContractor ? "Contractor" : "Retail",
      lines: cart.map((l) =>
        l.isCutToSize && l.lengthM
          ? {
              productId: l.productId,
              qty: 0,
              lengthM: l.lengthM,
              widthM: l.cutToSizeUnit !== "Length" ? l.widthM : undefined,
              heightM: l.cutToSizeUnit === "Volume" ? l.heightM : undefined,
              requiresDelivery: l.requiresDelivery,
              notes: l.notes?.trim() || null,
              manualDiscountPct: l.manualDiscountPct ?? null,
              manualUnitPrice: l.manualUnitPrice ?? null,
              sourceQty: l.sourceQty ?? null,
              remnantAction: l.sourceQty ? (l.remnantAction ?? null) : null,
              consumeRemnantId: l.consumeRemnantId ?? null,
            }
          : {
              productId: l.productId,
              qty: l.qty,
              uom: l.uom,
              requiresDelivery: l.requiresDelivery,
              notes: l.notes?.trim() || null,
              manualDiscountPct: l.manualDiscountPct ?? null,
              manualUnitPrice: l.manualUnitPrice ?? null,
              serialNumbers: l.requiresSerialTracking ? l.serialNumbers ?? [] : undefined,
            },
      ),
      // Points redeemed in the cart (CheckoutRedeemDialog) are a tender the cashier already locked
      // in — folded in here as their own "Loyalty" payment alongside whatever PaymentDialog just
      // collected for the (already-reduced) Amount Due, so the server sees one payments array that
      // sums to the FULL order total, same shape it always expected.
      payments:
        effectivePointsRedeemed > 0
          ? [{ method: "Loyalty", amount: effectivePointsRedeemed }, ...payments]
          : payments,
      couponCode: appliedCoupon?.code ?? null,
      manualDiscount:
        discountType && manualValue > 0 ? { type: discountType, value: manualValue } : null,
      customFees: allFees,
      bundles: bundleCart.map((b) => ({
        bundleId: b.bundleId,
        qty: b.qty,
        supervisorEmail: b.supervisorEmail,
        supervisorPin: b.supervisorPin,
      })),
      poReference: poReference.trim() || null,
      projectCode: orderProjectCode.trim() || null,
      discountApprovalRequestId: discountNeedsApproval ? discountApprovalId : null,
      creditOverrideApprovalRequestId: creditNeedsApproval ? creditApprovalId : null,
      priceOverrideApprovalRequestId: priceOverrideNeedsApproval ? priceOverrideApprovalId : null,
      // Module 10: every checkout carries an idempotency key so an offline replay (or a retry after
      // a dropped response) can never double-sell.
      clientRequestId: newClientRequestId(),
      delivery,
    };
    try {
      const order = await checkout.mutateAsync(request);
      toast.success(`Payment accepted · ${order.orderNo}`, {
        description: money(order.grandTotal),
      });
      setLastOrderNo(order.orderNo);
      setReceiptOrder(order);
      setLastCompletedOrder(order);
      // Freezes the just-charged cart on the customer display with a thank-you state, before
      // resetSale() below clears it back to an empty ticket for the next customer.
      pushDisplaySnapshot(buildDisplaySnapshot("Approved", order.orderNo));
      const thankYouDeadline = Date.now() + 5_000;
      setThankYouUntil(thankYouDeadline);
      setTimeout(() => setThankYouUntil(null), 5_000);
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
          toast.success(`${synced.length} offline sale(s) synced`, {
            description: synced.map((o) => o.orderNo).join(", "),
          });
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
        lines: cart.map((l) => ({
          productId: l.productId,
          qty: toStockQty(l.qty, l.factorToStock),
        })),
        projectCode,
        customerReference,
      });
      toast.success(`${quotation.quoteNo} created`, {
        description: `Valid until ${new Date(quotation.validUntil).toLocaleDateString()} · no stock reserved.`,
      });
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
                  <option key={b.id} value={b.id}>
                    {b.nameEn}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {terminal?.branchName ?? "Branch"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <PrinterSetupDialog terminalId={terminal?.id} />
            <ScaleSetupDialog terminalId={terminal?.id} />
          </div>
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
                {idle && (
                  <span className="pos-radar absolute inset-0 rounded-xl ring-2 ring-white/50" />
                )}
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
                  Point&nbsp;of&nbsp;Sale · {terminal?.code ?? "Terminal"}
                </p>
                <p className="font-display text-lg font-semibold">Scanner Ready</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasAccess("/operate/customer-display") && (
                <div className="flex items-center overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15">
                  <button
                    onClick={() =>
                      window.open(
                        terminal ? customerDisplayPath(terminal.id) : "/operate/customer-display",
                        "customer-display",
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium transition hover:bg-white/20"
                    title="Open the customer-facing display in a new window"
                  >
                    <MonitorSmartphone className="h-3 w-3" /> Customer Display
                  </button>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}${terminal ? customerDisplayPath(terminal.id) : "/operate/customer-display"}`;
                      navigator.clipboard.writeText(url);
                      toast.success("Link copied", { description: url });
                    }}
                    className="flex items-center border-l border-white/15 px-2.5 py-1 transition hover:bg-white/20"
                    title="Copy the customer display's link — paste it into the tablet's browser to pair it"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium ring-1 ring-white/15">
                <span className={`h-1.5 w-1.5 rounded-full bg-success ${idle ? "pos-blink" : ""}`} />
                {idle ? "Awaiting scan" : "Active"}
              </div>
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

        {/* Phase 3 Bundle Suggestion Engine (BRD §5.5): fires once a bundle is >=80% complete from
            plain scanned items — a "you're one item away" nudge below 100%, an "add the full bundle"
            offer at 100% (which converts the already-scanned lines into the real bundle so pricing
            matches exactly what BundlesController would have charged). Dismissing hides it until the
            next sale (resetSale clears dismissedSuggestionIds) — it never nags twice for the same
            bundle in one ticket. */}
        {bundleSuggestion && (
          <div className="rounded-2xl border border-brand/30 bg-brand/5 p-3 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                  {bundleSuggestion.missing.length === 0
                    ? "Complete bundle available"
                    : "You're close to a bundle deal"}
                </p>
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  📦 {bundleSuggestion.bundle.nameEn}
                  {bundleSuggestion.missing.length === 0
                    ? " — every item is already in the cart."
                    : ` — you're ${bundleSuggestion.missing.length} item${bundleSuggestion.missing.length > 1 ? "s" : ""} away (${Math.round(bundleSuggestion.pct * 100)}% there).`}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {bundleSuggestion.missing.length > 0 &&
                    `Add ${bundleSuggestion.missing.map((l) => l.productName).join(", ")} to complete it — `}
                  Save{" "}
                  <CurrencyText
                    value={money(
                      Math.max(
                        0,
                        bundleSuggestion.bundle.individualTotal -
                          bundleSuggestion.bundle.bundlePrice,
                      ),
                    )}
                  />{" "}
                  vs individual prices.
                </p>
              </div>
              <button
                onClick={() => dismissBundleSuggestion(bundleSuggestion.bundle.id)}
                className="grid h-6 w-6 flex-none place-items-center rounded-md text-muted-foreground hover:bg-black/5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => dismissBundleSuggestion(bundleSuggestion.bundle.id)}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-black/5"
              >
                No thanks
              </button>
              <button
                onClick={() => acceptBundleSuggestion(bundleSuggestion)}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:bg-brand/90"
              >
                {bundleSuggestion.missing.length === 0 ? "Add Full Bundle" : "Add missing item(s)"}
              </button>
            </div>
          </div>
        )}

        {/* Bundles & Packages (BRD §5.3): active bundles browseable without searching; a bundle with
            any out-of-stock constituent is greyed out with the blocking item named. Scanning/searching
            a constituent SKU also surfaces its bundle here as a suggestion (BRD §5.2). Bundle Search
            (BRD §5.6) matches bundle code/name, any constituent SKU/name substring, or barcode. */}
        {activeBundles.length > 0 && (
          <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bundles &amp; Packages
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {activeBundles
                .filter((b) => {
                  const q = query.trim().toLowerCase();
                  if (q === "") return true;
                  return (
                    b.nameEn.toLowerCase().includes(q) ||
                    b.code.toLowerCase().includes(q) ||
                    b.lines.some(
                      (l) =>
                        l.sku.toLowerCase().includes(q) ||
                        l.productName.toLowerCase().includes(q) ||
                        (l.barcode?.toLowerCase() ?? "") === q,
                    )
                  );
                })
                .map((b) => {
                  const stockBlocked = bundleAvailability(
                    b,
                    (bundleCart.find((e) => e.bundleId === b.id)?.qty ?? 0) + 1,
                  );
                  // Phase 4: eligibility blocks (branch/customer-group) are overridable by a
                  // supervisor; stock blocks above are not — there's no unit to sell either way.
                  const eligibilityBlocked = stockBlocked ? null : bundleEligibility(b);
                  const savings = Math.max(0, b.individualTotal - b.bundlePrice);
                  const savingsPct =
                    b.individualTotal > 0 ? Math.round((savings / b.individualTotal) * 100) : 0;
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        if (eligibilityBlocked) {
                          setOverrideBundle(b);
                          return;
                        }
                        addBundle(b);
                      }}
                      disabled={stockBlocked !== null}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                        stockBlocked
                          ? "cursor-not-allowed border-black/5 opacity-50"
                          : eligibilityBlocked
                            ? "border-warning/30 bg-warning/5 hover:-translate-y-0.5 hover:border-warning/50"
                            : "border-black/5 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
                      }`}
                    >
                      <p className="text-sm font-semibold text-foreground">📦 {b.nameEn}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {b.lines.map((l) => `${l.qty}× ${l.sku}`).join(" + ")}
                      </p>
                      {stockBlocked ? (
                        <p className="mt-1 text-[10px] font-semibold text-critical">
                          Unavailable — {stockBlocked}
                        </p>
                      ) : eligibilityBlocked ? (
                        <p className="mt-1 text-[10px] font-semibold text-warning">
                          {eligibilityBlocked} — tap for supervisor override
                        </p>
                      ) : (
                        <p className="mt-1 text-xs">
                          <span className="text-muted-foreground line-through">
                            {b.individualTotal.toFixed(2)}
                          </span>{" "}
                          <span className="font-mono font-semibold text-brand">
                            {b.bundlePrice.toFixed(2)} <SARIcon />
                          </span>{" "}
                          <span className="rounded bg-success/10 px-1 py-0.5 text-[10px] font-semibold text-success">
                            Save {savingsPct}%
                          </span>
                        </p>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Category browser: a searchable dropdown listing every category and subcategory (any
            nesting depth), indented into a tree — replaces a chip-per-category layout that turned
            into an unreadable wall once the catalog grew past a couple dozen categories. */}
        {topLevelCategories.length > 0 && (
          <div className="flex items-center gap-2">
            <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  className={`flex min-w-[240px] max-w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition ${
                    activeCategory
                      ? "border-brand/40 bg-brand/5 text-brand"
                      : "border-black/10 bg-white text-foreground hover:border-brand/40"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FolderTree className="h-4 w-4 flex-none" />
                    <span className="truncate">
                      {activeCategoryName === "All" ? "All Categories" : activeCategoryName}
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[320px] p-0">
                <Command>
                  <CommandInput placeholder="Search categories..." />
                  <CommandList className="max-h-[360px]">
                    <CommandEmpty>No category found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="All Categories"
                        onSelect={() => {
                          setCategoryFilter(null);
                          setCategoryPickerOpen(false);
                        }}
                      >
                        <span className="flex-1 truncate font-medium">All Categories</span>
                        {categoryFilter == null && (
                          <Check className="h-4 w-4 flex-none text-brand" />
                        )}
                      </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading={`${categories?.length ?? 0} categories`}>
                      {categoryTree.map(({ category: c, depth }) => (
                        <CommandItem
                          key={c.id}
                          value={categoryPath(c.id)}
                          onSelect={() => {
                            setCategoryFilter(c.id);
                            setCategoryPickerOpen(false);
                          }}
                          style={{ paddingLeft: `${8 + depth * 16}px` }}
                          className="flex-col items-start gap-0"
                        >
                          <div className="flex w-full items-center gap-2">
                            {depth > 0 && (
                              <span className="flex-none text-muted-foreground/50">└</span>
                            )}
                            <span className={`flex-1 truncate ${depth === 0 ? "font-medium" : ""}`}>
                              {c.nameEn}
                            </span>
                            {categoryFilter === c.id && (
                              <Check className="h-4 w-4 flex-none text-brand" />
                            )}
                          </div>
                          {/* Search can surface a deep subcategory with its parent(s) filtered out of view —
                              always show the ancestor chain so the cashier knows which "Wire" this is. */}
                          {c.parentId != null && (
                            <span className="truncate pl-5 text-[10px] text-muted-foreground">
                              {categoryPath(c.parentId)}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {activeCategory && (
              <button
                onClick={() => setCategoryFilter(null)}
                className="text-[11px] font-medium text-muted-foreground hover:text-brand"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Results appear UNDER the scanner when searching or browsing a category */}
        {(query !== "" || categoryFilter != null) && (
          <div className="pos-slide-up rounded-2xl border border-black/5 bg-white p-3 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {query !== ""
                  ? `${tiles.length} match${tiles.length === 1 ? "" : "es"} for "${query}"`
                  : `${tiles.length} product${tiles.length === 1 ? "" : "s"} in ${activeCategoryName}`}
              </p>
              <button
                onClick={() => {
                  setQuery("");
                  setCategoryFilter(null);
                }}
                className="text-[11px] font-medium text-brand hover:underline"
              >
                Clear
              </button>
            </div>
            {tiles.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No product found. Try SKU, name or barcode.
              </div>
            ) : (
              <div className="ui-tile-grid ui-cols-5">
                {tiles.map((t, i) => {
                  if (t.isGroup) {
                    const Icon = productIcon[t.variants[0]?.sku ?? ""] ?? Package;
                    return (
                      <Popover
                        key={`group-${t.variantGroupId}`}
                        open={openVariantGroupId === t.variantGroupId}
                        onOpenChange={(o) => setOpenVariantGroupId(o ? t.variantGroupId : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            style={{ animationDelay: `${i * 40}ms` }}
                            className="pos-slide-up group relative flex flex-col items-start overflow-hidden rounded-xl border border-black/5 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
                          >
                            <span className="absolute right-2 top-2 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                              {t.variants.length} sizes
                            </span>
                            <div className="relative mb-2 grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-canvas to-concrete">
                              {t.imageUrl ? (
                                <img
                                  src={t.imageUrl}
                                  alt={t.name}
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
                            <p className="mt-2 text-sm font-medium text-foreground line-clamp-2">
                              {t.name}
                            </p>
                            {categoryLabelFor(t.categoryId) && (
                              <p className="mt-0.5 truncate text-[10px] text-brand">
                                {categoryLabelFor(t.categoryId)}
                              </p>
                            )}
                            <p className="mt-2 font-display text-lg font-bold text-foreground">
                              from {t.minPrice.toFixed(2)}{" "}
                              <span className="text-xs font-medium text-muted-foreground">
                                ر.س / {t.uom}
                              </span>
                            </p>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[280px] p-2">
                          <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {t.name} — pick a size
                          </p>
                          <div className="space-y-1">
                            {t.variants.map((v) => (
                              <button
                                key={v.sku}
                                onClick={() => {
                                  addToCart(v);
                                  setOpenVariantGroupId(null);
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-brand/5"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-foreground">
                                    {v.attributes.length
                                      ? v.attributes.map((a) => a.value).join(" · ")
                                      : v.name}
                                  </span>
                                  <span
                                    className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${toneClass[v.tone]}`}
                                  >
                                    {v.stock} {v.uom}
                                  </span>
                                </span>
                                <span className="flex-none font-display text-sm font-bold text-foreground">
                                  {v.price.toFixed(2)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  }

                  const p = t;
                  const Icon = productIcon[p.sku] ?? Package;
                  // A real uploaded photo (Product.ImageUrl) always wins; the static demo map is
                  // only a fallback for the seeded sample catalog, then a generic category icon.
                  const img = p.imageUrl || productImage[p.sku];
                  return (
                    <button
                      key={p.sku}
                      onClick={() => addToCart(p)}
                      style={{ animationDelay: `${i * 40}ms` }}
                      className="pos-slide-up group relative flex flex-col items-start overflow-hidden rounded-xl border border-black/5 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,10,50,0.04)] transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
                    >
                      <span
                        className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass[p.tone]}`}
                      >
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
                      <p className="mt-2 text-sm font-medium text-foreground line-clamp-2">
                        {p.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{p.sku}</p>
                      {categoryLabelFor(p.categoryId) && (
                        <p className="mt-0.5 truncate text-[10px] text-brand">
                          {categoryLabelFor(p.categoryId)}
                        </p>
                      )}
                      <p className="mt-2 font-display text-lg font-bold text-foreground">
                        {p.price.toFixed(2)}{" "}
                        <span className="text-xs font-medium text-muted-foreground">
                          <SARIcon /> / {p.uom}
                        </span>
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Held Sales ({heldSales.length})
              </p>
            </div>
            <div className="space-y-1.5">
              {heldSales.map((h) => (
                <button
                  key={h.id}
                  onClick={() => handleResume(h.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-black/5 bg-canvas px-3 py-2 text-left transition hover:border-brand/40 hover:bg-brand/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {h.ticketNo} · {h.customerName ?? "Walk-in"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {h.lines.length} item{h.lines.length === 1 ? "" : "s"} ·{" "}
                      {h.notes ?? "No notes"}
                    </p>
                  </div>
                  <span className="flex flex-none items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      <CurrencyText value={money(h.total)} />
                    </span>
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
              {holdSale.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}{" "}
              Hold
            </button>
            <button
              onClick={handleCreateQuotation}
              disabled={cartIsEmpty || createQuotation.isPending}
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              title="Convert cart to quotation"
            >
              {createQuotation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}{" "}
              Quote
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
                  <span className="text-muted-foreground">
                    · {customer.type} · {customer.phone}
                  </span>
                </div>
                <button
                  onClick={() => setCustomer(null)}
                  className="text-muted-foreground hover:text-critical"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {(customer.type === "Contractor" || customer.type === "B2B") && (
                <div className="flex items-center justify-between rounded-lg bg-canvas px-2.5 py-1 text-[11px] text-muted-foreground">
                  <span>
                    Credit:{" "}
                    <CurrencyText value={money(customer.creditLimit - customer.outstanding)} />{" "}
                    available of <CurrencyText value={money(customer.creditLimit)} />
                  </span>
                  {creditNeedsApproval && (
                    <button
                      onClick={() => setCreditApprovalDialogOpen(true)}
                      className="font-medium text-warning hover:underline"
                    >
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
                    <span>
                      <CurrencyText
                        value={money(
                          nextTierProgress(customer.loyaltyLifetimeSpend, tierConfig)!.remaining,
                        )}
                      />{" "}
                      to {nextTierProgress(customer.loyaltyLifetimeSpend, tierConfig)!.nextTier}
                    </span>
                  )}
                </div>
              )}
              {/* BRD §4.3.3: points balance + SAR equivalent must be visible at checkout, with a
                  direct shortcut into the cart-level redeem dialog — not just discoverable once the
                  cashier is already inside Charge. Redeeming here (not inside Charge) is what makes
                  it show up as its own row in the summary panel below, same as any other discount. */}
              {customer.loyaltyEnrolled && (
                <div className="flex items-center justify-between rounded-lg bg-canvas px-2.5 py-1 text-[11px]">
                  <span className="text-muted-foreground">
                    {customer.loyaltyPoints.toLocaleString("en-US")} pts
                    {loyaltyConfig ? ` (≈ ${money(loyaltyBalanceSar)})` : ""}
                    {loyaltyConfig &&
                      !canRedeemPoints &&
                      customer.loyaltyPoints < loyaltyConfig.minRedeemPoints && (
                        <span>
                          {" "}
                          · needs {loyaltyConfig.minRedeemPoints.toLocaleString("en-US")}+ to redeem
                        </span>
                      )}
                  </span>
                  <button
                    type="button"
                    disabled={!canRedeemPoints || cartIsEmpty || hasUncapturedWeight || hasMissingSerials}
                    onClick={() => setRedeemDialogOpen(true)}
                    title={
                      cartIsEmpty
                        ? "Add an item to the cart first"
                        : loyaltyConfig && !canRedeemPoints
                          ? `Minimum redemption is ${loyaltyConfig.minRedeemPoints.toLocaleString("en-US")} points`
                          : undefined
                    }
                    className="font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                  >
                    {effectivePointsRedeemed > 0 ? "Edit redemption" : "Redeem Points"}
                  </button>
                </div>
              )}
              {/* Module 20 (BRD §4.3.4): warn the cashier when the customer's points lapse next month. */}
              {customer.pointsExpiringSoon && (customer.loyaltyPoints ?? 0) > 0 && (
                <p className="rounded-lg bg-warning/15 px-2.5 py-1 text-[11px] font-medium text-warning-foreground">
                  ⚠ {customer.loyaltyPoints} points expire next month unless the customer makes a
                  purchase.
                </p>
              )}
              {/* Module 11 (BRD §4.2): B2B PO reference + project code, carried onto the tax invoice. */}
              {isB2B && (
                <div className="flex gap-1.5">
                  <input
                    value={poReference}
                    onChange={(e) => setPoReference(e.target.value)}
                    placeholder="PO reference"
                    className="h-7 w-1/2 rounded-md border border-black/10 bg-white px-2 text-[11px] outline-none focus:border-brand"
                  />
                  <input
                    value={orderProjectCode}
                    onChange={(e) => setOrderProjectCode(e.target.value)}
                    placeholder="Project code"
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
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setNotFound(false);
                    }}
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
                      onClick={() => {
                        setCustomer(c);
                        setPhone("");
                        setNotFound(false);
                      }}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs hover:bg-brand/5"
                    >
                      <span className="truncate font-medium text-foreground">{c.nameEn}</span>
                      <span className="ml-2 flex-none text-[10px] text-muted-foreground">
                        {c.type}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {notFound && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-2">
                  <p className="mb-1.5 text-[11px] font-medium text-[oklch(0.4_0.13_70)]">
                    Not found — save as new customer?
                  </p>
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
                      {createCustomer.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </button>
                    <button
                      onClick={() => setNotFound(false)}
                      className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-black/5"
                    >
                      Skip
                    </button>
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
              <p className="text-[11px] text-muted-foreground/70">
                Scanned items will appear here.
              </p>
            </div>
          )}
          {/* Module 8 (BRD §5.2): bundles ride the cart as grouped entries — the server expands them
              into constituent lines at checkout, so the receipt itemizes every component. */}
          {bundleCart.map((b) => (
            <div key={`bundle-${b.bundleId}`} className="bg-brand/5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    📦 {b.name}
                    {b.supervisorEmail && (
                      <span className="ml-1.5 rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning">
                        Supervisor Override
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {b.code} · saves{" "}
                    <CurrencyText value={money((b.individualTotal - b.bundlePrice) * b.qty)} /> vs
                    individual
                  </p>
                </div>
                <button
                  onClick={() =>
                    setBundleCart((entries) => entries.filter((e) => e.bundleId !== b.bundleId))
                  }
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
                <p className="font-mono text-sm font-semibold text-foreground">
                  <CurrencyText value={money(b.bundlePrice * b.qty)} />
                </p>
              </div>
            </div>
          ))}
          {cart.map((l) => (
            <div
              key={l.sku}
              className={`px-4 py-3 ${lastAdded === l.sku ? "pos-pop bg-brand/5" : "pos-slide-up"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-10 w-10 shrink-0 overflow-hidden place-items-center rounded-md bg-canvas ring-1 ring-black/5">
                    {(() => {
                      const img = l.imageUrl || productImage[l.sku];
                      if (img)
                        return (
                          <img
                            src={img}
                            alt={l.name}
                            loading="lazy"
                            className="h-full w-full object-contain p-0.5"
                          />
                        );
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
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {l.sku} · {l.uom}
                      {l.weight > 0 &&
                        ` · ${(l.weight * toStockQty(l.qty, l.factorToStock)).toFixed(1)} kg`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {/* A single labeled menu instead of a row of unlabeled icon buttons — cashiers
                      couldn't tell what the icons did; text menu items are self-explanatory and
                      only take up space while open. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        title="More actions"
                        aria-label={`More actions for ${l.name}`}
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md transition ${
                          l.notes || l.manualUnitPrice != null || l.requiresDelivery
                            ? "bg-brand/10 text-brand"
                            : "text-muted-foreground hover:bg-brand/10 hover:text-brand"
                        }`}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onSelect={() => setNotesEditingSku(l.sku)}>
                        <StickyNote className="h-4 w-4" />
                        {l.notes ? "Edit note" : "Add a note"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setPriceEditingSku(l.sku)}>
                        <PenLine className="h-4 w-4" />
                        {l.manualUnitPrice != null
                          ? "Edit price override"
                          : "Override this item's price"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDiscountEditingSku(l.sku)}>
                        <Percent className="h-4 w-4" />
                        {l.manualDiscountPct ? `Edit discount (${l.manualDiscountPct}%)` : "Add a discount"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => toggleDelivery(l.sku)}>
                        <Truck className="h-4 w-4" />
                        {l.requiresDelivery
                          ? "Switch to counter pickup"
                          : "Deliver this item instead of counter pickup"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => removeLine(l.sku)}
                        className="text-critical focus:text-critical"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove item
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {l.requiresDelivery && (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-brand">
                  <Truck className="h-3 w-3" /> Delivery
                </p>
              )}
              {/* Phase 2 (BRD §5.1): let the cashier see a Buy-X-Get-Y/pallet rule fired before
                  checkout, not just discover it on the receipt afterward. */}
              {(() => {
                const buyXGetYRule = buyXGetYRuleFor(l);
                if (buyXGetYRule) {
                  const { freeUnits } = resolveBuyXGetYSplit(
                    buyXGetYRule,
                    toStockQty(l.qty, l.factorToStock),
                  );
                  if (freeUnits > 0) {
                    return (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-success">
                        <Tag className="h-3 w-3" /> Buy {buyXGetYRule.buyQty} Get{" "}
                        {buyXGetYRule.freeQty} — {freeUnits} free
                      </p>
                    );
                  }
                }
                const palletRule = palletRuleFor(l);
                if (palletRule) {
                  const { palletUnits } = resolvePalletSplit(
                    palletRule,
                    toStockQty(l.qty, l.factorToStock),
                  );
                  if (palletUnits > 0) {
                    return (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-success">
                        <Tag className="h-3 w-3" /> Pallet price applied to {palletUnits} of{" "}
                        {toStockQty(l.qty, l.factorToStock)}
                      </p>
                    );
                  }
                }
                return null;
              })()}
              {/* BRD §2.3: per-line note — expanded via the note icon above, or whenever a note
                  already exists so it's never hidden after the icon is toggled closed. */}
              {(notesEditingSku === l.sku || l.notes) && (
                <input
                  type="text"
                  value={l.notes ?? ""}
                  placeholder="Note for this item…"
                  aria-label={`${l.sku} note`}
                  onChange={(e) => setLineNotes(l.sku, e.target.value)}
                  onBlur={() => {
                    if (!l.notes) setNotesEditingSku(null);
                  }}
                  className="mt-1.5 w-full rounded-md border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-brand"
                />
              )}
              {/* BRD §7 (CR-039): per-line price override — an absolute price, not a discount,
                  gated by posCeilings.canOverrideItemPrice / a PriceOverride approval. */}
              {(priceEditingSku === l.sku || l.manualUnitPrice != null) && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.manualUnitPrice ?? ""}
                    placeholder={`Override price (list ${money(l.price)})`}
                    aria-label={`${l.sku} price override`}
                    onChange={(e) => setLineManualPrice(l.sku, e.target.value)}
                    onBlur={() => {
                      if (l.manualUnitPrice == null) setPriceEditingSku(null);
                    }}
                    className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-brand"
                  />
                  {!canOverrideItemPrice && l.manualUnitPrice != null && (
                    <span className="shrink-0 text-[10px] font-medium text-warning">
                      needs approval
                    </span>
                  )}
                </div>
              )}
              {/* BRD §2.3/§6.2: per-line discount % — expanded via the "More actions" menu, or
                  whenever a discount is already set so it's never hidden after the menu item is
                  toggled closed. Kept off the always-visible qty row (see discountEditingSku). */}
              {(discountEditingSku === l.sku || (l.manualDiscountPct ?? 0) > 0) && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="relative w-28">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={l.manualDiscountPct ?? ""}
                      placeholder="0"
                      aria-label={`${l.sku} discount percent`}
                      onChange={(e) => setLineDiscountPct(l.sku, e.target.value)}
                      onBlur={() => {
                        if (!l.manualDiscountPct) setDiscountEditingSku(null);
                      }}
                      className="h-7 w-full rounded-md border border-black/10 bg-white px-2 pr-6 text-xs outline-none focus:border-brand"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                      %
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">line discount</span>
                  {maxLineManualPct > 0 && lineDiscountNeedsApproval && (l.manualDiscountPct ?? 0) > 0 && (
                    <span className="shrink-0 text-[10px] font-medium text-warning">
                      needs approval
                    </span>
                  )}
                </div>
              )}
              {l.isSoldByWeight ? (
                // Weighing Scale integration: qty comes from a live reading off the paired scale
                // instead of manual entry — "Capture" locks the current reading into the line via
                // setQtyDirect, same validation (stock availability, > 0) as a manual qty edit.
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    {!scaleDevice ? (
                      <span className="text-muted-foreground">
                        No scale paired to this terminal — pair one from Network → Devices.
                      </span>
                    ) : !scaleReading.connected ? (
                      <span className="text-warning">Connecting to scale…</span>
                    ) : (
                      <span className={scaleReading.stable ? "text-foreground" : "text-warning"}>
                        Reading: <span className="font-mono font-semibold">{scaleReading.weightKg?.toFixed(3) ?? "—"}</span> kg
                        {!scaleReading.stable && " (settling…)"}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={scaleReading.weightKg == null}
                      onClick={() => setQtyDirect(l.sku, String(scaleReading.weightKg))}
                      className="rounded-md border border-brand/30 bg-brand/10 px-2 py-1 font-medium text-brand transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Capture
                    </button>
                    <span className="font-medium text-muted-foreground">
                      = {l.qty > 0 ? `${l.qty.toFixed(3)} ${l.stockUom}` : "not weighed yet"}
                    </span>
                  </div>
                  <p className="font-mono text-sm font-semibold text-foreground">
                    <CurrencyText value={money(l.price * l.qty)} />
                  </p>
                </div>
              ) : l.isCutToSize ? (
                // BRD §2.3 items 5-6: cut-to-size lines take dimension entry instead of a plain qty —
                // the computed length/area/volume (per the product's cut-to-size unit) becomes the
                // billed quantity at the per-stock-UOM price. Length needs just one input, Area two,
                // Volume three.
                <>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-xs">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={l.lengthM ?? ""}
                        aria-label={`${l.sku} length (m)`}
                        onChange={(e) => changeDimension(l.sku, "lengthM", e.target.value)}
                        className="h-7 w-16 rounded-md border border-black/10 bg-white px-1.5 text-center font-mono outline-none focus:border-brand"
                      />
                      {l.cutToSizeUnit !== "Length" && (
                        <>
                          <span className="text-muted-foreground">×</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={l.widthM ?? ""}
                            aria-label={`${l.sku} width (m)`}
                            onChange={(e) => changeDimension(l.sku, "widthM", e.target.value)}
                            className="h-7 w-16 rounded-md border border-black/10 bg-white px-1.5 text-center font-mono outline-none focus:border-brand"
                          />
                        </>
                      )}
                      {l.cutToSizeUnit === "Volume" && (
                        <>
                          <span className="text-muted-foreground">×</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={l.heightM ?? ""}
                            aria-label={`${l.sku} height (m)`}
                            onChange={(e) => changeDimension(l.sku, "heightM", e.target.value)}
                            className="h-7 w-16 rounded-md border border-black/10 bg-white px-1.5 text-center font-mono outline-none focus:border-brand"
                          />
                        </>
                      )}
                      <span className="ml-1 font-medium text-muted-foreground">
                        m = {l.qty} {l.stockUom}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {l.manualUnitPrice != null ? (
                        <div className="text-right">
                          <p className="font-mono text-[10px] text-muted-foreground line-through">
                            <CurrencyText value={money(l.price * billedQty(l))} />
                          </p>
                          <p className="font-mono text-sm font-semibold text-brand">
                            <CurrencyText value={money(l.manualUnitPrice * billedQty(l))} />
                          </p>
                        </div>
                      ) : lineChargeTotal(l) !== l.price * l.qty ? (
                        <div className="text-right">
                          <p className="font-mono text-[10px] text-muted-foreground line-through">
                            <CurrencyText value={money(l.price * l.qty)} />
                          </p>
                          <p className="font-mono text-sm font-semibold text-foreground">
                            <CurrencyText value={money(lineChargeTotal(l))} />
                          </p>
                        </div>
                      ) : (
                        <p className="font-mono text-sm font-semibold text-foreground">
                          <CurrencyText value={money(l.price * l.qty)} />
                        </p>
                      )}
                    </div>
                  </div>
                  {(() => {
                    // BRD §2.3 enhancement: minimum billable qty — the exact measured cut is always
                    // what's shown/edited above; this is purely a "you'll actually be billed at least
                    // X" notice, matching what OrdersController.Checkout will compute server-side.
                    const minCutQty = products.find((p) => p.sku === l.sku)?.minCutQty ?? null;
                    const belowMinimum = minCutQty != null && l.qty > 0 && l.qty < minCutQty;
                    // Remnant tracking: only meaningful once a source size is entered and it's larger
                    // than the measured cut — otherwise there's nothing left over to decide about.
                    const remnant =
                      l.sourceQty !== undefined
                        ? Math.max(0, Math.round((l.sourceQty - l.qty) * 1000) / 1000)
                        : 0;
                    // Cut Optimization: offer any tracked offcuts of this exact product at this
                    // branch as an alternative to cutting fresh bulk stock — cheapest waste-reduction
                    // move a cashier can make, so surface it right where the cut is being sized.
                    const productRemnants = (availableRemnants ?? []).filter(
                      (r) => r.productId === l.productId,
                    );
                    const selectedRemnant = productRemnants.find((r) => r.id === l.consumeRemnantId);
                    // Only pay the bordered-card "look at me" treatment when there's actually extra
                    // info to show (offcuts on offer, one selected, leftover to decide on, or below
                    // the min charge) — otherwise this is just the plain one-line prompt every
                    // cut-to-size line shows, and a cart with many such lines would turn into a wall
                    // of boxes if every one of them got a card.
                    const hasExtra =
                      belowMinimum ||
                      (productRemnants.length > 0 && !l.consumeRemnantId) ||
                      Boolean(selectedRemnant) ||
                      remnant > 0;
                    return (
                      <div
                        className={
                          hasExtra
                            ? "mt-1.5 space-y-1 rounded-lg border border-black/10 bg-canvas/60 px-2 py-1.5 text-xs"
                            : "mt-1.5 text-xs"
                        }
                      >
                        {belowMinimum && (
                          <p className="font-medium text-warning">
                            Billed at minimum {minCutQty} {l.stockUom} (measured {l.qty})
                          </p>
                        )}
                        {productRemnants.length > 0 && !l.consumeRemnantId && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground">Offcuts available:</span>
                            {productRemnants.map((r) => (
                              <button
                                key={r.id}
                                onClick={() => selectRemnant(l.sku, r)}
                                title={r.sourceOrderNo ? `From ${r.sourceOrderNo}` : undefined}
                                className="rounded-md border border-brand/30 bg-brand/5 px-2 py-1 font-semibold text-brand transition hover:bg-brand/10"
                              >
                                {r.qty} {l.stockUom}
                                {r.discountPct > 0 ? ` (-${r.discountPct}%)` : ""}
                              </button>
                            ))}
                          </div>
                        )}
                        {selectedRemnant ? (
                          <div className="flex items-center justify-between gap-2 rounded-md bg-brand/10 px-2 py-1">
                            <span className="text-foreground">
                              Cutting from offcut:{" "}
                              <span className="font-semibold text-brand">
                                {selectedRemnant.qty} {l.stockUom}
                              </span>
                            </span>
                            <button
                              onClick={() => selectRemnant(l.sku, null)}
                              aria-label={`${l.sku} clear selected remnant`}
                              className="flex items-center gap-1 font-medium text-muted-foreground hover:text-critical"
                            >
                              <X className="h-3.5 w-3.5" /> Clear
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <label htmlFor={`${l.sku}-source-qty`} className="font-medium text-foreground">
                              Cutting from a larger piece?
                            </label>
                            <input
                              id={`${l.sku}-source-qty`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.sourceQty ?? ""}
                              placeholder="size"
                              aria-label={`${l.sku} source size`}
                              onChange={(e) => setSourceQty(l.sku, e.target.value)}
                              className="h-7 w-16 rounded-md border border-black/10 bg-white px-1.5 text-center font-mono outline-none focus:border-brand"
                            />
                            <span>{l.stockUom}</span>
                          </div>
                        )}
                        {remnant > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-foreground">
                              Leftover: {remnant} {l.stockUom} —
                            </span>
                            <button
                              onClick={() => setRemnantAction(l.sku, "Restock")}
                              className={`rounded-md border px-2 py-1 font-medium transition ${l.remnantAction === "Restock" ? "border-brand bg-brand/10 text-brand" : "border-black/10 text-muted-foreground hover:bg-black/5"}`}
                            >
                              Restock it
                            </button>
                            <button
                              onClick={() => setRemnantAction(l.sku, "Scrap")}
                              className={`rounded-md border px-2 py-1 font-medium transition ${l.remnantAction === "Scrap" ? "border-critical bg-critical/10 text-critical" : "border-black/10 text-muted-foreground hover:bg-black/5"}`}
                            >
                              Scrap it
                            </button>
                            {!l.remnantAction && <span className="font-medium text-critical">choose one</span>}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
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
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={l.qty}
                        aria-label={`${l.sku} quantity`}
                        onChange={(e) => setQtyDirect(l.sku, e.target.value)}
                        className="w-10 border-0 bg-transparent text-center text-sm font-semibold outline-none focus:bg-brand/5"
                      />
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
                        value={l.uom}
                        aria-label={`${l.sku} unit of measure`}
                        onChange={(e) => changeUom(l.sku, e.target.value)}
                        className="h-7 rounded-md border border-black/10 bg-white px-1.5 text-xs font-medium outline-none focus:border-brand"
                      >
                        {sellableUoms(l.stockUom, l.conversions).map((o) => (
                          <option key={o.uom} value={o.uom}>
                            {o.uom}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {l.manualUnitPrice != null ? (
                    <div className="text-right">
                      <p className="font-mono text-[10px] text-muted-foreground line-through">
                        <CurrencyText value={money(l.price * l.qty)} />
                      </p>
                      <p className="font-mono text-sm font-semibold text-brand">
                        <CurrencyText value={money(l.manualUnitPrice * l.qty)} />
                      </p>
                    </div>
                  ) : lineDiscountPct(l) > 0 ? (
                    <div className="text-right">
                      <p className="font-mono text-[10px] text-muted-foreground line-through">
                        <CurrencyText value={money(l.price * l.qty)} />
                      </p>
                      <p className="font-mono text-sm font-semibold text-foreground">
                        <CurrencyText
                          value={money(l.price * l.qty * (1 - lineDiscountPct(l) / 100))}
                        />
                      </p>
                    </div>
                  ) : (
                    <p className="font-mono text-sm font-semibold text-foreground">
                      <CurrencyText value={money(l.price * l.qty)} />
                    </p>
                  )}
                </div>
              )}
              {l.requiresSerialTracking && (
                // Serial Number Tracking: one serial per unit — count must match qty exactly before
                // checkout (see hasMissingSerials), validated for real availability server-side.
                <div className="mt-1.5 space-y-1">
                  <input
                    type="text"
                    defaultValue={(l.serialNumbers ?? []).join(", ")}
                    onChange={(e) => setLineSerialsText(l.sku, e.target.value)}
                    placeholder={`Serial number(s), comma-separated (need ${l.qty})`}
                    aria-label={`${l.sku} serial numbers`}
                    className="h-7 w-full rounded-md border border-black/10 bg-white px-2 text-xs font-mono outline-none focus:border-brand"
                  />
                  <p className={`text-[11px] font-medium ${(l.serialNumbers ?? []).filter((s) => s.trim()).length === l.qty ? "text-success" : "text-warning"}`}>
                    {(l.serialNumbers ?? []).filter((s) => s.trim()).length} of {l.qty} serial(s) entered
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* BRD §3.5: delivery details — captured once per checkout for every delivery-flagged line. */}
        {hasDeliveryLines && (
          <div className="space-y-2 border-t border-black/5 bg-brand/5 px-4 py-2.5 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-brand">
              <Truck className="h-3.5 w-3.5" /> Delivery details
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={deliveryAddressType}
                onChange={(e) =>
                  setDeliveryAddressType(e.target.value as typeof deliveryAddressType)
                }
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
              {deliveryAddressType === "Customer Address" && (
                <div className="relative col-span-2">
                  {customer ? (
                    <div className="flex h-8 items-center justify-between gap-1.5 rounded-md border border-black/10 bg-white px-2">
                      <span className="truncate text-[11px] font-medium text-foreground">
                        {customer.nameEn}
                        {customer.phone ? ` · ${customer.phone}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomer(null);
                          setDeliveryCustomerSearch("");
                        }}
                        className="flex-none text-[10px] font-medium text-brand hover:underline"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={deliveryCustomerSearch}
                        onChange={(e) => setDeliveryCustomerSearch(e.target.value)}
                        placeholder="Search saved customer by name or phone…"
                        className="h-8 w-full rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
                      />
                      {deliveryCustomerSuggestions.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
                          {deliveryCustomerSuggestions.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setCustomer(c);
                                setDeliveryCustomerSearch("");
                              }}
                              className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] hover:bg-brand/5"
                            >
                              <span className="truncate font-medium text-foreground">
                                {c.nameEn}
                              </span>
                              <span className="ml-2 flex-none text-[10px] text-muted-foreground">
                                {c.type}
                                {c.phone ? ` · ${c.phone}` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              <input
                value={deliveryContactName}
                onChange={(e) => setDeliveryContactName(e.target.value)}
                placeholder="Contact name *"
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                value={deliveryContactMobile}
                onChange={(e) => setDeliveryContactMobile(e.target.value)}
                placeholder="Contact mobile *"
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                value={deliveryCity}
                onChange={(e) => setDeliveryCity(e.target.value)}
                placeholder="City *"
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                value={deliveryDistrict}
                onChange={(e) => setDeliveryDistrict(e.target.value)}
                placeholder="District"
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                value={deliveryStreet}
                onChange={(e) => setDeliveryStreet(e.target.value)}
                placeholder="Street"
                className="col-span-2 h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                className="h-8 rounded-md border border-black/10 bg-white px-2 outline-none focus:border-brand"
              />
              <select
                value={deliveryZoneId ?? ""}
                onChange={(e) => setDeliveryZoneId(e.target.value ? Number(e.target.value) : null)}
                className="h-8 rounded-md border border-black/10 bg-white px-1.5 outline-none focus:border-brand"
              >
                <option value="">Delivery zone (fee)…</option>
                {(deliveryZones ?? []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} — {z.fee.toFixed(0)} <SARIcon />
                  </option>
                ))}
              </select>
              <select
                value={deliveryDriverId ?? ""}
                onChange={(e) =>
                  setDeliveryDriverId(e.target.value ? Number(e.target.value) : null)
                }
                className="h-8 rounded-md border border-black/10 bg-white px-1.5 outline-none focus:border-brand"
              >
                <option value="">Driver (optional)…</option>
                {(deliveryDrivers ?? [])
                  .filter((d) => d.available)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
              <select
                value={deliveryVehicleId ?? ""}
                onChange={(e) =>
                  setDeliveryVehicleId(e.target.value ? Number(e.target.value) : null)
                }
                className="col-span-2 h-8 rounded-md border border-black/10 bg-white px-1.5 outline-none focus:border-brand"
              >
                <option value="">Vehicle (optional)…</option>
                {(deliveryVehicles ?? [])
                  .filter((v) => v.status === "Available")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registration} — {v.type}
                    </option>
                  ))}
              </select>
              <textarea
                value={deliveryInstructions}
                onChange={(e) => setDeliveryInstructions(e.target.value)}
                placeholder="Delivery instructions"
                rows={2}
                className="col-span-2 rounded-md border border-black/10 bg-white px-2 py-1.5 outline-none focus:border-brand"
              />
            </div>
            {autoDeliveryFee && (
              <p className="text-muted-foreground">
                Delivery fee (auto):{" "}
                <span className="font-medium text-foreground">
                  <CurrencyText value={money(autoDeliveryFee.amount)} />
                </span>
              </p>
            )}
            {!deliveryDetailsComplete && (
              <p className="text-warning">
                Contact name, mobile, city and promised date are required to charge.
              </p>
            )}
          </div>
        )}

        {/* Coupon / discount / custom fee controls — collapsed by default (see discountsPanelOpen)
            since most sales use none of them; auto-expanded once one actually applies. */}
        <div className="border-t border-black/5 bg-canvas text-xs">
          <button
            type="button"
            onClick={() => setDiscountsPanelOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left font-medium text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5" /> Coupon, discount & fees
              {hasActiveCouponDiscountFees && !showDiscountsPanel && (
                <span className="ml-1 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                  active
                </span>
              )}
            </span>
            {showDiscountsPanel ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <div className={`space-y-2 px-4 pb-2.5 ${showDiscountsPanel ? "" : "hidden"}`}>
          {appliedCoupon?.valid ? (
            <div className="flex items-center justify-between rounded-md bg-brand/10 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 font-medium text-brand">
                <Tag className="h-3.5 w-3.5" /> {appliedCoupon.code} — saves{" "}
                <CurrencyText value={money(couponAmount)} />
              </span>
              <button
                onClick={() => setAppliedCoupon(null)}
                className="text-brand hover:text-critical"
              >
                <X className="h-3.5 w-3.5" />
              </button>
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
                  : orderDiscountNeedsApproval && discountType === "Fixed"
                    ? "Fixed-amount discounts need supervisor approval."
                    : `Above your ${discountCeiling}% limit — needs supervisor approval${lineDiscountNeedsApproval ? " (an item discount)" : ""}.`}
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

          {priceOverrideNeedsApproval && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-warning">
              <span>
                {priceOverrideApprovalRequested
                  ? `Approval requested (#${priceOverrideApprovalId}) — ask a supervisor, then Charge again.`
                  : "Overriding an item's price needs supervisor approval."}
              </span>
              {!priceOverrideApprovalRequested && (
                <button
                  onClick={() => setPriceOverrideApprovalDialogOpen(true)}
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
            <button
              onClick={addCustomFee}
              className="h-8 rounded-md border border-black/10 bg-white px-2.5 text-xs font-medium hover:border-brand/40"
            >
              Add
            </button>
          </div>
          {customFees.map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md bg-white px-2.5 py-1"
            >
              <span className="text-foreground">{f.label}</span>
              <span className="flex items-center gap-1.5">
                <CurrencyText value={money(f.amount)} />
                <button
                  onClick={() => setCustomFees((fs) => fs.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-critical"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          ))}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-black/5 bg-canvas px-4 py-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal ({cart.length} lines)</span>
            <span>
              <CurrencyText value={money(subtotal)} />
            </span>
          </div>
          {totalCartWeight > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Total Weight</span>
              <span>{totalCartWeight.toFixed(1)} kg</span>
            </div>
          )}
          {contractorDiscount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5" />
                {contractorDiscountPct > 0 && !hasQuantityRuleDiscount
                  ? `Contractor discount ${contractorDiscountPct}%`
                  : "Pricing rule discount"}
              </span>
              <span>
                -<CurrencyText value={money(contractorDiscount)} />
              </span>
            </div>
          )}
          {tradeValueAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span className="flex items-center gap-1">
                <Percent className="h-3.5 w-3.5" /> Trade Value {tradeValuePct}%
              </span>
              <span>
                -<CurrencyText value={money(tradeValueAmount)} />
              </span>
            </div>
          )}
          {couponAmount + manualAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Coupon / manual discount</span>
              <span>
                -<CurrencyText value={money(couponAmount + manualAmount)} />
              </span>
            </div>
          )}
          {feesTotal > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Fees</span>
              <span>
                <CurrencyText value={money(feesTotal)} />
              </span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>VAT</span>
            <span>
              <CurrencyText value={money(vat)} />
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-black/10 pt-2">
            <span className="font-display text-base font-semibold text-foreground">Total</span>
            <span key={total} className="pos-pop font-display text-2xl font-bold text-brand">
              <CurrencyText value={money(Math.max(0, total))} />
            </span>
          </div>
          {/* BRD §4.3.3: a redeemed-points tender — not a discount, so it sits below Total rather
              than inside the subtotal/VAT stack above; Amount Due is what Charge actually asks for. */}
          {effectivePointsRedeemed > 0 && (
            <>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Gift className="h-3.5 w-3.5" /> Points redeemed
                </span>
                <span>
                  -<CurrencyText value={money(effectivePointsRedeemed)} />
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-black/10 pt-1.5">
                <span className="font-display text-sm font-semibold text-foreground">Amount Due</span>
                <span key={amountDue} className="pos-pop font-display text-xl font-bold text-brand">
                  <CurrencyText value={money(amountDue)} />
                </span>
              </div>
            </>
          )}
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
            disabled={cartIsEmpty || !deliveryDetailsComplete || hasUncapturedWeight || hasMissingSerials}
            title={
              hasUncapturedWeight ? "Capture a weight reading for every sold-by-weight line first."
                : hasMissingSerials ? "Enter a serial number for every unit on each serial-tracked line first."
                : undefined
            }
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:bg-brand/90 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand"
          >
            <ReceiptText className="h-4 w-4" /> Charge{" "}
            <CurrencyText value={money(amountDue)} />
          </button>
        </div>
      </aside>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        total={amountDue}
        onCharge={handleCharge}
        customer={customer}
      />
      {customer && loyaltyConfig && (
        <CheckoutRedeemDialog
          open={redeemDialogOpen}
          onOpenChange={setRedeemDialogOpen}
          customer={customer}
          loyaltyConfig={loyaltyConfig}
          total={total}
          currentRedeemed={effectivePointsRedeemed}
          onConfirm={setPointsRedeemed}
          onClear={() => setPointsRedeemed(0)}
        />
      )}
      <ReceiptDialog
        order={receiptOrder}
        terminalId={terminal?.id ?? null}
        onClose={() => setReceiptOrder(null)}
      />
      <BundleOverrideDialog
        bundle={overrideBundle}
        reason={overrideBundle && bundleEligibility(overrideBundle)}
        onClose={() => setOverrideBundle(null)}
        onConfirm={(email, pin) => {
          if (overrideBundle) addBundle(overrideBundle, { email, pin });
        }}
      />
      <RequestApprovalDialog
        open={approvalDialogOpen}
        onOpenChange={setApprovalDialogOpen}
        branchId={effectiveBranchId ?? null}
        defaultType="Discount"
        defaultAmount={manualAmount ? manualAmount.toFixed(2) : ""}
        defaultReason={
          orderDiscountNeedsApproval && discountType === "Fixed"
            ? `Fixed SAR ${manualValue.toFixed(2)} discount on this sale`
            : `${Math.max(manualValue, maxLineManualPct)}% discount requested — above my ${discountCeiling}% limit`
        }
        onCreated={(approval) => setDiscountApprovalId(approval.id)}
      />
      <RequestApprovalDialog
        open={creditApprovalDialogOpen}
        onOpenChange={setCreditApprovalDialogOpen}
        branchId={effectiveBranchId ?? null}
        defaultType="CreditOverride"
        defaultAmount={total ? total.toFixed(2) : ""}
        defaultReason={
          customer
            ? `${customer.nameEn}'s order would exceed their ${money(customer.creditLimit)} credit limit`
            : ""
        }
        onCreated={(approval) => setCreditApprovalId(approval.id)}
      />
      <RequestApprovalDialog
        open={priceOverrideApprovalDialogOpen}
        onOpenChange={setPriceOverrideApprovalDialogOpen}
        branchId={effectiveBranchId ?? null}
        defaultType="PriceOverride"
        defaultAmount={cart
          .filter((l) => l.manualUnitPrice != null)
          .reduce((s, l) => s + (l.manualUnitPrice ?? 0) * l.qty, 0)
          .toFixed(2)}
        defaultReason={`Price override on ${cart
          .filter((l) => l.manualUnitPrice != null)
          .map((l) => l.sku)
          .join(", ")}`}
        onCreated={(approval) => setPriceOverrideApprovalId(approval.id)}
      />

      <OpenShiftDialog open={openShiftDialogOpen} onOpenChange={setOpenShiftDialogOpen} />

      {/* Module 15 (BRD §10.2) extension: no open shift for this cashier yet — the screen itself
          stays visible (prices/stock are still readable) but every action is blocked until Open
          Shift succeeds, at which point useOpenShift's cache invalidation flips shiftLocked off
          automatically with no extra wiring here. */}
      {!locked && shiftLocked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="w-80 rounded-2xl bg-white p-6 text-center shadow-2xl">
            <p className="text-lg font-semibold text-foreground">Shift not started</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Open your shift on a register before ringing up sales — pick a terminal and count your
              opening float to get started.
            </p>
            <button
              onClick={() => setOpenShiftDialogOpen(true)}
              className="mt-4 w-full rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
            >
              Open Shift
            </button>
          </div>
        </div>
      )}

      {/* Module 15 (BRD §10.2): idle auto-lock overlay — the register stays exactly as it was; the
          cashier re-enters their PIN to resume. */}
      {locked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="w-80 rounded-2xl bg-white p-6 text-center shadow-2xl">
            <p className="text-lg font-semibold text-foreground">Register locked</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Locked after 3 minutes of inactivity. Enter your PIN to resume — the cart is
              untouched.
            </p>
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
