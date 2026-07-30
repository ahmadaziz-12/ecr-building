using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum QuotationStatus { Draft = 0, Sent = 1, Accepted = 2, Rejected = 3, Expired = 4, Converted = 5, Cancelled = 6 }

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
    // BRD §3.4: default validity is 15 days (was 14 before Module 16).
    public DateTime ValidUntil { get; set; } = DateTime.UtcNow.AddDays(15);
    // BRD §3.4: both MANDATORY on quotations — enforced in QuotationsController.Create.
    public string ProjectCode { get; set; } = string.Empty;
    public string CustomerReference { get; set; } = string.Empty;
    public decimal SubTotal { get; set; }
    public decimal DiscountTotal { get; set; }
    // Quotation-level discount % applied uniformly to every line (manual override entered by the
    // user, defaulting to the BRD §3.4 contractor auto-discount) — kept separate from DiscountTotal
    // (the resulting SAR amount) so the form can re-show/re-edit the rate itself, not just the total.
    public decimal DiscountPct { get; set; }
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
    // Qty/UnitPrice are in the SELLING UOM (BRD §2.3), mirroring OrderLine exactly — quoting 2 Pallet
    // of a Bag-stocked product stores Qty=2, Uom="Pallet", UnitPrice=50×bag-price, while StockQty is
    // the real physical demand in stock UOM that reservation/release/Convert must always use instead
    // of Qty. Legacy rows predating this stay Uom="" (falls back to the product's stock UOM as before)
    // with StockQty equal to Qty.
    public decimal Qty { get; set; }
    public string Uom { get; set; } = string.Empty;
    public decimal StockQty { get; set; }
    // Cut-to-size dimensions the user entered, from which Qty (length/area/volume, per the product's
    // CutToSizeUnit) was computed — same convention as OrderLine. WidthM/HeightM stay null outside
    // Area/Volume mode.
    public decimal? LengthM { get; set; }
    public decimal? WidthM { get; set; }
    public decimal? HeightM { get; set; }
    // Cut-to-size minimum-charge audit trail: set only when Product.MinCutQty raised the billed Qty
    // above the actual measured length/area/volume — null when no minimum applied.
    public decimal? MeasuredQty { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountPct { get; set; }
    public decimal VatRate { get; set; }
    public decimal LineTotal { get; set; }
}
