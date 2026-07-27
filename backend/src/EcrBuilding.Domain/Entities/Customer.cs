using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public enum CustomerType
{
    WalkIn = 0,
    Retail = 1,
    Contractor = 2,
    B2B = 3
}

public class Customer : BaseEntity
{
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public CustomerType Type { get; set; } = CustomerType.Retail;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? VatNo { get; set; }
    public decimal CreditLimit { get; set; }
    public decimal Outstanding { get; set; }
    public string? City { get; set; }
    public string? District { get; set; }
    public string? Address { get; set; }
    public bool LoyaltyEnrolled { get; set; }
    public int LoyaltyPoints { get; set; }
    public int LoyaltyLifetimePoints { get; set; }
    // BRD §4.3.2: tiers qualify on cumulative ex-VAT merchandise spend — accumulated at checkout on
    // fully-paid orders (Module 7); LoyaltyTier is re-derived from this after every sale.
    public decimal LoyaltyLifetimeSpend { get; set; }
    public LoyaltyTier LoyaltyTier { get; set; } = LoyaltyTier.Bronze;
    // Gold+ benefit (BRD §4.3.2): the staff member who owns this account relationship.
    public int? AccountManagerUserId { get; set; }
    public User? AccountManager { get; set; }
    // Platinum benefit (BRD §4.3.2): flags this account for priority project billing in queues/reports.
    public bool PriorityBilling { get; set; }
    public DateTime? LastPurchaseAt { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    // Contractor/B2B-specific — left null for Walk-in/Retail/Loyalty customers.
    public string? ProjectName { get; set; }
    public int? CreditTermDays { get; set; }
    // BRD §4.3.4 (Module 20): birthday-month bonus multiplier keys off this; optional.
    public DateTime? DateOfBirth { get; set; }
}
