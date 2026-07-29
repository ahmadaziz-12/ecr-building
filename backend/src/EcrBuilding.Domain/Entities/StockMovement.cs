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
    WriteOff = 10,
    // A cut-to-size cut created a new tracked Remnant (offcut) instead of merging the leftover back
    // into generic BranchStockLevel.OnHand — informational only (see Remnant entity), exists purely
    // so reporting can see how much offcut a business generates.
    CutRemnantRestock = 11,
    // Cut Optimization: a sale was fulfilled from an existing Remnant instead of cutting fresh bulk
    // stock — informational only, never touches BranchStockLevel (the Remnant's own Qty already
    // carries the deduction), exists so reporting can see how much offcut gets reused vs. wasted.
    RemnantConsumed = 12,
}

// A structured ledger of every event that changed a branch's sellable (BranchStockLevel) stock, or
// (WarehouseId set) a warehouse's own backroom stock (StockLevel/StockBatch) — unlike AuditLog
// (free-text JSON blob), this carries ProductId/BranchId/Qty as real columns so a per-branch "how
// much went to damage vs sale vs return" report can just query/aggregate it. Written alongside the
// existing AuditLog call at each mutation site, never in place of it.
public class StockMovement : BaseEntity
{
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    // Set only for a movement that hit warehouse-side stock (StockLevel/StockBatch) rather than —
    // or in addition to — the branch's own BranchStockLevel. BranchId is still populated (the
    // warehouse's own owning branch) so branch-level reports keep working unchanged.
    public int? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public StockMovementType Type { get; set; }
    // Signed: positive = stock added, negative = stock removed.
    public decimal Qty { get; set; }
    public string? RefTable { get; set; }
    public string? RefId { get; set; }
    public int? UserId { get; set; }
}
