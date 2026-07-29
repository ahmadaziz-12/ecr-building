using EcrBuilding.Domain.Entities;

namespace EcrBuilding.Domain.Common;

/// <summary>
/// Checkout-time pricing-rule resolution — shared by OrdersController.Checkout and
/// QuotationsController.BuildLines so the two can never silently compute different discounts for
/// the same cart. Before this existed, the "larger of Trade Tier/loyalty-tier, per-SKU Quantity
/// threshold, per-SKU Promotional, manual" stack was hand-copied in both controllers (plus a third
/// and fourth copy in the frontend's PosCheckout.tsx/QuotationFormDialog.tsx live previews) — this
/// class is the one place that math lives for the backend.
/// Phase 2 additions (multi-tier pallet pricing, Buy-X-Get-Y, cart-level Trade Value threshold) are
/// OrdersController-only for now — Quotations keep their existing Trade Tier/Quantity/Promotional
/// support unchanged.
/// </summary>
public static class PricingEngine
{
    /// <summary>
    /// Per-SKU Quantity-threshold discount % — the larger of every matching active rule. A Quantity
    /// rule with PalletQty set is pallet-tier mode (a different mechanism, fixed unit price rather
    /// than a percentage) and is excluded here — see ResolvePalletSplit.
    /// </summary>
    public static decimal ResolveQuantityPct(IEnumerable<PricingRule> quantityRules, string sku, decimal qty) =>
        quantityRules
            .Where(r => r.PalletQty is null && (r.Sku == null || string.Equals(r.Sku, sku, StringComparison.OrdinalIgnoreCase)) && qty >= r.MinQuantity)
            .Select(r => r.Value).DefaultIfEmpty(0m).Max();

    /// <summary>Per-SKU Promotional discount % — the larger of every matching active rule.</summary>
    public static decimal ResolvePromoPct(IEnumerable<PricingRule> promoRules, string sku) =>
        promoRules.Where(r => r.Sku == null || string.Equals(r.Sku, sku, StringComparison.OrdinalIgnoreCase))
            .Select(r => r.Value).DefaultIfEmpty(0m).Max();

    /// <summary>
    /// The shared "larger of, never stacks" rule: Trade Tier/loyalty-tier, Quantity-threshold,
    /// Promotional, and a manual/cashier % all compete for the same line — the highest wins.
    /// </summary>
    // remnantDiscountPct (Cut Optimization/Remnants Management): an optional per-offcut discount set
    // on a Remnant to help move it — competes in the same "larger of, never stacks" group as
    // everything else here, 0 for every ordinary (non-remnant-sourced) line.
    public static decimal ResolveLineDiscountPct(decimal effectiveDiscountPct, decimal quantityPct, decimal promoPct, decimal manualLinePct, decimal remnantDiscountPct = 0m) =>
        Math.Max(Math.Max(Math.Max(Math.Max(effectiveDiscountPct, quantityPct), promoPct), manualLinePct), remnantDiscountPct);

    /// <summary>
    /// Multi-tier pallet pricing (BRD §5.1 Quantity Bundle): given a Quantity rule with PalletQty
    /// set, splits a line's stock-UOM quantity into the portion that qualifies for the rule's
    /// override unit price (whole multiples of PalletQty) and the remainder at normal price.
    /// 48 units on a 50-unit pallet → (0, 48); 50 → (50, 0); 100 → (100, 0); 105 → (100, 5).
    /// </summary>
    public static (decimal PalletUnits, decimal RemainderUnits) ResolvePalletSplit(PricingRule rule, decimal stockQty)
    {
        if (rule.PalletQty is not decimal palletQty || palletQty <= 0) return (0m, stockQty);
        var fullTiers = Math.Floor(stockQty / palletQty);
        var palletUnits = fullTiers * palletQty;
        return (palletUnits, stockQty - palletUnits);
    }

    /// <summary>
    /// Buy-X-Get-Y (BRD §5.1 Promotional Bundle): given a rule with BuyQty+FreeQty set, splits a
    /// line's stock-UOM quantity into paid and free portions. Every complete (BuyQty+FreeQty) group
    /// yields FreeQty free units; a partial trailing group stays entirely paid (no partial-free
    /// unit). Buy 10 Get 2 on 12 units → (10, 2); on 24 → (20, 4); on 15 → (13, 2).
    /// </summary>
    public static (decimal PaidUnits, decimal FreeUnits) ResolveBuyXGetYSplit(PricingRule rule, decimal stockQty)
    {
        if (rule.BuyQty is not decimal buyQty || rule.FreeQty is not decimal freeQty || buyQty <= 0 || freeQty <= 0)
        {
            return (stockQty, 0m);
        }
        var groupSize = buyQty + freeQty;
        var fullGroups = Math.Floor(stockQty / groupSize);
        var freeUnits = fullGroups * freeQty;
        return (stockQty - freeUnits, freeUnits);
    }

    /// <summary>
    /// Trade Value (BRD §5.1 Trade Value Bundle): a cart-total threshold % off the whole order for
    /// Contractor customers — distinct from the always-on flat Trade Tier %. Order-level, applied
    /// once against the cart subtotal rather than per line; the caller folds the result into the
    /// same discount layer as coupon/manual so VAT proration applies automatically. Returns 0 when
    /// no rule's threshold is met.
    /// </summary>
    public static decimal ResolveTradeValuePct(IEnumerable<PricingRule> tradeValueRules, decimal cartSubtotal) =>
        tradeValueRules.Where(r => r.MinCartTotal is not null && cartSubtotal >= r.MinCartTotal)
            .OrderByDescending(r => r.BranchId != null).ThenByDescending(r => r.Priority)
            .Select(r => r.Value).DefaultIfEmpty(0m).FirstOrDefault();
}
