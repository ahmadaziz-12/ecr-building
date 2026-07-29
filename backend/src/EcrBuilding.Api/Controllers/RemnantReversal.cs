using EcrBuilding.Domain.Entities;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Api.Controllers;

// Cut Optimization / Remnants Management: shared by OrdersController.Void/VoidLine and
// FinanceController.Approve (return restocking) — all three used to just blindly restore a
// cut-to-size line's StockQty into BranchStockLevel.OnHand. That silently double-counts (or loses)
// material once remnants are tracked as their own rows: a line that consumed a Remnant never touched
// OnHand at all (the Remnant's own Qty carried the deduction), and a line that created a Remnant from
// its leftover would, if fully un-done, put BOTH the returned cut AND the still-existing offcut back
// into circulation as if they were two separate pieces.
internal static class RemnantReversal
{
    /// <summary>
    /// Reverses whatever a cut-to-size line did to Remnants at sale time (if anything) and returns
    /// the quantity that's still safe to restore into BranchStockLevel.OnHand — 0 for a line that
    /// consumed a Remnant (nothing ever left OnHand for it), the full StockQty for an ordinary line.
    /// </summary>
    public static async Task<decimal> ReverseAsync(AppDbContext db, OrderLine line, CancellationToken ct)
    {
        var onHandRestore = line.StockQty > 0 ? line.StockQty : line.Qty;

        if (line.ConsumedRemnantId is int consumedId)
        {
            var consumed = await db.Remnants.FindAsync([consumedId], ct);
            if (consumed is not null)
            {
                // Undoing this sale undoes whatever it did to the remnant it consumed, INCLUDING a
                // Scrap decision on the leftover — same "the whole transaction never happened"
                // philosophy the pre-existing bulk-stock Void/Return path already applies (see the
                // fresh-cut branch below). Restock left a smaller remnant behind: only safe to fold
                // that back in if it's still untouched — once material moves on in a later,
                // independent sale there's nothing left to undo for it. No child at all (Scrap, or an
                // exact-fit cut with no leftover) is trivially "untouched": there was never anything
                // for another sale to have touched.
                var child = await db.Remnants.FirstOrDefaultAsync(r => r.SourceOrderLineId == line.Id, ct);
                var childUntouched = child is null || (child.Status == RemnantStatus.Available && child.Qty == line.RemnantQty);
                if (childUntouched)
                {
                    if (child is not null) db.Remnants.Remove(child);
                    consumed.Qty += line.SourceQty ?? (line.MeasuredQty ?? line.Qty);
                }
                else
                {
                    consumed.Qty += line.MeasuredQty ?? line.Qty;
                }
                consumed.Status = RemnantStatus.Available;
            }
            return 0m;
        }

        if (line.RemnantQty is > 0 && line.RemnantAction == "Restock")
        {
            var child = await db.Remnants.FirstOrDefaultAsync(r => r.SourceOrderLineId == line.Id, ct);
            var untouched = child is not null && child.Status == RemnantStatus.Available && child.Qty == line.RemnantQty;
            if (untouched)
            {
                db.Remnants.Remove(child!);
                // onHandRestore already equals the full source piece (line.StockQty) — correct as-is,
                // both the returned cut and its never-touched offcut rejoin bulk stock together.
            }
            else
            {
                // The offcut already moved on (partially/fully sold or scrapped elsewhere) — only the
                // physically-returned cut can come back, not the portion tied up in that remnant.
                onHandRestore = line.MeasuredQty ?? line.Qty;
            }
        }

        return onHandRestore;
    }
}
