using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

public enum SerialUnitStatus { InStock = 0, Sold = 1, Returned = 2, UnderWarranty = 3, Scrapped = 4 }

// Serial Number Tracking: one row per physical serialized unit (power tool, generator, appliance —
// anything Product.RequiresSerialTracking opts into) rather than a generic quantity in
// BranchStockLevel. Registered manually (or at PO receiving) with its serial number, consumed at
// checkout by linking it to the exact OrderLine that sold it, and looked up later by serial number
// for warranty/support — the same "per-unit record with its own lifecycle" shape as stock batches
// (ExpiryPage) use for lot tracking.
public class SerializedUnit : BaseEntity
{
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public string SerialNo { get; set; } = string.Empty;
    public SerialUnitStatus Status { get; set; } = SerialUnitStatus.InStock;
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public DateTime ReceivedDate { get; set; } = DateTime.UtcNow;
    public int? SoldOrderId { get; set; }
    public Order? SoldOrder { get; set; }
    public int? SoldOrderLineId { get; set; }
    public OrderLine? SoldOrderLine { get; set; }
    public DateTime? WarrantyExpiresAt { get; set; }
    public string? Notes { get; set; }
}
