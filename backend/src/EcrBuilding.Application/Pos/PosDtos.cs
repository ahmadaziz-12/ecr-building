namespace EcrBuilding.Application.Pos;

public record CustomerDto(int Id, string NameEn, string? NameAr, string Type, string? Phone, string? Email, string? VatNo, decimal CreditLimit, decimal Outstanding, string? City, string? District, string? Address, bool LoyaltyEnrolled, int LoyaltyPoints, int LoyaltyLifetimePoints, string LoyaltyTier, string Status, DateTime? LastPurchaseAt, string? ProjectName, int? CreditTermDays, DateTime CreatedAt);
public record UpsertCustomerRequest(string NameEn, string? NameAr, string Type, string? Phone, string? Email, string? VatNo, decimal CreditLimit, string? City, string? District, string? Address, bool LoyaltyEnrolled, string? ProjectName, int? CreditTermDays);
public record CustomerStatementDto(int CustomerId, string CustomerName, decimal CreditLimit, decimal Outstanding, IReadOnlyList<OrderDto> Orders);

public record OrderLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal UnitPrice, decimal DiscountPct, decimal VatRate, decimal LineTotal);
public record OrderPaymentDto(string Method, decimal Amount, string? ReferenceNumber, string Status, DateTime CreatedAt);
public record OrderFeeDto(string Label, decimal Amount);
public record OrderDto(
    int Id, string OrderNo, int BranchId, string BranchName, int? TerminalId, string CashierName, int? CustomerId, string CustomerName,
    string Type, string Status, string PaymentStatus, decimal SubTotal, decimal DiscountTotal, decimal VatTotal, decimal FeesTotal,
    decimal GrandTotal, DateTime CreatedAt, IReadOnlyList<OrderLineDto> Lines, IReadOnlyList<OrderPaymentDto> Payments, IReadOnlyList<OrderFeeDto> Fees);

public record CartLineInput(int ProductId, decimal Qty);
public record PaymentInput(string Method, decimal Amount);
public record ManualDiscountInput(string Type, decimal Value); // Type: "Percentage" | "Fixed"
public record CustomFeeInput(string Label, decimal Amount);
public record CreateOrderRequest(
    int BranchId, int? TerminalId, int? CustomerId, string Type, List<CartLineInput> Lines, List<PaymentInput> Payments,
    string? CouponCode, ManualDiscountInput? ManualDiscount, List<CustomFeeInput>? CustomFees, string? Notes);

public record CashierShiftDto(int Id, int TerminalId, string TerminalName, string CashierName, DateTime OpenedAt, DateTime? ClosedAt, decimal OpeningFloat, decimal CashSales, decimal CashIn, decimal CashOut, decimal ExpectedCash, decimal? CountedCash, decimal? Variance, string Status);
public record OpenShiftRequest(int TerminalId, decimal OpeningFloat);
public record CloseShiftRequest(decimal CountedCash);
public record CashMovementRequest(decimal Amount, string Reason);
public record VoidOrderRequest(string Reason);

public record ShiftPaymentBreakdownDto(string Method, decimal Amount, int Count);
public record CashierShiftReportDto(string ReportType, int ShiftId, string TerminalName, string CashierName, DateTime OpenedAt, DateTime? ClosedAt, DateTime GeneratedAt, decimal OpeningFloat, decimal CashSales, decimal CashIn, decimal CashOut, decimal ExpectedCash, decimal? CountedCash, decimal? Variance, int OrderCount, IReadOnlyList<ShiftPaymentBreakdownDto> PaymentBreakdown);

public record QuotationLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal UnitPrice, decimal DiscountPct, decimal VatRate, decimal LineTotal);
public record QuotationDto(
    int Id, string QuoteNo, int BranchId, int? CustomerId, string CustomerName, string CreatedByName, string Status,
    DateTime ValidUntil, decimal SubTotal, decimal DiscountTotal, decimal VatTotal, decimal GrandTotal, string? Notes,
    int? ConvertedOrderId, string? ConvertedOrderNo, DateTime CreatedAt, IReadOnlyList<QuotationLineDto> Lines);
public record CreateQuotationRequest(int BranchId, int? CustomerId, List<CartLineInput> Lines, DateTime? ValidUntil, string? Notes);

public record ApprovalRequestDto(
    int Id, string Type, int BranchId, string RequestedByName, string? ApproverName, decimal Amount, string Reason,
    string Status, int? RelatedOrderId, string? RelatedOrderNo, DateTime CreatedAt, DateTime? ResolvedAt);
public record CreateApprovalRequestInput(string Type, int BranchId, decimal Amount, string Reason, int? RelatedOrderId);

public record PricingRuleDto(int Id, string Name, string Type, string Scope, string Condition, string Action, int Priority, DateTime? ValidUntil, string Status, string? Code, string DiscountType, decimal Value);
public record UpsertPricingRuleRequest(string Name, string Type, string Scope, string Condition, string Action, int Priority, DateTime? ValidUntil, string? Code, string DiscountType, decimal Value);
public record ValidateCouponResponse(bool Valid, string? Code, string? Name, string DiscountType, decimal Value, string? Reason);

public record ParkedLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal UnitPrice);
public record ParkedSaleDto(int Id, string TicketNo, int BranchId, int? TerminalId, string CashierName, int? CustomerId, string? CustomerName, string? Notes, DateTime CreatedAt, decimal Total, IReadOnlyList<ParkedLineDto> Lines);
public record CreateParkedSaleRequest(int BranchId, int? TerminalId, int? CustomerId, string? Notes, List<CartLineInput> Lines);
