import type { PricingRuleDto } from "@/lib/api/pos";

// Mirrors backend PricingEngine (backend/src/EcrBuilding.Domain/Common/PricingEngine.cs) exactly —
// see that file for the full rationale. This is the one place the frontend's live "what will this
// cost" preview math lives; PosCheckout.tsx and QuotationFormDialog.tsx both call into it instead
// of each keeping their own copy of the same "larger of, never stacks" stack (previously true, and
// a real source of drift risk between what the POS/Quotation screen shows and what checkout charges).

/** Per-SKU Quantity-threshold discount % — the larger of every matching rule. A rule with
 *  palletQty set is pallet-tier mode (a different mechanism), excluded here. */
export function resolveQuantityPct(
  quantityRules: PricingRuleDto[],
  sku: string,
  qty: number,
): number {
  return quantityRules
    .filter(
      (r) =>
        r.palletQty == null &&
        (!r.sku || r.sku.toUpperCase() === sku.toUpperCase()) &&
        qty >= (r.minQuantity ?? Infinity),
    )
    .reduce((max, r) => Math.max(max, r.value), 0);
}

/** Per-SKU Promotional discount % — the larger of every matching rule. */
export function resolvePromoPct(promoRules: PricingRuleDto[], sku: string): number {
  return promoRules
    .filter((r) => !r.sku || r.sku.toUpperCase() === sku.toUpperCase())
    .reduce((max, r) => Math.max(max, r.value), 0);
}

/** The shared "larger of, never stacks" rule — Trade Tier/loyalty-tier, Quantity-threshold,
 *  Promotional, and a manual/cashier % all compete for the same line; the highest wins. */
export function resolveLineDiscountPct(
  effectiveDiscountPct: number,
  quantityPct: number,
  promoPct: number,
  manualLinePct: number,
): number {
  return Math.max(Math.max(Math.max(effectiveDiscountPct, quantityPct), promoPct), manualLinePct);
}

// --- Phase 2 (POS-only — Quotations don't support these types yet) ---

/** Multi-tier pallet pricing: splits a stock-UOM quantity into the portion at the rule's override
 *  unit price (whole multiples of palletQty) and the remainder at normal price. */
export function resolvePalletSplit(
  rule: PricingRuleDto,
  stockQty: number,
): { palletUnits: number; remainderUnits: number } {
  const palletQty = rule.palletQty;
  if (!palletQty || palletQty <= 0) return { palletUnits: 0, remainderUnits: stockQty };
  const fullTiers = Math.floor(stockQty / palletQty);
  const palletUnits = fullTiers * palletQty;
  return { palletUnits, remainderUnits: stockQty - palletUnits };
}

/** Buy-X-Get-Y: every complete (buyQty + freeQty) group yields freeQty free units; a partial
 *  trailing group stays entirely paid. */
export function resolveBuyXGetYSplit(
  rule: PricingRuleDto,
  stockQty: number,
): { paidUnits: number; freeUnits: number } {
  const { buyQty, freeQty } = rule;
  if (!buyQty || !freeQty || buyQty <= 0 || freeQty <= 0)
    return { paidUnits: stockQty, freeUnits: 0 };
  const groupSize = buyQty + freeQty;
  const fullGroups = Math.floor(stockQty / groupSize);
  const freeUnits = fullGroups * freeQty;
  return { paidUnits: stockQty - freeUnits, freeUnits };
}

/** Trade Value: cart-subtotal threshold % off the whole order for Contractor customers — distinct
 *  from the always-on flat Trade Tier %. Returns 0 when no rule's threshold is met. */
export function resolveTradeValuePct(
  tradeValueRules: PricingRuleDto[],
  cartSubtotal: number,
): number {
  const matches = tradeValueRules
    .filter((r) => r.minCartTotal != null && cartSubtotal >= r.minCartTotal)
    .sort(
      (a, b) => Number(b.branchId != null) - Number(a.branchId != null) || b.priority - a.priority,
    );
  return matches[0]?.value ?? 0;
}
