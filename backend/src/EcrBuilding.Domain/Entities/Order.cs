using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum OrderType { Retail = 0, Contractor = 1, Quotation = 2, Delivery = 3 }
public enum OrderStatus { Pending = 0, Completed = 1, Dispatched = 2, Delivered = 3, Returned = 4, Voided = 5, Deleted = 6 }
public enum PaymentStatus { Unpaid = 0, Paid = 1, PartiallyPaid = 2, Refunded = 3, Cancelled = 4 }
// AccountCredit never touches IPaymentGateway — it's an internal ledger operation against the
// customer's B2B credit line (see OrdersController.Checkout), not a real payment rail. ReturnCredit
// is the same idea for an Exchange's replacement order (ReturnsController.Approve): the portion of
// the new sale settled by the linked return's own cashback, never charged again.
public enum PaymentMethod { Cash = 0, Mada = 1, ApplePay = 2, StcPay = 3, Transfer = 4, Loyalty = 5, AccountCredit = 6, ReturnCredit = 7 }
public enum PaymentRecordStatus { Completed = 0, Pending = 1, Failed = 2 }

public class Order : BaseEntity
{
    public string OrderNo { get; set; } = string.Empty;
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public int? TerminalId { get; set; }
    public Terminal? Terminal { get; set; }
    public int CashierUserId { get; set; }
    public User? Cashier { get; set; }
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public OrderType Type { get; set; } = OrderType.Retail;
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Unpaid;
    public decimal SubTotal { get; set; }
    public decimal DiscountTotal { get; set; }
    // Portion of DiscountTotal attributable to bundle constituent pricing (individual price minus
    // bundle price) — broken out so the receipt can show "Bundle Discount" as its own line instead
    // of folding it into the generic Discount total alongside coupon/contractor/manual discounts.
    public decimal BundleDiscountTotal { get; set; }
    public decimal VatTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public string? Notes { get; set; }
    // BRD §4.2/§7.4 (Module 11): B2B purchase-order reference and project code — carried onto the
    // full tax invoice and B2B receipts.
    public string? PoReference { get; set; }
    public string? ProjectCode { get; set; }
    // Module 10 (BRD §13 offline mode): client-generated idempotency key — replaying a queued offline
    // checkout after reconnection returns the already-created order instead of double-selling.
    public string? ClientRequestId { get; set; }

    public ICollection<OrderLine> Lines { get; set; } = new List<OrderLine>();
    public ICollection<OrderPayment> Payments { get; set; } = new List<OrderPayment>();
    public ICollection<OrderFee> Fees { get; set; } = new List<OrderFee>();
}

// Ad-hoc order-level charges (delivery/handling/custom fees) — added to GrandTotal after VAT,
// mirroring the reference POS's "custom fee" line items.
public class OrderFee
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public string Label { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

public class OrderLine
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    // Qty/UnitPrice are in the SELLING UOM the cashier chose (BRD §2.3): selling 2 Pallet of a
    // Bag-stocked product stores Qty=2, Uom="Pallet", UnitPrice=50×bag-price — while StockQty=100
    // records what was actually deducted from BranchStockLevel, in stock UOM, for audit/void/returns.
    // Legacy rows predating the UOM engine have Uom="" and StockQty=0; readers must fall back to Qty.
    public decimal Qty { get; set; }
    public string Uom { get; set; } = string.Empty;
    public decimal StockQty { get; set; }
    // Cut-to-size audit trail: the dimensions the cashier entered, from which Qty (length/area/volume,
    // per the product's CutToSizeUnit) was computed. WidthM/HeightM stay null for Length-mode lines.
    public decimal? LengthM { get; set; }
    public decimal? WidthM { get; set; }
    public decimal? HeightM { get; set; }
    // Cut-to-size minimum-charge audit trail: set only when Product.MinCutQty raised the billed Qty
    // above the actual measured length/area/volume — kept distinct from Qty so a receipt can show
    // "billed at minimum" instead of the measured cut looking like a math error. Null when no
    // minimum applied (Qty already is the measured amount).
    public decimal? MeasuredQty { get; set; }
    // Cut-to-size remnant tracking: the cashier optionally records the size of the source piece/
    // roll this was cut from (e.g. a 3m cable roll for a 2m cut). Null = no source was tracked and
    // StockQty deducts exactly the measured cut, same as before this feature existed. RemnantQty =
    // SourceQty - MeasuredQty (or - Qty when MeasuredQty is null); RemnantAction records whether the
    // leftover was returned to sellable stock ("Restock") or discarded as waste ("Scrap") — required
    // whenever RemnantQty is positive.
    public decimal? SourceQty { get; set; }
    public decimal? RemnantQty { get; set; }
    public string? RemnantAction { get; set; }
    // Cut Optimization: set when the cashier fulfilled this cut from an existing Remnant (an offcut
    // from a previous sale) instead of cutting fresh bulk stock — StockQty is 0 for these lines since
    // no BranchStockLevel.OnHand was touched, the deduction instead came off the Remnant's own Qty.
    // Null for every ordinary line, cut-to-size or not.
    public int? ConsumedRemnantId { get; set; }
    public Remnant? ConsumedRemnant { get; set; }
    // BRD §5.2: set when this line was auto-populated from a bundle — groups the constituents on the
    // receipt and feeds the Bundle Sales Report. UnitPrice on a bundle line is the constituent's
    // proportional share of the bundle price, so VAT stays per-item at each line's own rate.
    public int? BundleId { get; set; }
    public ProductBundle? Bundle { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPct { get; set; }
    public decimal VatRate { get; set; }
    public decimal LineTotal { get; set; }
    // BRD §2.3: a free-text note the cashier attaches to this specific cart line (e.g. "customer
    // wants the damaged-box unit", "leave at loading dock") — distinct from Order.Notes, which is
    // ticket-wide.
    public string? Notes { get; set; }
}

public class OrderPayment
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public PaymentMethod Method { get; set; }
    public decimal Amount { get; set; }
    public string? ReferenceNumber { get; set; }
    public PaymentRecordStatus Status { get; set; } = PaymentRecordStatus.Completed;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
