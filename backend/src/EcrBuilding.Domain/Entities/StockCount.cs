using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

// Numeric values are load-bearing (stored as ints in the DB) — append new members, never renumber.
public enum StockCountStatus
{
    Draft = 0,
    InProgress = 1,
    PendingApproval = 2,
    Completed = 3,
    Cancelled = 4,
}

// What the generator pulls onto the sheet. The whole point of the feature is that nobody types a
// count sheet by hand: pick a scope, and the sheet is materialised from live stock (see
// StockCountsController.Generate).
public enum StockCountScope
{
    FullWarehouse = 0,
    Category = 1,
    LowStock = 2,
    HighValue = 3,
    FastMoving = 4,
}

// A stocktake session: generate a sheet -> count (keyboard or barcode) -> post the variance.
// StockAdjustment stays what it always was (a single free-form correction); a StockCount is the
// governed workflow around it and posts exactly one StockAdjustment at completion, so every
// stocktake still lands in the same ledger/audit trail an ad-hoc adjustment would.
public class StockCount : BaseEntity
{
    public string CountNo { get; set; } = string.Empty;
    public int WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public StockCountScope Scope { get; set; } = StockCountScope.FullWarehouse;
    // Only meaningful when Scope == Category.
    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
    public StockCountStatus Status { get; set; } = StockCountStatus.Draft;

    public DateTime ScheduledFor { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int? CountedByUserId { get; set; }
    public User? CountedBy { get; set; }
    public int? ApprovedByUserId { get; set; }
    public User? ApprovedBy { get; set; }
    public string? Notes { get; set; }

    // Uncounted lines are treated as "matches the system" at post time instead of blocking the
    // post — the standard cycle-count convention, and what makes a partial count usable.
    public bool AutoFillUncounted { get; set; } = true;
    // Blind count: the counter never sees SystemQty (the API omits it from the sheet), so the
    // number they enter isn't anchored to what the system already believes.
    public bool BlindCount { get; set; }

    // Set once the count posts — the StockAdjustment that actually moved the stock.
    public int? StockAdjustmentId { get; set; }
    public StockAdjustment? StockAdjustment { get; set; }

    public ICollection<StockCountLine> Lines { get; set; } = new List<StockCountLine>();
}

public class StockCountLine
{
    public int Id { get; set; }
    public int StockCountId { get; set; }
    public StockCount? StockCount { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    // Snapshotted when the sheet is generated, so a sale mid-count doesn't silently move the
    // baseline the variance is measured against.
    public decimal SystemQty { get; set; }
    // Null until somebody actually counts this line — distinct from a counted zero, which is a
    // real (and usually alarming) finding.
    public decimal? CountedQty { get; set; }
    public decimal UnitCost { get; set; }
    public string? Note { get; set; }
    public DateTime? CountedAt { get; set; }
    public int? CountedByUserId { get; set; }

    public decimal Variance => (CountedQty ?? SystemQty) - SystemQty;
    public decimal VarianceValue => Variance * UnitCost;
}
