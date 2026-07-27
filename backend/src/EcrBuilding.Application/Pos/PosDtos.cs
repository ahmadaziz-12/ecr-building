namespace EcrBuilding.Application.Pos;

public record CustomerDto(int Id, string NameEn, string? NameAr, string Type, string? Phone, string? Email, string? VatNo, decimal CreditLimit, decimal Outstanding, string? City, string? District, string? Address, bool LoyaltyEnrolled, int LoyaltyPoints, int LoyaltyLifetimePoints, string LoyaltyTier, string Status, DateTime? LastPurchaseAt, string? ProjectName, int? CreditTermDays, DateTime CreatedAt,
    // Module 7 (BRD §4.3.2): SAR-spend tier progress + Gold's dedicated manager + Platinum's priority billing.
    decimal LoyaltyLifetimeSpend = 0, int? AccountManagerUserId = null, string? AccountManagerName = null, bool PriorityBilling = false,
    // Module 20 (BRD §4.3.4): birthday-bonus source + "points lapse next month" cashier alert.
    DateTime? DateOfBirth = null, bool PointsExpiringSoon = false);
public record UpsertCustomerRequest(string NameEn, string? NameAr, string Type, string? Phone, string? Email, string? VatNo, decimal CreditLimit, string? City, string? District, string? Address, bool LoyaltyEnrolled, string? ProjectName, int? CreditTermDays,
    int? AccountManagerUserId = null, bool PriorityBilling = false, DateTime? DateOfBirth = null);
public record CustomerStatementDto(int CustomerId, string CustomerName, decimal CreditLimit, decimal Outstanding, IReadOnlyList<OrderDto> Orders);

// Uom/StockQty/LengthM/WidthM: BRD §2.3 audit trail — Qty/UnitPrice are in the selling UOM the
// cashier chose; StockQty is what was deducted from inventory in stock UOM. Legacy lines predating
// the UOM engine surface Uom="" and StockQty=0 (readers fall back to Qty).
public record OrderLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal UnitPrice, decimal DiscountPct, decimal VatRate, decimal LineTotal, string Uom = "", decimal StockQty = 0, decimal? LengthM = null, decimal? WidthM = null,
    // The OrderLine's own id — Module 6 return creation references original lines by this.
    int Id = 0,
    // BRD §5.2: bundle grouping — set when the line was auto-populated from a bundle.
    int? BundleId = null, string? BundleName = null);
public record OrderPaymentDto(string Method, decimal Amount, string? ReferenceNumber, string Status, DateTime CreatedAt);
public record OrderFeeDto(string Label, decimal Amount);
public record OrderDto(
    int Id, string OrderNo, int BranchId, string BranchName, int? TerminalId, string CashierName, int? CustomerId, string CustomerName,
    string Type, string Status, string PaymentStatus, decimal SubTotal, decimal DiscountTotal, decimal VatTotal, decimal FeesTotal,
    decimal GrandTotal, DateTime CreatedAt, IReadOnlyList<OrderLineDto> Lines, IReadOnlyList<OrderPaymentDto> Payments, IReadOnlyList<OrderFeeDto> Fees,
    // Populated only on the checkout response for a loyalty-enrolled customer (BRD §4.3.1: the receipt
    // must show points earned this transaction, updated balance, and next tier threshold). Null on
    // every other endpoint that returns an OrderDto (List/Get/Void) — this isn't stored on Order itself.
    int? LoyaltyPointsEarned = null, int? LoyaltyPointsBalance = null, int? LoyaltyNextTierThreshold = null, int? LoyaltyPointsRedeemed = null,
    // BRD §3.5: when this sale had at least one delivery-flagged line, the DeliveryOrder auto-created
    // at checkout — null when the sale has no delivery component. Lets POS screens show live delivery
    // status without a trip to the separate Delivery module.
    int? DeliveryOrderId = null, string? DeliveryOrderNo = null, string? DeliveryStage = null);

// Uom: selling UOM for this line (null/empty = the product's stock UOM). LengthM/WidthM: cut-to-size
// dimension entry (BRD §2.3 item 5) — when both are set on an IsCutToSize product, Qty is ignored and
// the computed area (length × width) becomes the quantity, priced per stock-UOM m².
// RequiresDelivery (BRD §3.5): cashier flags this specific line for delivery instead of counter
// pickup — a sale can mix flagged and unflagged lines (partial delivery), and only flagged lines are
// carried into the auto-created DeliveryOrder.
public record CartLineInput(int ProductId, decimal Qty, string? Uom = null, decimal? LengthM = null, decimal? WidthM = null, bool RequiresDelivery = false);

