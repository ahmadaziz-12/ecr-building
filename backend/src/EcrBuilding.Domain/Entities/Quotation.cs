using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum QuotationStatus { Draft = 0, Sent = 1, Accepted = 2, Rejected = 3, Expired = 4, Converted = 5 }

public class Quotation : BaseEntity
{
    public string QuoteNo { get; set; } = string.Empty;
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public int CreatedByUserId { get; set; }
    public User? CreatedBy { get; set; }
    public QuotationStatus Status { get; set; } = QuotationStatus.Draft;
    public DateTime ValidUntil { get; set; } = DateTime.UtcNow.AddDays(14);
    public decimal SubTotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal VatTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public string? Notes { get; set; }
    public int? ConvertedOrderId { get; set; }
    public Order? ConvertedOrder { get; set; }

    public ICollection<QuotationLine> Lines { get; set; } = new List<QuotationLine>();
}

public class QuotationLine
{
    public int Id { get; set; }
    public int QuotationId { get; set; }
    public Quotation? Quotation { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public decimal Qty { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPct { get; set; }
    public decimal VatRate { get; set; }
    public decimal LineTotal { get; set; }
}
