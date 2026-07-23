using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class Plan : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public decimal MonthlyPrice { get; set; }
    public decimal YearlyPrice { get; set; }
    public int MaxBranches { get; set; }
    public int MaxTerminals { get; set; }
    public int MaxUsers { get; set; }
    public int MaxSkus { get; set; }
    public string FeaturesJson { get; set; } = "[]";
    public EntityStatus Status { get; set; } = EntityStatus.Active;
}

public enum BillingCycle
{
    Monthly = 0,
    Yearly = 1
}

public class CompanySubscription : BaseEntity
{
    public int PlanId { get; set; }
    public Plan? Plan { get; set; }
    public BillingCycle BillingCycle { get; set; } = BillingCycle.Monthly;
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime RenewsAt { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;
}

public class PlanUsageEntitlement : BaseEntity
{
    public int SubscriptionId { get; set; }
    public CompanySubscription? Subscription { get; set; }
    public string Feature { get; set; } = string.Empty;
    public int Usage { get; set; }
    public int Limit { get; set; }
    public decimal OverageRate { get; set; }
    public DateTime NextResetAt { get; set; }
}
