using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public enum AccountType { Asset, Liability, Equity, Revenue, Expense }

public class Account : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public AccountType Type { get; set; }
    public int? ParentId { get; set; }
    public Account? Parent { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;
}

public class JournalEntry
{
    public int Id { get; set; }
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public string Reference { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<JournalLine> Lines { get; set; } = new List<JournalLine>();
}

public class JournalLine
{
    public int Id { get; set; }
    public int JournalEntryId { get; set; }
    public JournalEntry? JournalEntry { get; set; }
    public int AccountId { get; set; }
    public Account? Account { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
}

public enum ExpenseStatus { Pending, Approved, Rejected }

public class Expense : BaseEntity
{
    public string ExpenseNo { get; set; } = string.Empty;
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public string Category { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? Vendor { get; set; }
    public decimal Amount { get; set; }
    public decimal Vat { get; set; }
    public string Method { get; set; } = "Cash";
    public ExpenseStatus Status { get; set; } = ExpenseStatus.Pending;
    public int? ApproverUserId { get; set; }
    public bool Reconciled { get; set; }
    public DateTime? ReconciledAt { get; set; }
}

public class TaxCode : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = "VAT";
    public decimal Rate { get; set; }
    public string AppliesTo { get; set; } = string.Empty;
    public DateTime EffectiveFrom { get; set; } = DateTime.UtcNow;
    public int? GlAccountId { get; set; }
    public Account? GlAccount { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;
}

public enum ReturnType { Standard, Surplus, Damaged, Exchange }
public enum ReturnStatus { Completed, Quarantine, PendingApproval }

public class Return : BaseEntity
{
    public string ReturnNo { get; set; } = string.Empty;
    public int? OrderId { get; set; }
    public Order? Order { get; set; }
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public ReturnType Type { get; set; } = ReturnType.Standard;
    public string Reason { get; set; } = string.Empty;
    public int? ApprovedByUserId { get; set; }
    public User? ApprovedBy { get; set; }
    public ReturnStatus Status { get; set; } = ReturnStatus.PendingApproval;

    public ICollection<ReturnLine> Lines { get; set; } = new List<ReturnLine>();
}

public class ReturnLine
{
    public int Id { get; set; }
    public int ReturnId { get; set; }
    public Return? Return { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public decimal Qty { get; set; }
    public decimal Amount { get; set; }
}
