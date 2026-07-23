using EcrBuilding.Domain.Entities;

namespace EcrBuilding.Domain.Common;

// Central place for the loyalty program's earn/redeem economics and tier ladder — shared by
// OrdersController (earn + redeem-as-payment at checkout), ReturnsController (reversal on
// approved returns) and LoyaltyController (manual redeem/adjust) so all three call sites stay
// in sync instead of each hand-rolling the conversion rate.
public static class LoyaltyRules
{
    public const decimal SarPerPointEarned = 10m; // 1 point earned per 10 SAR of non-loyalty tender
    public const decimal SarValuePerPoint = 0.10m; // 1 point redeems for 0.10 SAR

    public static int PointsForSar(decimal sar) => sar <= 0 ? 0 : (int)Math.Floor(sar / SarPerPointEarned);
    public static decimal SarForPoints(int points) => points * SarValuePerPoint;
    public static int PointsNeededForSar(decimal sar) => sar <= 0 ? 0 : (int)Math.Ceiling(sar / SarValuePerPoint);

    public static LoyaltyTier TierForLifetimePoints(int lifetimePoints) => lifetimePoints switch
    {
        >= 5000 => LoyaltyTier.Platinum,
        >= 2000 => LoyaltyTier.Gold,
        >= 500 => LoyaltyTier.Silver,
        _ => LoyaltyTier.Standard,
    };
}
