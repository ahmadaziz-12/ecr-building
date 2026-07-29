using EcrBuilding.Domain.Common;

namespace EcrBuilding.Domain.Entities;

// Numeric values are load-bearing (stored as ints in the DB) — append new members, never renumber.
public enum RemnantStatus
{
    Available = 0,
    Sold = 1,
    Scrapped = 2,
}

// Cut Optimization / Remnants Management: a physically distinct offcut piece left over from a
// cut-to-size sale, tracked as its own sellable unit instead of being silently merged back into the
// product's generic BranchStockLevel.OnHand (which would erase its identity — a cashier could never
// again see "there's a 1.2m offcut of this cable sitting at this branch"). Qty is in the product's
// stock UOM, using the same length/area/volume convention as OrderLine (per Product.CutToSizeUnit).
public class Remnant : BaseEntity
{
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int BranchId { get; set; }
    public Branch? Branch { get; set; }
    public decimal Qty { get; set; }
    public decimal? LengthM { get; set; }
    public decimal? WidthM { get; set; }
    public decimal? HeightM { get; set; }
    public RemnantStatus Status { get; set; } = RemnantStatus.Available;
    // The cut that produced this remnant — null for legacy data only (every remnant going forward is
    // created from a specific sale's leftover). Restrict delete: an OrderLine is never hard-deleted
    // except by VoidLine, which itself deletes the still-untouched remnant it created first (see
    // OrdersController.VoidLine) — never leaves this FK dangling.
    public int? SourceOrderLineId { get; set; }
    public OrderLine? SourceOrderLine { get; set; }
    // Cut Optimization: an optional discount a cashier/manager can attach when the remnant is
    // created, to move offcuts that would otherwise sit unsold (BRD-adjacent — surfaced on the
    // Remnants admin page and applied automatically the moment this piece is sold from, stacking
    // into the same "larger of" discount rule as quantity/promo/manual — see PricingEngine).
    public decimal DiscountPct { get; set; }
    public string? Notes { get; set; }
}
