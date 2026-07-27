using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

// Numeric values are load-bearing (stored as ints in the DB) — append new members, never renumber.
public enum StockMovementType
{
    Sale = 0,
    Void = 1,
    ReturnRestock = 2,
    ReturnDamage = 3,
    PoReceipt = 4,
    RtsDispatch = 5,
    RtsRestore = 6,
    TransferOut = 7,
    TransferIn = 8,
    Adjustment = 9,
}

// A structured ledger of every event that changed a branch's sellable (BranchStockLevel) stock —
// unlike AuditLog (free-text JSON blob), this carries ProductId/BranchId/Qty as real columns so a
// per-branch "how much went to damage vs sale vs return" report can just query/aggregate it.
// Written alongside the existing AuditLog call at each mutation site, never in place of it.
public class StockMovement : BaseEntity
{
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public StockMovementType Type { get; set; }
    // Signed: positive = stock added to the branch, negative = stock removed.
    public decimal Qty { get; set; }
    public string? RefTable { get; set; }
    public string? RefId { get; set; }
    public int? UserId { get; set; }
}
