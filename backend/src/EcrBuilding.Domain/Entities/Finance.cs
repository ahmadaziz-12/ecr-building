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
    // Null = company-wide (true for every real VAT code — VAT is set by national law, not per
    // branch). A branch-specific Fee-type code (e.g. one branch's own delivery surcharge) can be
    // scoped to just that branch.
    public int? BranchId { get; set; }
    public Branch? Branch { get; set; }
}

public enum ReturnType { Standard, Surplus, Damaged, Exchange }
public enum ReturnStatus { Completed, Quarantine, PendingApproval }

// BRD §3.2.2: the five mandatory damage reason codes — free text is only supplementary description.
public enum DamageReasonCode
{
    ManufacturingDefect = 0,
    TransitDamage = 1,
    IncorrectProductSupplied = 2,
    QualityBelowSpecification = 3,
    Other = 4,
}

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

    // BRD §3.2.2 damaged-return workflow: mandatory reason code, optional photo evidence reference,
    // and the DGRN (Damaged Goods Return Note) number generated at creation — null on other types.
    public DamageReasonCode? DamageReason { get; set; }
    public string? PhotoReference { get; set; }
    public string? DgrnNo { get; set; }

    // BRD §3.2.3/§3.2.4 Return Value Calculation — computed server-side at creation from the original
    // order lines (never trusted from the client) and frozen here so receipts/reports/GL all agree:
    // NetCashback = GrossRefund (ex-VAT, at price actually paid) + VatReversal − RestockingFeeAmount.
    public decimal GrossRefund { get; set; }
    public decimal VatReversal { get; set; }
    public decimal RestockingFeePct { get; set; }
    public decimal RestockingFeeAmount { get; set; }
    public decimal NetCashback { get; set; }

    // BRD §3.2.4: Original (proportional split across the original payment methods — stored in
    // RefundSplitJson at approval), Cash, StoreCredit, or AccountCredit (B2B: reduces Outstanding).
    public string RefundMethod { get; set; } = "Original";
    public string? RefundSplitJson { get; set; }

    // BRD §3.2.1 exchange workflow: the replacement sale this return nets against, when Type=Exchange.
    // Populated at Approve time once ExchangeLines below are actually turned into a real Order (stock
    // deducted, GL posted) — legacy manual-link path also still sets this at Create if a client passes
    // an already-existing order id with no ExchangeLines.
    public int? ExchangeOrderId { get; set; }
    public Order? ExchangeOrder { get; set; }

    // BRD §3.2.2 (no-receipt returns, CR "CanAuthorizeStandardReturnWithoutReceipt"): set when this
    // Standard return was created without an original Order — the cashier entered product/qty
    // directly. Refund is always StoreCredit against CustomerId in that case (there is no original
    // payment method to refund to).
    public bool IsNoReceipt { get; set; }

    public ICollection<ReturnLine> Lines { get; set; } = new List<ReturnLine>();
    // BRD §3.2.1 exchange workflow: the replacement item(s) the customer picked, priced at creation
    // time — turned into a real Order (stock deducted, GL posted) only at Approve.
    public ICollection<ReturnExchangeLine> ExchangeLines { get; set; } = new List<ReturnExchangeLine>();
}

public class ReturnLine
{
    public int Id { get; set; }
    public int ReturnId { get; set; }
    public Return? Return { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    // The exact original order line this return draws down — prior-return accounting runs per line,
    // so two partial returns can never jointly exceed what that line originally sold. Null only on
    // legacy rows created before Module 6.
    public int? OrderLineId { get; set; }
    public decimal Qty { get; set; }
    // Stock-UOM quantity to restock (surplus/standard) or quarantine (damaged) — converted from the
    // selling-UOM Qty via the original line's UOM factor (BRD §2.3). 0 on legacy rows → fall back to Qty.
    public decimal StockQty { get; set; }
    public decimal UnitPricePaid { get; set; }
    public decimal VatRate { get; set; }
    public decimal Amount { get; set; }
}

// BRD §3.2.1 exchange workflow: the replacement item(s) selected alongside the returned goods —
// priced at Create time (current SellingPrice × UOM factor, ex-VAT + the product's own VatRate; no
// contractor/loyalty/promo pricing stacking — an exchange is a straightforward like-for-like swap,
// not a full re-run of checkout's pricing engine). Turned into real OrderLines on a new Order only
// once the return is Approved (stock deducted, GL posted, net difference settled at that point).
public class ReturnExchangeLine
{
    public int Id { get; set; }
    public int ReturnId { get; set; }
    public Return? Return { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public decimal Qty { get; set; }
    public string Uom { get; set; } = string.Empty;
    public decimal StockQty { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal VatRate { get; set; }
    public decimal LineTotal { get; set; }
}
