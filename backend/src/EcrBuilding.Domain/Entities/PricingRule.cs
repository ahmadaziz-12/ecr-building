using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum RuleDiscountType { Percentage, Fixed }

// Trade/quantity/fee rules go live immediately (Active); coupons and promos start PendingApproval
// so a manager signs off before they're redeemable — mirrors the manual-discount approval pattern
// already used for Expenses/Returns.
public enum PricingRuleStatus { PendingApproval, Active, Expired, Inactive }

public class PricingRule : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = "Trade Tier";
    public string Scope { get; set; } = string.Empty;
    public string Condition { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public int Priority { get; set; }
    public DateTime? ValidUntil { get; set; }
    public PricingRuleStatus Status { get; set; } = PricingRuleStatus.Active;

    // Only set for Type="Coupon" rows — redeemable at POS checkout via /api/finance/pricing-rules/validate-coupon.
    public string? Code { get; set; }
    public RuleDiscountType DiscountType { get; set; } = RuleDiscountType.Percentage;
    public decimal Value { get; set; }
}
