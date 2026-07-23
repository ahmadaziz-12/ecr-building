using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum OrderType { Retail = 0, Contractor = 1, Quotation = 2, Delivery = 3 }
public enum OrderStatus { Pending = 0, Completed = 1, Dispatched = 2, Delivered = 3, Returned = 4, Voided = 5 }
public enum PaymentStatus { Unpaid = 0, Paid = 1, PartiallyPaid = 2, Refunded = 3, Cancelled = 4 }
public enum PaymentMethod { Cash = 0, Mada = 1, ApplePay = 2, StcPay = 3, Transfer = 4, Loyalty = 5 }
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
    public decimal VatTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public string? Notes { get; set; }

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
    public decimal Qty { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPct { get; set; }
    public decimal VatRate { get; set; }
    public decimal LineTotal { get; set; }
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
