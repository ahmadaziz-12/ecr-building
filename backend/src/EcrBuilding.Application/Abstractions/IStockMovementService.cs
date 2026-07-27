using EcrBuilding.Domain.Entities;

namespace EcrBuilding.Application.Abstractions;

public interface IStockMovementService
{
    Task RecordAsync(
        int productId,
        int branchId,
        StockMovementType type,
        decimal qty,
        string? refTable = null,
        string? refId = null,
        int? userId = null,
        CancellationToken cancellationToken = default);
}
