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
    public LoyaltyTier LoyaltyTier { get; set; } = LoyaltyTier.Standard;
    public DateTime? LastPurchaseAt { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    // Contractor/B2B-specific — left null for Walk-in/Retail/Loyalty customers.
    public string? ProjectName { get; set; }
    public int? CreditTermDays { get; set; }
}
