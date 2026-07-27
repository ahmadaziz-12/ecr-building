namespace EcrBuilding.Application.Loyalty;

public record LoyaltyTransactionDto(
    int Id, int CustomerId, string CustomerName, int? OrderId, string? OrderNo, int? BranchId, string? BranchName,
    string Type, int Points, string Description, string? CreatedByName, DateTime CreatedAt);

public record CustomerLoyaltyDto(
    int CustomerId, string CustomerName, bool LoyaltyEnrolled, int Points, decimal PointsValue,
    int LifetimePoints, string Tier, IReadOnlyList<LoyaltyTransactionDto> Recent);

public record RedeemPointsRequest(int CustomerId, int Points, string? Description);
public record AdjustPointsRequest(int CustomerId, int Points, string Description);

// BRD §4.3.1-§4.3.4: the FULL loyalty program configuration — earn/redeem economics, tier ladder
// (thresholds/multipliers/discounts), free delivery, birthday bonus and points expiry — all
// editable from the Loyalty Program page's "Program Settings" dialog.
public record LoyaltyProgramConfigDto(
    decimal PointsPerSarEarned, decimal PointsPerSarRedeemed, int MinRedeemPoints, decimal MaxRedeemPctOfTotal,
    decimal SilverThreshold, decimal GoldThreshold, decimal PlatinumThreshold,
    decimal SilverMultiplier, decimal GoldMultiplier, decimal PlatinumMultiplier,
    decimal SilverDiscountPct, decimal GoldDiscountPct, decimal PlatinumDiscountPct,
    decimal FreeDeliveryMinOrderSar, decimal BirthdayBonusMultiplier, int PointsExpiryMonths);
