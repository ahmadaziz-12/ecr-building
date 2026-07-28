namespace EcrBuilding.Application.Finance;

public record ExpenseDto(int Id, string ExpenseNo, DateTime Date, int BranchId, string BranchName, string Category, string Description, string? Vendor, decimal Amount, decimal Vat, string Method, string Status, bool Reconciled);
public record CreateExpenseRequest(DateTime Date, int BranchId, string Category, string Description, string? Vendor, decimal Amount, decimal Vat, string Method);
public record UpdateExpenseStatusRequest(string Status, int? ApproverUserId);

// BranchId/BranchName null = company-wide.
public record TaxCodeDto(int Id, string Code, string Name, string Type, decimal Rate, string AppliesTo, DateTime EffectiveFrom, string? GlAccountCode, string Status, int? BranchId = null, string? BranchName = null);
public record UpsertTaxCodeRequest(string Code, string Name, string Type, decimal Rate, string AppliesTo, DateTime EffectiveFrom, string? GlAccountCode, int? BranchId = null);

public record ReturnLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal Amount, int? OrderLineId = null, decimal StockQty = 0, decimal UnitPricePaid = 0, decimal VatRate = 0);
// BRD §3.2.1 exchange workflow: the replacement item(s), priced at Create time.
public record ExchangeLineDto(int ProductId, string Sku, string ProductName, decimal Qty, string Uom, decimal UnitPrice, decimal VatRate, decimal LineTotal);
public record ReturnDto(
    int Id, string ReturnNo, int? OrderId, string? OrderNo, int? CustomerId, string CustomerName, string Type, string Reason,
    decimal TotalAmount, string? ApprovedByName, string Status, DateTime CreatedAt, IReadOnlyList<ReturnLineDto> Lines,
    // Module 6 (BRD §3.2) — damaged-return workflow + frozen Return Value Calculation + refund routing.
    string? DgrnNo = null, string? DamageReason = null, string? PhotoReference = null,
    decimal GrossRefund = 0, decimal VatReversal = 0, decimal RestockingFeePct = 0, decimal RestockingFeeAmount = 0, decimal NetCashback = 0,
    string RefundMethod = "Original", string? RefundSplitJson = null, int? ExchangeOrderId = null, string? ExchangeOrderNo = null,
    // Exchange only: replacement sale total − this return's cashback (positive = customer owes more,
    // negative = customer is owed the difference back, zero = an even swap).
    decimal? ExchangeNetPayable = null,
    // A return has no branch of its own — it inherits the original SALE's branch/cashier via Order.
    // Null only for the rare return whose Order has since been deleted (OrderId is nullable).
    int? BranchId = null, string? BranchName = null, string? CashierName = null,
    IReadOnlyList<ExchangeLineDto>? ExchangeLines = null, bool IsNoReceipt = false);

// The cashier picks specific ORIGINAL ORDER LINES and quantities (BRD §3.2.1 partial returns) —
// amounts are computed server-side from the original line, never accepted from the client.
public record ReturnLineInput(int OrderLineId, decimal Qty);
// BRD §3.2.1 exchange workflow: the replacement item(s) the customer is picking, keyed by product
// (not an order line — these don't exist on any order yet). Uom null = the product's stock UOM.
public record ExchangeLineInput(int ProductId, decimal Qty, string? Uom = null);
// BRD §3.2.2 (no-receipt returns): entered directly by product/qty when there's no original order
// to draw down against — priced at the product's current SellingPrice/VatRate (nothing else to go on).
public record NoReceiptLineInput(int ProductId, decimal Qty);
public record CreateReturnRequest(
    // Null OrderId = a no-receipt return (Standard only, requires CanAuthorizeStandardReturnWithoutReceipt
    // and CustomerId, since the refund can only be StoreCredit against a real account).
    int? OrderId, string Type, string Reason, List<ReturnLineInput> Lines,
    string? DamageReasonCode = null, string? PhotoReference = null,
    // Required when the return falls outside the configured window (BRD §3.2.1): id of an Approved
    // ApprovalRequest (Type=Refund) authorizing the out-of-window return.
    int? WindowOverrideApprovalRequestId = null,
    int? ExchangeOrderId = null,
    List<ExchangeLineInput>? ExchangeLines = null,
    int? CustomerId = null, List<NoReceiptLineInput>? NoReceiptLines = null);
// BRD §3.2.1 Exchange: required when the replacement item(s) cost more than this return's own
// cashback — the payment method(s)/amount(s) covering the shortfall, same shape as POS checkout.
public record ExchangePaymentInput(string Method, decimal Amount);
public record ApproveReturnRequest(
    int BranchId, string? RefundMethod = null,
    // BRD §3.2.4 dual authorization for cash refunds above the configured threshold (default SAR 500):
    // a second, supervisor-tier user confirms with their own PIN at the same moment.
    string? SecondAuthEmail = null, string? SecondAuthPin = null,
    List<ExchangePaymentInput>? Payments = null);

// BRD §3.2.3/§3.2.4: the Return Value Calculation the cashier reviews BEFORE confirming. Called with
// the chosen lines (or an empty list to just enumerate what's eligible and each line's max quantity).
public record ReturnPreviewRequest(int OrderId, string Type, List<ReturnLineInput> Lines, List<ExchangeLineInput>? ExchangeLines = null);
public record ReturnPreviewLineDto(
    int OrderLineId, int ProductId, string Sku, string ProductName, string Uom, decimal OriginalQty, decimal MaxReturnableQty,
    decimal Qty, decimal UnitPricePaid, decimal BaseRefund, decimal VatReversal, bool Returnable, string? NonReturnableReason);
public record ReturnPreviewDto(
    decimal GrossRefund, decimal VatReversal, decimal RestockingFeePct, decimal RestockingFeeAmount, decimal NetCashback,
    bool RequiresWindowOverride, int WindowDays, IReadOnlyList<ReturnPreviewLineDto> Lines,
    IReadOnlyList<ExchangeLineDto>? ExchangeLines = null, decimal ExchangeLinesTotal = 0, decimal? ExchangeNetPayable = null);

// BRD §3.2.1/§3.2.4: the return window (days) and dual-authorization cash threshold — configured
// from the Returns & Refunds page itself, Global scope only (branch-specific overrides remain
// settable via raw Setting rows for anyone who needs one, same Key/Global-vs-Branch lookup
// GetSettingDecimalAsync already uses).
public record ReturnPolicyConfigDto(decimal DualAuthCashThreshold, int StandardWindowDays, int SurplusWindowDays);

public record AccountDto(int Id, string Code, string Name, string Type, decimal Balance);
public record JournalLineDto(string AccountCode, string AccountName, decimal Debit, decimal Credit);
public record JournalEntryDto(int Id, DateTime Date, string Reference, string Description, IReadOnlyList<JournalLineDto> Lines);
