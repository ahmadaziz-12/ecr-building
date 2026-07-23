namespace EcrBuilding.Application.Inventory;

public record WarehouseBinDto(int Id, string BinCode, string Label, decimal CapacityTons, decimal FilledTons);
public record WarehouseDto(int Id, string Code, string Name, int BranchId, string BranchName, string Type, string Status, IReadOnlyList<WarehouseBinDto> Bins, int ReservationCount, bool DispatchReady);
public record UpsertWarehouseRequest(string Code, string Name, int BranchId, string Type);

public record StockLevelDto(int ProductId, string Sku, string ProductName, string CategoryName, int WarehouseId, string WarehouseName, decimal OnHand, decimal Reserved, decimal Available, int ReorderLevel, decimal Value, string Status);

public record StockBatchDto(int Id, string Sku, string ProductName, string BatchNo, DateTime ReceivedDate, DateTime ExpiryDate, int DaysLeft, decimal Qty, string WarehouseName, string Status);
public record CreateStockBatchRequest(int ProductId, int WarehouseId, string BatchNo, DateTime ReceivedDate, DateTime ExpiryDate, decimal Qty);

public record StockTransferLineDto(int ProductId, string Sku, string ProductName, decimal Qty, decimal UnitCost);
public record StockTransferDto(int Id, string TransferNo, int FromWarehouseId, string FromWarehouseName, int ToWarehouseId, string ToWarehouseName, string Status, DateTime? Eta, string? Carrier, string? Notes, decimal TotalValue, IReadOnlyList<StockTransferLineDto> Lines);
public record CreateStockTransferRequest(int FromWarehouseId, int ToWarehouseId, DateTime? Eta, string? Carrier, string? Notes, List<TransferLineInput> Lines);
public record TransferLineInput(int ProductId, decimal Qty, decimal UnitCost);

public record StockAdjustmentLineDto(int ProductId, string Sku, decimal SystemQty, decimal CountedQty, decimal Variance, string? Note);
public record StockAdjustmentDto(int Id, string Reason, int WarehouseId, string WarehouseName, DateTime Date, string? ApproverName, bool EvidenceAttached, string Status, IReadOnlyList<StockAdjustmentLineDto> Lines);
public record CreateStockAdjustmentRequest(string Reason, int WarehouseId, DateTime Date, int? ApproverUserId, bool EvidenceAttached, List<AdjustmentLineInput> Lines);
public record AdjustmentLineInput(int ProductId, decimal SystemQty, decimal CountedQty, string? Note);
