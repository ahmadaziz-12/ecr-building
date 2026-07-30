import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Calendar,
  Check,
  ChevronDown,
  Gift,
  Handshake,
  Layers,
  Percent,
  Sparkles,
  Tag,
  Ticket,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBranches } from "@/lib/api/admin";
import { useProducts } from "@/lib/api/catalog";
import { CurrencyText, SARIcon } from "@/lib/buildpos/currency";
import {
  useCreatePricingRule,
  useUpdatePricingRule,
  type PricingRuleDto,
  type UpsertPricingRuleRequest,
} from "@/lib/api/pos";

// Pallet/BuyXGetY/TradeValue (BRD §5.1 Phase 2) — see backend PricingEngine (Domain/Common) and
// src/lib/buildpos/pricing.ts for how each is actually applied at checkout.
type RuleKind =
  | "Trade Tier"
  | "Quantity"
  | "Pallet"
  | "Buy X Get Y"
  | "Trade Value"
  | "Coupon"
  | "Promotional"
  | "Manual";
// "Manual" covers Bundle/Fee rows — reference-only today (Bundle pricing really lives on
// /stock/bundles, restocking fees in the returns workflow) — kept available so the grid can still
// record them, but visually set apart from the automatic types. Promo used to live here too
// ("informational, staff apply the benefit manually") — it's now its own real auto-applied kind
// (BRD §7 CR-040), see "Promotional" above.
type ManualType = "Bundle" | "Fee";

const KIND_META: Record<RuleKind, { icon: typeof Percent; title: string; blurb: string }> = {
  "Trade Tier": {
    icon: Handshake,
    title: "Trade Tier",
    blurb: "Automatic % off for contractor accounts",
  },
  Quantity: {
    icon: Boxes,
    title: "Quantity Discount",
    blurb: "Auto-applies once a cart line hits a threshold",
  },
  Pallet: {
    icon: Layers,
    title: "Pallet Pricing",
    blurb: "Repeating tier: N units at a fixed unit price",
  },
  "Buy X Get Y": { icon: Gift, title: "Buy X Get Y", blurb: "Every N bought gives M free units" },
  "Trade Value": {
    icon: Wallet,
    title: "Trade Value",
    blurb: "Contractor cart crosses a SAR threshold",
  },
  Coupon: { icon: Ticket, title: "Coupon Code", blurb: "Customer enters a code at checkout" },
  Promotional: {
    icon: Tag,
    title: "Promotional",
    blurb: "Auto-applies within a date range — no code needed",
  },
  Manual: {
    icon: Sparkles,
    title: "Other / Manual",
    blurb: "Bundle or fee — recorded for reference",
  },
};

const inputClass =
  "h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";
