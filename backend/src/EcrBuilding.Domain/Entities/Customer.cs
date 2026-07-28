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

// BRD §7 (CR-038): which of Product's list prices this customer is charged — independent of
// CustomerType above, which governs credit/account behavior (AccountCredit eligibility etc.), not
// pricing. A Contractor-type customer isn't automatically on the Contractor price list; a manager
// assigns it explicitly (e.g. a B2B account doing bulk buying might be assigned Wholesale instead).
public enum PriceListType
{
    Retail = 0,
    Contractor = 1,
    Wholesale = 2,
    Project = 3
}

public class Customer : BaseEntity
{
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public CustomerType Type { get; set; } = CustomerType.Retail;
    // BRD §7 (CR-038): which Product price list applies to this customer at checkout.
    public PriceListType PriceListType { get; set; } = PriceListType.Retail;
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
