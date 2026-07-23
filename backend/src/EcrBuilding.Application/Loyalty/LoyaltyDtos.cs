namespace EcrBuilding.Application.Loyalty;

public record LoyaltyTransactionDto(
    int Id, int CustomerId, string CustomerName, int? OrderId, string? OrderNo, int? BranchId, string? BranchName,
    string Type, int Points, string Description, string? CreatedByName, DateTime CreatedAt);

public record CustomerLoyaltyDto(
    int CustomerId, string CustomerName, bool LoyaltyEnrolled, int Points, decimal PointsValue,
    int LifetimePoints, string Tier, IReadOnlyList<LoyaltyTransactionDto> Recent);

public record RedeemPointsRequest(int CustomerId, int Points, string? Description);
public record AdjustPointsRequest(int CustomerId, int Points, string Description);
