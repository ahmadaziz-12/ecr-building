using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

// BRD §4.3.2 ladder. "Bronze" was called "Standard" before Module 7 — the numeric value is what's
// stored, so renaming the member is data-safe; JSON payloads now serialize "Bronze".
public enum LoyaltyTier
{
    Bronze = 0,
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
    Reversal,
    // Distinct from Reversal (which claws back EARNED points and is summed as a running total to
    // cap what a return can reverse) — this restores REDEEMED points when the item paid for with
    // them is returned. Keeping it a separate type stops it from corrupting Reversal's earn-clawback
    // bookkeeping in FinanceController.Approve.
    RedeemReversal
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
