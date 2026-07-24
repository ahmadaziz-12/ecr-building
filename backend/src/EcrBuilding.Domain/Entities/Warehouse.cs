using EcrBuilding.Domain.Common;
using EcrBuilding.Domain.Enums;

namespace EcrBuilding.Domain.Entities;

public enum WarehouseType
{
    MainYard = 0,
    Distribution = 1,
    ColdStorage = 2,
    Overflow = 3
}

public class Warehouse : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public WarehouseType Type { get; set; } = WarehouseType.MainYard;
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    public ICollection<WarehouseBin> Bins { get; set; } = new List<WarehouseBin>();
}

public class WarehouseBin : BaseEntity
{
    public int WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public string BinCode { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public decimal CapacityTons { get; set; }
    public decimal FilledTons { get; set; }
}

public class StockLevel : BaseEntity
{
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public decimal OnHand { get; set; }
    public decimal Reserved { get; set; }
    public decimal Available => OnHand - Reserved;
}

// The branch's own shop-floor on-hand quantity — independent from the warehouse(s) that supply
// it. POS checkout, void, quotation-conversion, delivery reservation, and return-approval all
// read/write this, not StockLevel; StockLevel is bulk/backroom stock, moved into here by a Stock
// Transfer (warehouse -> branch) same as any other transfer leg.
public class BranchStockLevel : BaseEntity
{
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public decimal OnHand { get; set; }
    public decimal Reserved { get; set; }
    public decimal Available => OnHand - Reserved;
}

public enum StockBatchStatus
{
    Healthy = 0,
    Monitor = 1,
    Expiring = 2,
    Critical = 3,
    Expired = 4,
    Quarantine = 5,
    WrittenOff = 6
}

public class StockBatch : BaseEntity
{
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public string BatchNo { get; set; } = string.Empty;
    public DateTime ReceivedDate { get; set; }
    public DateTime ExpiryDate { get; set; }
    public decimal Qty { get; set; }
    // Null unless a manual action (Quarantine/Write-Off/Move to Promo) was taken —
    // otherwise status is computed from ExpiryDate on every read (see StockBatchesController).
    public StockBatchStatus? ManualStatus { get; set; }
    public bool OnPromo { get; set; }
}

// Numeric values are load-bearing (stored as ints in the DB) — append new members, never renumber.
// Discrepancy is no longer produced (see StockTransfersController.Dispatch/Receive) but is left
// defined so any historical rows still deserialize.
public enum StockTransferStatus
{
    Draft = 0,
    Approved = 1,
    InTransit = 2,
    Received = 3,
    Discrepancy = 4,
    PendingApproval = 5,
    Cancelled = 6
}

// Source/destination are each EITHER a warehouse OR a branch — exactly one of the pair set per
// side (enforced in StockTransfersController, not the schema, matching how this codebase validates
// elsewhere). A warehouse holds bulk/backroom stock (StockLevel); a branch holds its own
// independent shop-floor stock (BranchStockLevel) — same product, two different ledgers.
public class StockTransfer : BaseEntity
{
    public string TransferNo { get; set; } = string.Empty;
    public int? FromWarehouseId { get; set; }
    public Warehouse? FromWarehouse { get; set; }
    public int? FromBranchId { get; set; }
    public Branch? FromBranch { get; set; }
    public int? ToWarehouseId { get; set; }
    public Warehouse? ToWarehouse { get; set; }
    public int? ToBranchId { get; set; }
    public Branch? ToBranch { get; set; }
    public StockTransferStatus Status { get; set; } = StockTransferStatus.Draft;
    public DateTime? Eta { get; set; }
    public string? Carrier { get; set; }
    public string? Notes { get; set; }
    public int? ApproverUserId { get; set; }

    public ICollection<StockTransferLine> Lines { get; set; } = new List<StockTransferLine>();
}

public class StockTransferLine
{
    public int Id { get; set; }
    public int TransferId { get; set; }
    public StockTransfer? Transfer { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public decimal Qty { get; set; }
    public decimal UnitCost { get; set; }
    // Actual quantity received at the destination — set on Receive; defaults to the full planned
    // Qty when the caller doesn't supply an actual (keeps the one-click "Receive" flow working).
    public decimal ReceivedQty { get; set; }
    // Optional — only set for shelf-life-sensitive products (cement, paint, sealants). When set,
    // Dispatch/Receive/Cancel also move the matching StockBatch alongside the aggregate StockLevel.
    public string? BatchNo { get; set; }
    public DateTime? ExpiryDate { get; set; }
}

public class StockAdjustment : BaseEntity
{
    public string Reason { get; set; } = string.Empty;
    public int WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public int? ApproverUserId { get; set; }
    public bool EvidenceAttached { get; set; }
    public EntityStatus Status { get; set; } = EntityStatus.Active;

    public ICollection<StockAdjustmentLine> Lines { get; set; } = new List<StockAdjustmentLine>();
}

public class StockAdjustmentLine
{
    public int Id { get; set; }
    public int AdjustmentId { get; set; }
    public StockAdjustment? Adjustment { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public decimal SystemQty { get; set; }
    public decimal CountedQty { get; set; }
    public decimal Variance => CountedQty - SystemQty;
    public string? Note { get; set; }
}