const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function CreatePricingRuleDialog({
  open,
  onOpenChange,
  editingRule,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingRule?: PricingRuleDto | null;
}) {
  const { data: branches } = useBranches(open);
  const { data: products } = useProducts(open);
  const createRule = useCreatePricingRule();
  const updateRule = useUpdatePricingRule();
  const isEditing = !!editingRule;

  const [kind, setKind] = useState<RuleKind>("Trade Tier");
  const [manualType, setManualType] = useState<ManualType>("Bundle");
  const [name, setName] = useState("");
  const [valuePct, setValuePct] = useState("");
  const [sku, setSku] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [palletQty, setPalletQty] = useState("");
  const [palletPrice, setPalletPrice] = useState("");
  const [buyQty, setBuyQty] = useState("");
  const [freeQty, setFreeQty] = useState("");
  const [minCartTotal, setMinCartTotal] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponKind, setCouponKind] = useState<"Percentage" | "Fixed">("Percentage");
  const [couponValue, setCouponValue] = useState("");
  const [manualScope, setManualScope] = useState("");
  const [manualCondition, setManualCondition] = useState("");
  const [manualAction, setManualAction] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [branchName, setBranchName] = useState("All Branches");
  const [priority, setPriority] = useState("10");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setKind("Trade Tier");
    setManualType("Bundle");
    setName("");
    setValuePct("");
    setSku("");
    setProductSearch("");
    setMinQuantity("");
    setPalletQty("");
    setPalletPrice("");
    setBuyQty("");
    setFreeQty("");
    setMinCartTotal("");
    setCouponCode("");
    setCouponKind("Percentage");
    setCouponValue("");
    setManualScope("");
    setManualCondition("");
    setManualAction("");
    setAdvancedOpen(false);
    setBranchName("All Branches");
    setPriority("10");
    setValidFrom("");
    setValidUntil("");
  }

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  }

  // Pre-fills every field from the rule being edited — re-runs whenever a different row's "Edit" is
  // clicked while the dialog is already open, not just on the open transition.
  useEffect(() => {
    if (!open || !editingRule) return;
    const r = editingRule;
    const autoKinds = [
      "Trade Tier",
      "Quantity",
      "Pallet",
      "Buy X Get Y",
      "Trade Value",
      "Coupon",
      "Promotional",
    ];
    if ((autoKinds as string[]).includes(r.type)) {
      setKind(r.type as RuleKind);
    } else {
      setKind("Manual");
      setManualType(
        (["Bundle", "Fee"] as const).includes(r.type as ManualType)
          ? (r.type as ManualType)
          : "Bundle",
      );
    }
    setName(r.name);
    setValuePct(
      r.type === "Trade Tier" ||
        r.type === "Quantity" ||
        r.type === "Promotional" ||
        r.type === "Trade Value"
        ? String(r.value)
        : "",
    );
    setSku(
      r.type === "Quantity" ||
        r.type === "Promotional" ||
        r.type === "Pallet" ||
        r.type === "Buy X Get Y"
        ? (r.sku ?? "")
        : "",
    );
    setProductSearch("");
    setMinQuantity(r.type === "Quantity" && r.minQuantity != null ? String(r.minQuantity) : "");
    setPalletQty(r.type === "Pallet" && r.palletQty != null ? String(r.palletQty) : "");
    setPalletPrice(r.type === "Pallet" ? String(r.value) : "");
    setBuyQty(r.type === "Buy X Get Y" && r.buyQty != null ? String(r.buyQty) : "");
    setFreeQty(r.type === "Buy X Get Y" && r.freeQty != null ? String(r.freeQty) : "");
    setMinCartTotal(
      r.type === "Trade Value" && r.minCartTotal != null ? String(r.minCartTotal) : "",
    );
    setCouponCode(r.type === "Coupon" ? (r.code ?? "") : "");
    setCouponKind(r.discountType === "Fixed" ? "Fixed" : "Percentage");
    setCouponValue(r.type === "Coupon" ? String(r.value) : "");
    const isManual = !autoKinds.includes(r.type);
    setManualScope(isManual ? r.scope : "");
    setManualCondition(isManual ? r.condition : "");
    setManualAction(isManual ? r.action : "");
    setBranchName(r.branchName ?? "All Branches");
    setPriority(String(r.priority));
    setValidFrom(r.validFrom ? r.validFrom.slice(0, 10) : "");
    setValidUntil(r.validUntil ? r.validUntil.slice(0, 10) : "");
  }, [open, editingRule]);

  const product = products?.find((p) => p.sku === sku);

  // Substring match on SKU/name — same pattern as the POS checkout customer search — so staff can
  // type instead of scrolling a hundred-SKU list to find a product.
  const productSuggestions = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (term.length < 1) return [];
    return (products ?? [])
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(term) ||
          p.nameEn.toLowerCase().includes(term) ||
          (p.nameAr ?? "").toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [productSearch, products]);

  // What this rule actually does, in plain language — shown live so the person creating it can
  // check their own work before saving, instead of decoding a "-8%" / ">= 50 bags" string later.
  const preview: string | null = (() => {
    if (kind === "Trade Tier") {
      const pct = Number(valuePct);
      if (!pct) return null;
      return `Every Contractor customer automatically gets ${pct}% off${branchName === "All Branches" ? ", at every branch" : ` at ${branchName}`}.`;
    }
    if (kind === "Quantity") {
      const pct = Number(valuePct);
      const qty = Number(minQuantity);
      if (!pct || !qty) return null;
      return `Once a customer buys ${qty}+ units of ${sku ? `${sku}${product ? ` (${product.nameEn})` : ""}` : "any product"} in one line, they automatically get ${pct}% off that line.`;
    }
    if (kind === "Pallet") {
      const tierQty = Number(palletQty);
      const price = Number(palletPrice);
      if (!tierQty || !price) return null;
      return `Every ${tierQty} units of ${sku ? `${sku}${product ? ` (${product.nameEn})` : ""}` : "any product"} bought together are priced at ${price} ر.س each — a partial remainder stays at the normal price.`;
    }
    if (kind === "Buy X Get Y") {
      const b = Number(buyQty);
      const f = Number(freeQty);
      if (!b || !f) return null;
      return `Buy ${b} of ${sku ? `${sku}${product ? ` (${product.nameEn})` : ""}` : "any product"}, get ${f} free — every complete group of ${b + f} units.`;
    }
    if (kind === "Trade Value") {
      const threshold = Number(minCartTotal);
      const pct = Number(valuePct);
      if (!threshold || !pct) return null;
      return `Once a Contractor customer's cart reaches ${threshold} ر.س, they automatically get ${pct}% off the whole order.`;
    }
    if (kind === "Coupon") {
      const val = Number(couponValue);
      if (!couponCode || !val) return null;
      return `A customer who enters code "${couponCode.toUpperCase()}" at checkout gets ${couponKind === "Percentage" ? `${val}% off their order` : `${val} ر.س off their order`}.`;
    }
    if (kind === "Promotional") {
      const pct = Number(valuePct);
      if (!pct) return null;
      const window =
        validFrom && validUntil
          ? ` from ${validFrom} to ${validUntil}`
          : validUntil
            ? ` through ${validUntil}`
            : validFrom
              ? ` starting ${validFrom}`
              : "";
      return `Every sale of ${sku ? `${sku}${product ? ` (${product.nameEn})` : ""}` : "any product"} automatically gets ${pct}% off${window} — no code needed.`;
    }
    if (!manualScope && !manualCondition && !manualAction) return null;
    return `Recorded for staff reference — ${[manualScope, manualCondition, manualAction].filter(Boolean).join(" · ")}. This type isn't auto-applied at checkout yet.`;
  })();

  const canSave =
    !saving &&
    !!name.trim() &&
    (kind === "Trade Tier"
      ? Number(valuePct) > 0
      : kind === "Quantity"
        ? Number(valuePct) > 0 && Number(minQuantity) > 0
        : kind === "Pallet"
          ? Number(palletQty) > 0 && Number(palletPrice) > 0
          : kind === "Buy X Get Y"
            ? Number(buyQty) > 0 && Number(freeQty) > 0
            : kind === "Trade Value"
              ? Number(minCartTotal) > 0 && Number(valuePct) > 0
              : kind === "Coupon"
                ? !!couponCode.trim() && Number(couponValue) > 0
                : kind === "Promotional"
                  ? Number(valuePct) > 0
                  : !!manualAction.trim());

  async function handleSave() {
    const branch =
      branchName !== "All Branches" ? branches?.find((b) => b.nameEn === branchName) : undefined;
    const base = {
      name: name.trim(),
      priority: Number(priority) || 10,
      validFrom: validFrom || null,
      validUntil: validUntil || null,
      branchId: branch?.id ?? null,
    };

    let request: UpsertPricingRuleRequest;
    if (kind === "Trade Tier") {
      const pct = Number(valuePct);
      request = {
        ...base,
        type: "Trade Tier",
        scope: "Contractor customers",
        condition: "Any",
        action: `-${pct}% list`,
        code: null,
        discountType: "Percentage",
        value: pct,
      };
    } else if (kind === "Quantity") {
      const pct = Number(valuePct);
      const qty = Number(minQuantity);
      request = {
        ...base,
        type: "Quantity",
        scope: sku ? `SKU: ${sku}` : "All products",
        condition: `>= ${qty} units`,
        action: `-${pct}%`,
        code: null,
        discountType: "Percentage",
        value: pct,
        minQuantity: qty,
        sku: sku || null,
      };
    } else if (kind === "Pallet") {
      const tierQty = Number(palletQty);
      const price = Number(palletPrice);
      request = {
        ...base,
        type: "Quantity",
        scope: sku ? `SKU: ${sku}` : "All products",
        condition: `Every ${tierQty} units`,
        action: `${price} ر.س/unit`,
        code: null,
        discountType: "FixedUnitPrice",
        value: price,
        palletQty: tierQty,
        sku: sku || null,
      };
    } else if (kind === "Buy X Get Y") {
      const b = Number(buyQty);
      const f = Number(freeQty);
      request = {
        ...base,
        type: "Buy X Get Y",
        scope: sku ? `SKU: ${sku}` : "All products",
        condition: `Buy ${b}`,
        action: `Get ${f} free`,
        code: null,
        discountType: "Percentage",
        value: 0,
        buyQty: b,
        freeQty: f,
        sku: sku || null,
      };
    } else if (kind === "Trade Value") {
      const threshold = Number(minCartTotal);
      const pct = Number(valuePct);
      request = {
        ...base,
        type: "Trade Value",
        scope: "Contractor customers",
        condition: `Cart >= ${threshold} ر.س`,
        action: `-${pct}% order`,
        code: null,
        discountType: "Percentage",
        value: pct,
        minCartTotal: threshold,
      };
    } else if (kind === "Coupon") {
      const val = Number(couponValue);
      request = {
        ...base,
        type: "Coupon",
        scope: branchName === "All Branches" ? "All branches" : branchName,
        condition: `Code: ${couponCode.toUpperCase()}`,
        action: couponKind === "Percentage" ? `${val}% off` : `${val} ر.س off`,
        code: couponCode.toUpperCase(),
        discountType: couponKind,
        value: val,
      };
    } else if (kind === "Promotional") {
      const pct = Number(valuePct);
      request = {
        ...base,
        type: "Promotional",
        scope: sku ? `SKU: ${sku}` : "All products",
        condition:
          validFrom || validUntil
            ? `${validFrom || "Now"} → ${validUntil || "No end date"}`
            : "Active immediately",
        action: `-${pct}%`,
        code: null,
        discountType: "Percentage",
        value: pct,
        sku: sku || null,
      };
    } else {
      request = {
        ...base,
        type: manualType,
        scope: manualScope || "—",
        condition: manualCondition || "Any",
        action: manualAction,
        code: null,
        discountType: "Percentage",
        value: 0,
      };
    }

    setSaving(true);
    try {
      if (isEditing && editingRule) {
        await updateRule.mutateAsync({ id: editingRule.id, request });
        toast.success(
          "Pricing rule updated",
          editingRule.status === "Active"
            ? { description: "It's back to Pending Approval — a manager needs to re-activate it." }
            : undefined,
        );
      } else {
        await createRule.mutateAsync(request);
        toast.success("Pricing rule created", {
          description: "Sent for manager approval before it goes live.",
        });
      }
      handleClose(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Could not ${isEditing ? "update" : "create"} the rule — check the details and try again.`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl overflow-hidden p-0 sm:rounded-2xl">
        <div className="flex max-h-[85vh] flex-col">
          {/* Close button comes from DialogContent — see the note in FlowDialog. */}
          <div className="flex items-start justify-between gap-3 border-b border-black/5 py-4 ps-6 pe-12">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                Finance · Pricing
              </p>
              <h2 className="font-display text-lg font-bold text-foreground">
                {isEditing ? "Edit Pricing Rule" : "Create Pricing Rule"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isEditing
                  ? "Update the terms below — the form adjusts to match the rule's kind."
                  : "Pick what kind of discount this is — the form adjusts to match."}
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Type picker — 7 automatic types front and center, "manual" set apart */}
            <div className="ui-card-grid">
              {(
                [
                  "Trade Tier",
                  "Quantity",
                  "Pallet",
                  "Buy X Get Y",
                  "Trade Value",
                  "Coupon",
                  "Promotional",
                ] as const
              ).map((k) => {
                const meta = KIND_META[k];
                const Icon = meta.icon;
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-brand bg-brand/5 ring-2 ring-brand/15"
                        : "border-black/10 bg-white hover:border-brand/30"
                    }`}
                  >
                    <div
                      className={`mb-2 grid h-8 w-8 place-items-center rounded-lg ${active ? "bg-brand text-brand-foreground" : "bg-canvas text-muted-foreground"}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{meta.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {meta.blurb}
                    </p>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setKind(kind === "Manual" ? "Trade Tier" : "Manual")}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                kind === "Manual"
                  ? "border-brand bg-brand/5"
                  : "border-dashed border-black/15 text-muted-foreground hover:border-brand/30"
              }`}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" /> Other rule type (Bundle, Restocking Fee) —
                recorded for reference only
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition ${kind === "Manual" ? "rotate-180" : ""}`}
              />
            </button>

            {/* Name — common to every type */}
            <div>
              <label className={labelClass}>Rule name</label>
              <input
                className={inputClass}
                placeholder={
                  kind === "Trade Tier"
                    ? "e.g. Contractor Trade Price"
                    : kind === "Quantity"
                      ? "e.g. Cement Quantity Discount"
                      : kind === "Pallet"
                        ? "e.g. Cement Pallet Deal"
                        : kind === "Buy X Get Y"
                          ? "e.g. Buy 10 Get 2 Cement"
                          : kind === "Trade Value"
                            ? "e.g. Contractor Bulk Order Discount"
                            : kind === "Coupon"
                              ? "e.g. Ramadan Promo 2026"
                              : "e.g. Basement Waterproof Kit"
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {kind === "Trade Tier" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4">
                <label className={labelClass}>Discount for every Contractor account</label>
                <div className="relative w-40">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    className={`${inputClass} pr-8`}
                    placeholder="12"
                    value={valuePct}
                    onChange={(e) => setValuePct(e.target.value)}
                  />
                  <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Applies automatically at checkout to any customer whose account is set to
                  "Contractor" — no manual action needed.
                </p>
              </div>
            )}

            {kind === "Quantity" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <label className={labelClass}>Product (optional)</label>
                    {sku ? (
                      <div className={`${inputClass} flex items-center justify-between gap-2`}>
                        <span className="truncate">
                          {sku}
                          {product ? ` — ${product.nameEn}` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSku("");
                            setProductSearch("");
                          }}
                          className="grid h-5 w-5 flex-none place-items-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <input
                        className={inputClass}
                        placeholder="Any product — search SKU or name"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                    )}
                    {!sku && productSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
                        {productSuggestions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSku(p.sku);
                              setProductSearch("");
                            }}
                            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-brand/5"
                          >
                            <span className="truncate font-medium text-foreground">
                              {p.sku} — {p.nameEn}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Minimum quantity</label>
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      placeholder="50"
                      value={minQuantity}
                      onChange={(e) => setMinQuantity(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Discount once that quantity is reached</label>
                  <div className="relative w-40">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className={`${inputClass} pr-8`}
                      placeholder="8"
                      value={valuePct}
                      onChange={(e) => setValuePct(e.target.value)}
                    />
                    <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </div>
            )}

            {kind === "Pallet" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <label className={labelClass}>Product (optional)</label>
                    {sku ? (
                      <div className={`${inputClass} flex items-center justify-between gap-2`}>
                        <span className="truncate">
                          {sku}
                          {product ? ` — ${product.nameEn}` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSku("");
                            setProductSearch("");
                          }}
                          className="grid h-5 w-5 flex-none place-items-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <input
                        className={inputClass}
                        placeholder="Any product — search SKU or name"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                    )}
                    {!sku && productSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
                        {productSuggestions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSku(p.sku);
                              setProductSearch("");
                            }}
                            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-brand/5"
                          >
                            <span className="truncate font-medium text-foreground">
                              {p.sku} — {p.nameEn}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Tier size (units per pallet)</label>
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      placeholder="50"
                      value={palletQty}
                      onChange={(e) => setPalletQty(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>
                    Price per unit within a full tier (<SARIcon />)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="h-11 w-40 rounded-xl border border-black/10 bg-white px-3.5 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                    placeholder="26.00"
                    value={palletPrice}
                    onChange={(e) => setPalletPrice(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Every complete multiple of the tier size is priced at this rate; a partial
                  remainder stays at the normal price (e.g. 105 units on a 50-unit tier = 100 at the
                  pallet rate + 5 normal).
                </p>
              </div>
            )}

            {kind === "Buy X Get Y" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4 space-y-3">
                <div className="relative">
                  <label className={labelClass}>Product (optional)</label>
                  {sku ? (
                    <div className={`${inputClass} flex items-center justify-between gap-2`}>
                      <span className="truncate">
                        {sku}
                        {product ? ` — ${product.nameEn}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSku("");
                          setProductSearch("");
                        }}
                        className="grid h-5 w-5 flex-none place-items-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <input
                      className={inputClass}
                      placeholder="Any product — search SKU or name"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  )}
                  {!sku && productSuggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
                      {productSuggestions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSku(p.sku);
                            setProductSearch("");
                          }}
                          className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-brand/5"
                        >
                          <span className="truncate font-medium text-foreground">
                            {p.sku} — {p.nameEn}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Buy quantity</label>
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      placeholder="10"
                      value={buyQty}
                      onChange={(e) => setBuyQty(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Free quantity</label>
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      placeholder="2"
                      value={freeQty}
                      onChange={(e) => setFreeQty(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  A partial trailing group stays entirely paid — no partial-free unit.
                </p>
              </div>
            )}

            {kind === "Trade Value" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>
                      Cart total threshold (<SARIcon />)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className={inputClass}
                      placeholder="5000"
                      value={minCartTotal}
                      onChange={(e) => setMinCartTotal(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Discount once reached</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        className={`${inputClass} pr-8`}
                        placeholder="10"
                        value={valuePct}
                        onChange={(e) => setValuePct(e.target.value)}
                      />
                      <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Applies to Contractor accounts only, once their cart's running total crosses the
                  threshold — distinct from the always-on Trade Tier %.
                </p>
              </div>
            )}

            {kind === "Coupon" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4 space-y-3">
                <div>
                  <label className={labelClass}>Coupon code</label>
                  <input
                    className={`${inputClass} font-mono uppercase tracking-wider`}
                    placeholder="SAVE20"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Discount type</label>
                    <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-black/10 bg-white p-1">
                      {(["Percentage", "Fixed"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setCouponKind(t)}
                          className={`h-9 rounded-lg text-xs font-semibold transition ${
                            couponKind === t
                              ? "bg-brand text-brand-foreground"
                              : "text-muted-foreground hover:bg-canvas"
                          }`}
                        >
                          {t === "Percentage" ? "% Off" : "SAR Off"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>
                      {couponKind === "Percentage" ? (
                        <>Percent off</>
                      ) : (
                        <>
                          Amount off (<SARIcon />)
                        </>
                      )}
                    </label>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      placeholder={couponKind === "Percentage" ? "10" : "20"}
                      value={couponValue}
                      onChange={(e) => setCouponValue(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {kind === "Promotional" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <label className={labelClass}>Product (optional)</label>
                    {sku ? (
                      <div className={`${inputClass} flex items-center justify-between gap-2`}>
                        <span className="truncate">
                          {sku}
                          {product ? ` — ${product.nameEn}` : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSku("");
                            setProductSearch("");
                          }}
                          className="grid h-5 w-5 flex-none place-items-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <input
                        className={inputClass}
                        placeholder="Any product — search SKU or name"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                    )}
                    {!sku && productSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-sm">
                        {productSuggestions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSku(p.sku);
                              setProductSearch("");
                            }}
                            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-brand/5"
                          >
                            <span className="truncate font-medium text-foreground">
                              {p.sku} — {p.nameEn}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Discount %</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        className={`${inputClass} pr-8`}
                        placeholder="15"
                        value={valuePct}
                        onChange={(e) => setValuePct(e.target.value)}
                      />
                      <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Starts</label>
                    <div className="relative">
                      <input
                        type="date"
                        className={`${inputClass} pr-8`}
                        value={validFrom}
                        onChange={(e) => setValidFrom(e.target.value)}
                      />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Ends</label>
                    <div className="relative">
                      <input
                        type="date"
                        className={`${inputClass} pr-8`}
                        value={validUntil}
                        onChange={(e) => setValidUntil(e.target.value)}
                      />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Leave both dates blank to start immediately with no expiry. Unlike Coupon, no code
                  is needed — it discounts automatically within the window.
                </p>
              </div>
            )}

            {kind === "Manual" && (
              <div className="rounded-xl border border-black/5 bg-canvas/50 p-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(["Bundle", "Fee"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setManualType(t)}
                      className={`h-9 rounded-lg border text-xs font-semibold transition ${
                        manualType === t
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-black/10 bg-white text-muted-foreground hover:border-brand/30"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div>
                  <label className={labelClass}>Applies to (scope)</label>
                  <input
                    className={inputClass}
                    placeholder="e.g. Waterproofing kit"
                    value={manualScope}
                    onChange={(e) => setManualScope(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Condition</label>
                  <input
                    className={inputClass}
                    placeholder="e.g. Cart matches 80%"
                    value={manualCondition}
                    onChange={(e) => setManualCondition(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>What it gives</label>
                  <input
                    className={inputClass}
                    placeholder="e.g. 150 off"
                    value={manualAction}
                    onChange={(e) => setManualAction(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {manualType === "Bundle"
                    ? "Real bundle pricing is set up on Stock → Bundles — this row just cross-references it here for reporting."
                    : "Restocking fees are applied during a Surplus Return — this row records the policy for staff to see."}
                </p>
              </div>
            )}

            {/* Live preview */}
            {preview && (
              <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-3.5">
                <Check className="mt-0.5 h-4 w-4 flex-none text-success" />
                <p className="text-sm text-foreground/90">
                  <CurrencyText value={preview} />
                </p>
              </div>
            )}

            {/* Advanced (branch / priority / valid until) — collapsed by default to keep this simple */}
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <span>Advanced (branch, priority, expiry)</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition ${advancedOpen ? "rotate-180" : ""}`}
              />
            </button>
            {advancedOpen && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-black/5 bg-canvas/40 p-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Branch</label>
                  <select
                    className={inputClass}
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                  >
                    <option value="All Branches">All Branches</option>
                    {branches?.map((b) => (
                      <option key={b.id} value={b.nameEn}>
                        {b.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Priority</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Valid until</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-white px-6 py-3">
            <p className="text-[11px] text-muted-foreground">
              {isEditing
                ? editingRule?.status === "Active"
                  ? "This rule is live — saving sends it back for manager approval before changes take effect."
                  : "Changes are saved immediately; the rule still needs manager sign-off to go live."
                : "New rules need a manager's sign-off before they go live."}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!canSave}
                className="gap-1 bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Check className="h-4 w-4" />{" "}
                {saving
                  ? isEditing
                    ? "Saving…"
                    : "Creating…"
                  : isEditing
                    ? "Save Changes"
                    : "Create Rule"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