// BRD §3.5: captured once per checkout (not per line) — every delivery-flagged line in the cart ships
// to this single address/date. ZoneId (optional): when set, the delivery fee auto-calculates from the
// zone's configured Fee (BRD "calculated ... automatically") instead of requiring a manual amount.
public record DeliveryDetailsInput(
    string AddressType, string ContactName, string ContactMobile, string City, string? District, string? Street, string? Landmark, string? Instructions,
    DateTime PromisedDate, string PromisedTime, string? TimeSlot, string? Priority, int? DriverId, int? VehicleId, int? ZoneId, decimal? WeightTons);
public record PaymentInput(string Method, decimal Amount);
public record ManualDiscountInput(string Type, decimal Value); // Type: "Percentage" | "Fixed"
public record CustomFeeInput(string Label, decimal Amount);
// BRD §5.2: a bundle in the cart — server expands it into constituent order lines at proportional
// bundle prices, so VAT stays per-item at each constituent's own rate (BRD §5.4, never blended).
public record BundleCartInput(int BundleId, decimal Qty);
public record CreateOrderRequest(
    int BranchId, int? TerminalId, int? CustomerId, string Type, List<CartLineInput> Lines, List<PaymentInput> Payments,
    string? CouponCode, ManualDiscountInput? ManualDiscount, List<CustomFeeInput>? CustomFees, string? Notes,
    List<BundleCartInput>? Bundles = null,
    // BRD §4.2 (Module 11): B2B purchase-order reference and project code, carried to the tax invoice.
    string? PoReference = null, string? ProjectCode = null,
    // Module 10 (offline mode): client idempotency key — a replayed request with the same id returns
    // the original order instead of creating a duplicate.
    string? ClientRequestId = null,
    // Required when ManualDiscount exceeds the cashier's own discount-authorization ceiling (BRD §6.2) —
    // the id of an already-Approved ApprovalRequest (Type=Discount) covering this sale's discount.
    int? DiscountApprovalRequestId = null,
    // Required when an AccountCredit payment would push a B2B customer's Outstanding balance over
    // their CreditLimit (BRD §4.2) — the id of an already-Approved ApprovalRequest (Type=CreditOverride).
    int? CreditOverrideApprovalRequestId = null,
    // BRD §3.5: required when any Lines entry has RequiresDelivery=true — the shared address/date/
    // driver-vehicle-preference for every delivery-flagged line in this sale.
    DeliveryDetailsInput? Delivery = null);

public record CashierShiftDto(int Id, int TerminalId, string TerminalName, string CashierName, DateTime OpenedAt, DateTime? ClosedAt, decimal OpeningFloat, decimal CashSales, decimal CashIn, decimal CashOut, decimal ExpectedCash, decimal? CountedCash, decimal? Variance, string Status);
public record OpenShiftRequest(int TerminalId, decimal OpeningFloat);
public record CloseShiftRequest(decimal CountedCash);
public record CashMovementRequest(decimal Amount, string Reason);
// BRD §3.6: voids carry a REASON CODE (not free text) and, above the cashier's own authorization,
// a distinct authorizing manager who confirms with their PIN — captured separately from the voiding
// user in the audit trail. ReasonCode: CustomerChangedMind | PricingError | DuplicateEntry |
// StockIssue | TrainingError | Other (validated server-side).
// Settles an order that exists but is still awaiting payment (today: quotations converted via
// QuotationsController.Convert, which reserves the stock but creates the order Pending/Unpaid).
// TerminalId stamps the till taking the money when the order wasn't born at one, so the cash
// lands in that till's shift reconciliation.
public record PayOrderRequest(List<PaymentInput> Payments, int? TerminalId = null);
public record VoidOrderRequest(string Reason, string? ReasonCode = null, string? AuthorizerEmail = null, string? AuthorizerPin = null);
// BRD §3.6 line-item void: removes ONE line from a completed order, restoring only that line's stock
// and reducing the order totals — same authorization rules as a full void.
public record VoidLineRequest(int OrderLineId, string Reason, string? ReasonCode = null, string? AuthorizerEmail = null, string? AuthorizerPin = null);

