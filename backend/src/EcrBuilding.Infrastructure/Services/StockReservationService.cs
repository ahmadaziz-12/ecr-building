using EcrBuilding.Application.Abstractions;
using EcrBuilding.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EcrBuilding.Infrastructure.Services;

public class StockReservationService(AppDbContext db) : IStockReservationService
{
    public async Task<int?> ReserveAsync(int branchId, IEnumerable<(int ProductId, decimal Qty)> lines, CancellationToken ct = default)
    {
        foreach (var (productId, qty) in lines)
        {
            if (qty <= 0) continue;
            // A branch that has never stocked this product (no BranchStockLevel row at all — e.g. a
            // quotation for something not yet received here) isn't a double-sell risk, since there's
            // no real stock to protect yet — left untouched rather than blocking the quote/hold
            // outright. Convert/Checkout's own stock check is still the final gate once real stock
            // exists. Only a row that DOES exist but doesn't have enough available blocks the hold.
            var exists = await db.BranchStockLevels.AnyAsync(s => s.ProductId == productId && s.BranchId == branchId, ct);
            if (!exists) continue;

            // Same Sqlite decimal-in-WHERE-comparison gotcha as OrdersController.Checkout's stock
            // deduction — see the comment there / docs/TESTING.md.
            var reserveQty = (double)qty;
            var rowsAffected = await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE BranchStockLevels SET Reserved = Reserved + {reserveQty} WHERE ProductId = {productId} AND BranchId = {branchId} AND (OnHand - Reserved) >= {reserveQty}",
                ct);
            if (rowsAffected == 0) return productId;
        }
        return null;
    }

    public async Task ReleaseAsync(int branchId, IEnumerable<(int ProductId, decimal Qty)> lines, CancellationToken ct = default)
    {
        foreach (var (productId, qty) in lines)
        {
            if (qty <= 0) continue;
            var releaseQty = (double)qty;
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE BranchStockLevels SET Reserved = Reserved - {releaseQty} WHERE ProductId = {productId} AND BranchId = {branchId} AND Reserved >= {releaseQty}",
                ct);
        }
    }
}
