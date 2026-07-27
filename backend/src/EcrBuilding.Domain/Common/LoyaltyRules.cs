using EcrBuilding.Domain.Entities;

namespace EcrBuilding.Domain.Common;

// Central place for the loyalty program's earn/redeem economics AND tier ladder — shared by
// OrdersController (earn + redeem-as-payment + tier discount/free-delivery at checkout),
// ReturnsController (reversal on approved returns), LoyaltyController (manual redeem/adjust/tier
// re-derivation), CustomersController (points-expiring-soon flag) and LoyaltyPointsExpiryService
// (the background sweep) so none of them hand-roll their own copy of these numbers.
// BRD §4.3.1-§4.3.4 — every value here is Settings-configurable (Category="Pos", Group="Loyalty"),
// loaded via LoyaltyConfigLoader.GetLoyaltyConfigAsync in the Api layer. Defaults match the BRD's
// own stated defaults exactly.
public readonly record struct LoyaltyConfig(
    decimal PointsPerSarEarned, decimal PointsPerSarRedeemed, int MinRedeemPoints, decimal MaxRedeemPctOfTotal,
    decimal SilverThreshold, decimal GoldThreshold, decimal PlatinumThreshold,
    decimal SilverMultiplier, decimal GoldMultiplier, decimal PlatinumMultiplier,
    decimal SilverDiscountPct, decimal GoldDiscountPct, decimal PlatinumDiscountPct,
    decimal FreeDeliveryMinOrderSar, decimal BirthdayBonusMultiplier, int PointsExpiryMonths)
{
    public static readonly LoyaltyConfig Default = new(
        PointsPerSarEarned: 1m, PointsPerSarRedeemed: 100m, MinRedeemPoints: 500, MaxRedeemPctOfTotal: 20m,
        SilverThreshold: 5_000m, GoldThreshold: 20_000m, PlatinumThreshold: 50_000m,
        SilverMultiplier: 1.5m, GoldMultiplier: 2m, PlatinumMultiplier: 3m,
        SilverDiscountPct: 5m, GoldDiscountPct: 10m, PlatinumDiscountPct: 15m,
        FreeDeliveryMinOrderSar: 500m, BirthdayBonusMultiplier: 2m, PointsExpiryMonths: 12);
}

public static class LoyaltyRules
{
    public static int PointsForSar(decimal sar, decimal pointsPerSarEarned) =>
        sar <= 0 ? 0 : (int)Math.Floor(sar * pointsPerSarEarned);
    public static decimal SarForPoints(int points, decimal pointsPerSarRedeemed) =>
        pointsPerSarRedeemed <= 0 ? 0 : points / pointsPerSarRedeemed;
    public static int PointsNeededForSar(decimal sar, decimal pointsPerSarRedeemed) =>
        sar <= 0 || pointsPerSarRedeemed <= 0 ? 0 : (int)Math.Ceiling(sar * pointsPerSarRedeemed);

    // BRD §4.3.3: minimum redemption threshold and maximum redemption as a % of the order total —
    // both configurable, checked only when the cashier actually offered a points redemption (points > 0).
    public static string? ValidateRedemption(int pointsToRedeem, decimal sarValue, decimal orderTotalSar, LoyaltyConfig config)
    {
        if (pointsToRedeem <= 0) return null;
        if (pointsToRedeem < config.MinRedeemPoints)
        {
            return $"Minimum redemption is {config.MinRedeemPoints} points ({SarForPoints(config.MinRedeemPoints, config.PointsPerSarRedeemed):F2} ر.س).";
        }
        var maxSar = Math.Round(orderTotalSar * config.MaxRedeemPctOfTotal / 100m, 2);
        if (sarValue > maxSar)
        {
            return $"Redemption cannot exceed {config.MaxRedeemPctOfTotal}% of the order total ({maxSar:F2} ر.س).";
        }
        return null;
    }

    // BRD §4.3.2: tiers qualify on CUMULATIVE SAR SPEND (ex-VAT merchandise), not points.
    public static LoyaltyTier TierForLifetimeSpend(decimal lifetimeSpendSar, LoyaltyConfig config) => lifetimeSpendSar switch
    {
        _ when lifetimeSpendSar >= config.PlatinumThreshold => LoyaltyTier.Platinum,
        _ when lifetimeSpendSar >= config.GoldThreshold => LoyaltyTier.Gold,
        _ when lifetimeSpendSar >= config.SilverThreshold => LoyaltyTier.Silver,
        _ => LoyaltyTier.Bronze,
    };

    // Null once a customer has reached the top tier — there's nothing further to work toward.
    // Value is the SAR spend threshold of the next tier (shown on receipts per BRD §4.3.1).
    public static decimal? NextTierSpendThreshold(decimal lifetimeSpendSar, LoyaltyConfig config)
    {
        if (lifetimeSpendSar < config.SilverThreshold) return config.SilverThreshold;
        if (lifetimeSpendSar < config.GoldThreshold) return config.GoldThreshold;
        if (lifetimeSpendSar < config.PlatinumThreshold) return config.PlatinumThreshold;
        return null;
    }

    // BRD §4.3.2 points multiplier: Bronze 1x, Silver/Gold/Platinum configurable (default 1.5x/2x/3x)
    // — applied to the eligible SAR before the points floor so a Silver 1.5x on 100 SAR earns 15
    // points, not 10.
    public static decimal TierPointsMultiplier(LoyaltyTier tier, LoyaltyConfig config) => tier switch
    {
        LoyaltyTier.Platinum => config.PlatinumMultiplier,
        LoyaltyTier.Gold => config.GoldMultiplier,
        LoyaltyTier.Silver => config.SilverMultiplier,
        _ => 1m,
    };

    // BRD §4.3.2 automatic tier discount at checkout (default Silver 5% / Gold 10% / Platinum 15%).
    // (The BRD scopes Silver's 5% to "select categories"; applied across all categories here —
    // tightening it to a category flag is a policy refinement, not a structural change.)
    public static decimal TierDiscountPct(LoyaltyTier tier, LoyaltyConfig config) => tier switch
    {
        LoyaltyTier.Platinum => config.PlatinumDiscountPct,
        LoyaltyTier.Gold => config.GoldDiscountPct,
        LoyaltyTier.Silver => config.SilverDiscountPct,
        _ => 0m,
    };

    public static bool QualifiesForFreeDelivery(LoyaltyTier tier, decimal merchandiseTotalSar, LoyaltyConfig config) =>
        tier >= LoyaltyTier.Silver && merchandiseTotalSar > config.FreeDeliveryMinOrderSar;

    // BRD §4.3.4 (Module 20): bonus points multiplier automatically applied during the customer's
    // birthday MONTH (the BRD's own granularity), stacking multiplicatively with the tier multiplier.
    public static bool IsBirthdayMonth(DateTime? dateOfBirth, DateTime now) =>
        dateOfBirth is not null && dateOfBirth.Value.Month == now.Month;

    // BRD §4.3.4: points expire after this long without a purchase; the POS warns the cashier one
    // month ahead so the customer can be told before they lapse.
    public static bool PointsExpired(DateTime? lastPurchaseAt, DateTime now, int expiryMonths) =>
        lastPurchaseAt is not null && lastPurchaseAt.Value <= now.AddMonths(-expiryMonths);

    public static bool PointsExpiringSoon(DateTime? lastPurchaseAt, DateTime now, int expiryMonths) =>
        lastPurchaseAt is not null && !PointsExpired(lastPurchaseAt, now, expiryMonths)
        && lastPurchaseAt.Value <= now.AddMonths(-(expiryMonths - 1));
}
