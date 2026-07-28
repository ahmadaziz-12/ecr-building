using EcrBuilding.Application.Abstractions;
using EcrBuilding.Domain.Entities;
using EcrBuilding.Infrastructure.Persistence;

namespace EcrBuilding.Infrastructure.Services;

public class StockMovementService(AppDbContext db) : IStockMovementService
{
    public async Task RecordAsync(
        int productId,
        int branchId,
        StockMovementType type,
        decimal qty,
        string? refTable = null,
        string? refId = null,
        int? userId = null,
        int? warehouseId = null,
        CancellationToken cancellationToken = default)
    {
        db.StockMovements.Add(new StockMovement
        {
            ProductId = productId,
            BranchId = branchId,
            WarehouseId = warehouseId,
            Type = type,
            Qty = qty,
            RefTable = refTable,
            RefId = refId,
            UserId = userId,
        });
        await db.SaveChangesAsync(cancellationToken);
    }
}