public record ShiftPaymentBreakdownDto(string Method, decimal Amount, int Count);
public record CashierShiftReportDto(string ReportType, int ShiftId, string TerminalName, string CashierName, DateTime OpenedAt, DateTime? ClosedAt, DateTime GeneratedAt, decimal OpeningFloat, decimal CashSales, decimal CashIn, decimal CashOut, decimal ExpectedCash, decimal? CountedCash, decimal? Variance, int OrderCount, IReadOnlyList<ShiftPaymentBreakdownDto> PaymentBreakdown);

public record QuotationLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal UnitPrice, decimal DiscountPct, decimal VatRate, decimal LineTotal);
public record QuotationDto(
    int Id, string QuoteNo, int BranchId, int? CustomerId, string CustomerName, string CreatedByName, string Status,
    DateTime ValidUntil, decimal SubTotal, decimal DiscountTotal, decimal VatTotal, decimal GrandTotal, string? Notes,
    int? ConvertedOrderId, string? ConvertedOrderNo, DateTime CreatedAt, IReadOnlyList<QuotationLineDto> Lines,
    // BRD §3.4: project code is mandatory (Module 16); customer reference is optional.
    string ProjectCode = "", string CustomerReference = "",
    // Manual discount override rate, echoed back so the edit form can re-show the number the user picked.
    decimal DiscountPct = 0m);
public record CreateQuotationRequest(int BranchId, int? CustomerId, List<CartLineInput> Lines, DateTime? ValidUntil, string? Notes,
    string? ProjectCode = null, string? CustomerReference = null, decimal? DiscountPct = null);
public record UpdateQuotationRequest(int? CustomerId, List<CartLineInput> Lines, DateTime? ValidUntil, string? Notes,
    string ProjectCode, string? CustomerReference, decimal? DiscountPct = null);

public record ApprovalRequestDto(
    int Id, string Type, int BranchId, string RequestedByName, string? ApproverName, decimal Amount, string Reason,
    string Status, int? RelatedOrderId, string? RelatedOrderNo, DateTime CreatedAt, DateTime? ResolvedAt);
public record CreateApprovalRequestInput(string Type, int BranchId, decimal Amount, string Reason, int? RelatedOrderId);

// BranchId/BranchName null = applies company-wide.
public record PricingRuleDto(int Id, string Name, string Type, string Scope, string Condition, string Action, int Priority, DateTime? ValidUntil, string Status, string? Code, string DiscountType, decimal Value, int? BranchId = null, string? BranchName = null, decimal? MinQuantity = null, string? Sku = null);
public record UpsertPricingRuleRequest(string Name, string Type, string Scope, string Condition, string Action, int Priority, DateTime? ValidUntil, string? Code, string DiscountType, decimal Value, int? BranchId = null, decimal? MinQuantity = null, string? Sku = null);
public record ValidateCouponResponse(bool Valid, string? Code, string? Name, string DiscountType, decimal Value, string? Reason);

public record ParkedLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal UnitPrice);
public record ParkedSaleDto(int Id, string TicketNo, int BranchId, int? TerminalId, string CashierName, int? CustomerId, string? CustomerName, string? Notes, DateTime CreatedAt, decimal Total, IReadOnlyList<ParkedLineDto> Lines);
public record CreateParkedSaleRequest(int BranchId, int? TerminalId, int? CustomerId, string? Notes, List<CartLineInput> Lines);

// BRD §4.3.3: the redemption rate/min/max a cashier needs at checkout — read-only, so it's reachable
// with plain Orders/View access instead of the Admin-only Settings CRUD endpoints.
// Cashier-facing subset (Orders/View access, not Finance-gated like LoyaltyController's admin
// config) — the checkout screen needs the tier ladder too, to compute the live discount/multiplier/
// free-delivery/next-tier-progress display without hardcoding values that Finance can now edit.
public record LoyaltyConfigDto(
    decimal PointsPerSarEarned, decimal PointsPerSarRedeemed, int MinRedeemPoints, decimal MaxRedeemPctOfTotal,
    decimal SilverThreshold, decimal GoldThreshold, decimal PlatinumThreshold,
    decimal SilverMultiplier, decimal GoldMultiplier, decimal PlatinumMultiplier,
    decimal SilverDiscountPct, decimal GoldDiscountPct, decimal PlatinumDiscountPct,
    decimal FreeDeliveryMinOrderSar);
