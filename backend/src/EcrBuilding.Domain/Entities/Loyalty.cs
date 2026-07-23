using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum LoyaltyTier
{
    Standard = 0,
    Silver = 1,
    Gold = 2,
    Platinum = 3
}

public enum LoyaltyTransactionType
{
    Welcome,
    Earn,
    Redeem,
    Adjust,
    Reversal
}

// Append-only ledger backing Customer.LoyaltyPoints — every accrual, redemption, manual
// correction or return-triggered reversal gets a row here so the running balance is always
// reconstructable/auditable, the same way JournalLine backs Account balances.
public class LoyaltyTransaction : BaseEntity
{
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public int? OrderId { get; set; }
    public Order? Order { get; set; }
    public int? BranchId { get; set; }
    public Branch? Branch { get; set; }
    public LoyaltyTransactionType Type { get; set; }
    public int Points { get; set; }
    public string Description { get; set; } = string.Empty;
    public int? CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }
}
