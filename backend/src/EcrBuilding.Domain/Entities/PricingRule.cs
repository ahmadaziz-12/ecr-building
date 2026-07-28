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
    // Null = applies company-wide, across every branch. A rule/coupon a branch-level manager
    // creates for their own promotion can be scoped to just that branch.
    public int? BranchId { get; set; }
    public Branch? Branch { get; set; }
    public string Scope { get; set; } = string.Empty;
    public string Condition { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public int Priority { get; set; }
    // BRD §7 (CR-040): a Promotional rule's start date — null means "active immediately" (matches
    // every other rule type's existing behavior, which never had a start gate before this field).
    public DateTime? ValidFrom { get; set; }
    public DateTime? ValidUntil { get; set; }
    public PricingRuleStatus Status { get; set; } = PricingRuleStatus.Active;

    // Only set for Type="Coupon" rows — redeemable at POS checkout via /api/finance/pricing-rules/validate-coupon.
    public string? Code { get; set; }
    public RuleDiscountType DiscountType { get; set; } = RuleDiscountType.Percentage;
    public decimal Value { get; set; }

    // Only set for Type="Quantity" rows — read by OrdersController.Checkout to auto-apply the
    // discount once a cart line's quantity reaches this threshold. Null Sku = applies to any product.
    public decimal? MinQuantity { get; set; }
    public string? Sku { get; set; }
    // Null on seeded/legacy rows (predates this field) — those already bypass approval via the
    // entity's Active default anyway, so there's nothing to self-approve. Used to block the creator
    // from activating their own PendingApproval rule, same rule ApprovalsController enforces.
    public int? CreatedByUserId { get; set; }
}
