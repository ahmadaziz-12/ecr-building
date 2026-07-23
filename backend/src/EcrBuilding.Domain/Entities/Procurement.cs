using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public class Supplier : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string? NameAr { get; set; }
    public string Type { get; set; } = "Distributor";
    public string? VatNo { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string CategoriesJson { get; set; } = "[]";
    public string Terms { get; set; } = "Net 30";
    public string Currency { get; set; } = "SAR";
    public int LeadTimeDays { get; set; } = 7;
    public string? Iban { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;
}

// Numeric values are load-bearing (stored as ints in the DB) — append new members, never renumber.
public enum PurchaseOrderStatus
{
    Draft = 0,
    Sent = 1,
    PartialReceive = 2,
    Received = 3,
    Delayed = 4,
    PendingApproval = 5,
    InTransit = 6,
    Cancelled = 7
}

public class PurchaseOrder : BaseEntity
{
    public string PoNo { get; set; } = string.Empty;
    public int SupplierId { get; set; }
    public Supplier? Supplier { get; set; }
    public string Currency { get; set; } = "SAR";
    public DateTime ExpectedDate { get; set; }
    public PurchaseOrderStatus Status { get; set; } = PurchaseOrderStatus.Draft;
    public decimal Shipping { get; set; }
    public string? Incoterm { get; set; }
    public int? ApproverUserId { get; set; }
    public string? Carrier { get; set; }
    public string? TrackingRef { get; set; }

    public ICollection<PurchaseOrderLine> Lines { get; set; } = new List<PurchaseOrderLine>();
}

// Branch/warehouse live per line (not on the PO header) so one PO can order different
// quantities for different branches — multiple lines for the same product, one per branch.
public class PurchaseOrderLine
{
    public int Id { get; set; }
    public int PurchaseOrderId { get; set; }
    public PurchaseOrder? PurchaseOrder { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public int WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public decimal Qty { get; set; }
    public decimal UnitCost { get; set; }
    public decimal ReceivedQty { get; set; }
    public string? BatchNo { get; set; }
    public DateTime? ExpiryDate { get; set; }
}

// Numeric values are load-bearing (stored as ints in the DB) — append new members, never renumber.
public enum ReturnToSupplierStatus
{
    AwaitingCredit = 0,
    CreditReceived = 1,
    Dispatched = 2,
    Rejected = 3,
    Draft = 4
}

public class ReturnToSupplier : BaseEntity
{
    public string RtsNo { get; set; } = string.Empty;
    public int SupplierId { get; set; }
    public Supplier? Supplier { get; set; }
    public int? PurchaseOrderId { get; set; }
    public PurchaseOrder? PurchaseOrder { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public int WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public string Reason { get; set; } = string.Empty;
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public string? CreditNoteRef { get; set; }
    public string? Carrier { get; set; }
    public ReturnToSupplierStatus Status { get; set; } = ReturnToSupplierStatus.Draft;

    public ICollection<ReturnToSupplierLine> Lines { get; set; } = new List<ReturnToSupplierLine>();
}

public class ReturnToSupplierLine
{
    public int Id { get; set; }
    public int ReturnToSupplierId { get; set; }
    public ReturnToSupplier? ReturnToSupplier { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public string? BatchNo { get; set; }
    public decimal Qty { get; set; }
    public decimal UnitCost { get; set; }
}
